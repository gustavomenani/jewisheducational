import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import * as db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { isFirestoreBackend } from '../config/database.js';
import { assertCanDownload, getDownloadQuota } from '../utils/downloadLimits.js';
import { getUserAccess } from '../utils/access.js';
import { getPaywallSettings } from '../utils/paywall.js';
import { isPresentationFile } from '../utils/presentationFiles.js';
import { normalizeBundleFiles } from '../utils/resourceFiles.js';
import { normalizeFileStoragePath } from '../utils/storagePaths.js';

const router = Router();

function contentDisposition(type, filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function resolveStoragePath(file) {
  const storagePath = normalizeFileStoragePath(file.file_name);
  if (isFirestoreBackend()) return storagePath;
  return db.localPathToStorage(`/uploads/${storagePath}`);
}

function getDownloadRequestId(req) {
  const supplied = String(req.get('x-download-request-id') || '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

function waitForRetry(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function completeDeliveredDownload({ requestId, resourceId, resource, file, req }) {
  let completed = false;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      completed = await db.downloadComplete(requestId, resourceId);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await waitForRetry(25 * (attempt + 1));
    }
  }
  if (lastError) {
    // Keep the reservation alive until its TTL rather than releasing a slot
    // after bytes were delivered. A later retry can safely complete it.
    console.error('[Downloads] Could not finalize delivered download:', lastError.message);
    return;
  }
  if (!completed) return;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await db.interactionEventCreate({
        event_key: `download_completed:${requestId}`,
        event_name: 'download_completed',
        resource_id: resourceId,
        file_id: file.id,
        resource_title: resource?.title || null,
        file_label: file.label || file.original_name || null,
        user_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.get('user-agent')?.slice(0, 500) || null,
        path: `/resource/${resource?.slug || resourceId}/download/${file.id}`,
      });
      return;
    } catch (error) {
      if (attempt === 2) console.error('[Analytics] Could not record download_completed:', error.message);
      else await waitForRetry(25 * (attempt + 1));
    }
  }
}

async function withBundleMetadata(file) {
  if (!file?.resource_id) return file;
  try {
    const files = normalizeBundleFiles(await db.filesByResource(file.resource_id));
    const metadata = files.find((candidate) => String(candidate.id) === String(file.id));
    return metadata ? { ...file, ...metadata } : file;
  } catch {
    return file;
  }
}

async function resourceIsPublic(resource, user) {
  if (!resource) return false;
  if (user?.role === 'admin') return true;
  if (!resource.is_published || resource.is_archived) return false;
  if (!resource.category_id) return true;
  const categories = await db.categoryListAll();
  const byId = new Map(categories.map((category) => [Number(category.id), category]));
  const visited = new Set();
  let current = byId.get(Number(resource.category_id));
  while (current) {
    const id = Number(current.id);
    if (visited.has(id) || current.is_archived) return false;
    visited.add(id);
    current = current.parent_id ? byId.get(Number(current.parent_id)) : null;
  }
  return true;
}

router.get('/quota', authenticate, async (req, res) => {
  const resourceId = req.query.resource_id ? Number(req.query.resource_id) : null;
  const quota = await getDownloadQuota(req.user, resourceId);
  const paywall = await getPaywallSettings();
  res.json({ quota, paywall });
});

router.get('/history', authenticate, async (req, res) => {
  const downloads = await db.downloadsByUser(req.user.id);
  res.json({ downloads });
});

router.get('/prepare/:resourceId/:fileId', authenticate, async (req, res) => {
  let file = await db.fileFindByIdAndResource(req.params.fileId, req.params.resourceId);
  if (!file || (file.is_archived && req.user?.role !== 'admin') || (!file.is_published && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'File not found.' });
  }
  file = await withBundleMetadata(file);
  const resource = await db.resourceFindById(file.resource_id);
  if (!(await resourceIsPublic(resource, req.user))) {
    return res.status(404).json({ error: 'Material not found.' });
  }
  const quota = await getDownloadQuota(req.user, file.resource_id);
  const paywall = await getPaywallSettings();
  res.json({
    resource: {
      id: resource.id,
      title: resource.title,
      slug: resource.slug,
      cover_image: resource.cover_image,
      school_only: !!resource.school_only,
    },
    file: {
      id: file.id,
      label: file.label,
      original_name: file.original_name,
      mime_type: file.mime_type,
      is_bundle: !!file.is_bundle,
      premium_only: !!file.premium_only,
    },
    quota,
    paywall,
  });
});

router.post('/intent/:resourceId/:fileId', authenticate, async (req, res) => {
  const file = await db.fileFindByIdAndResource(req.params.fileId, req.params.resourceId);
  if (!file || (file.is_archived && req.user?.role !== 'admin') || (!file.is_published && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'File not found.' });
  }
  if (!(await resourceIsPublic(await db.resourceFindById(file.resource_id), req.user))) {
    return res.status(404).json({ error: 'Material not found.' });
  }
  await db.downloadIntentCreate({
    resource_id: file.resource_id,
    file_id: file.id,
    user_id: req.user.id,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });
  res.json({ ok: true });
});

router.get('/:resourceId/:fileId', authenticate, async (req, res) => {
  let file = await db.fileFindByIdAndResource(req.params.fileId, req.params.resourceId);

  if (!file || (file.is_archived && req.user?.role !== 'admin') || (!file.is_published && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'File not found.' });
  }
  file = await withBundleMetadata(file);

  if (isPresentationFile(file) && req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'This presentation is available to view on the site only.',
      code: 'VIEW_ONLY_PRESENTATION',
    });
  }

  const resource = await db.resourceFindById(file.resource_id);
  if (!(await resourceIsPublic(resource, req.user))) {
    return res.status(404).json({ error: 'Material not found.' });
  }
  const access = await getUserAccess(req.user);

  // Materiais exclusivos do plano Escola: só nível escola (ou admin) baixa.
  if (resource?.school_only && !access.school) {
    const paywall = await getPaywallSettings();
    return res.status(402).json({
      error: 'This material is available only to School plan subscribers.',
      code: 'SCHOOL_REQUIRED',
      paywall,
    });
  }

  const needsPremium = file.premium_only || file.is_bundle;
  if (needsPremium && !access.premium) {
    const paywall = await getPaywallSettings();
    return res.status(402).json({
      error: file.is_bundle
        ? 'The full PDF (all letters together) is available only to Premium subscribers.'
        : 'This file is available only to Premium subscribers.',
      code: 'PREMIUM_REQUIRED',
      isBundle: !!file.is_bundle,
      paywall,
    });
  }

  const limitCheck = await assertCanDownload(req.user, file.resource_id);
  if (!limitCheck.ok) {
    const paywall = await getPaywallSettings();
    return res.status(429).json({
      error: limitCheck.message,
      code: 'DOWNLOAD_LIMIT',
      quota: limitCheck.quota,
      resetMessage: limitCheck.resetMessage,
      paywall,
    });
  }

  const storagePath = await resolveStoragePath(file);
  const stream = await db.storageDownloadStream(storagePath);
  if (!stream) {
    return res.status(404).json({ error: 'File was not found on the server.' });
  }

  const requestId = getDownloadRequestId(req);
  let reservation;
  try {
    reservation = await db.downloadReserve({
      request_id: requestId,
      resource_id: file.resource_id,
      file_id: file.id,
      user_id: req.user.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent')?.slice(0, 500) || null,
      max: limitCheck.quota?.unlimited ? 0 : limitCheck.quota?.max,
      period: limitCheck.quota?.period || 'month',
      mode: limitCheck.quota?.mode || 'global',
    });
  } catch (error) {
    stream.destroy();
    if (error.code === 'DOWNLOAD_LIMIT' || error.status === 429) {
      const quota = await getDownloadQuota(req.user, file.resource_id);
      const paywall = await getPaywallSettings();
      return res.status(429).json({
        error: 'Download limit reached.',
        code: 'DOWNLOAD_LIMIT',
        quota,
        resetMessage: quota.resetMessage,
        paywall,
      });
    }
    console.error('[Downloads] Could not reserve quota:', error);
    return res.status(503).json({ error: 'Download is temporarily unavailable. Please try again.' });
  }

  if (reservation?.alreadyCompleted || reservation?.alreadyReserved) {
    stream.destroy();
    return res.status(409).json({
      error: 'This download request was already processed.',
      code: 'DOWNLOAD_ALREADY_PROCESSED',
    });
  }

  // Record the start only after access, quota and storage checks pass.  This
  // keeps the internal report useful without ever blocking a valid download
  // when analytics storage is temporarily unavailable.
  try {
    await db.interactionEventCreate({
      event_key: `download_started:${requestId}`,
      event_name: 'download_started',
      resource_id: file.resource_id,
      file_id: file.id,
      resource_title: resource?.title || null,
      file_label: file.label || file.original_name || null,
      user_id: req.user.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent')?.slice(0, 500) || null,
      path: `/resource/${resource?.slug || req.params.resourceId}/download/${file.id}`,
    });
  } catch (error) {
    console.warn('[Analytics] Could not record download_started:', error.message);
  }

  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', contentDisposition('attachment', file.original_name));
  let delivered = false;
  const releaseReservation = async () => {
    if (delivered) return;
    try {
      await db.downloadRelease(requestId);
    } catch (error) {
      console.warn('[Downloads] Could not release quota reservation:', error.message);
    }
  };
  res.once('finish', async () => {
    delivered = res.statusCode >= 200 && res.statusCode < 300;
    if (!delivered) return releaseReservation();
    await completeDeliveredDownload({
      requestId,
      resourceId: file.resource_id,
      resource,
      file,
      req,
    });
  });
  res.once('close', () => {
    if (!delivered) void releaseReservation();
  });
  stream.once('error', () => {
    void releaseReservation();
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });
  stream.pipe(res);
});

router.get('/view/:resourceId/:fileId', authenticate, async (req, res) => {
  let file = await db.fileFindByIdAndResource(req.params.fileId, req.params.resourceId);

  if (!file || (file.is_archived && req.user?.role !== 'admin') || (!file.is_published && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'File not found.' });
  }
  file = await withBundleMetadata(file);

  const resource = await db.resourceFindById(file.resource_id);
  if (!(await resourceIsPublic(resource, req.user))) {
    return res.status(404).json({ error: 'Material not found.' });
  }
  const access = await getUserAccess(req.user);
  if (resource?.school_only && !access.school) {
    return res.status(402).json({
      error: 'This resource is available only to School plan subscribers.',
      code: 'SCHOOL_REQUIRED',
    });
  }

  const needsPremium = file.premium_only || file.is_bundle;
  if (needsPremium && !access.premium) {
    const paywall = await getPaywallSettings();
    return res.status(402).json({
      error: file.is_bundle
        ? 'The full PDF (all letters together) is available only to Premium subscribers.'
        : 'This file is available only to Premium subscribers.',
      code: 'PREMIUM_REQUIRED',
      isBundle: !!file.is_bundle,
      paywall,
    });
  }

  // Viewing the protected PDF is still an access to the material. It does
  // not reserve or consume a download, but must respect the same quota so a
  // user cannot bypass the limit by repeatedly opening the preview endpoint.
  const limitCheck = await assertCanDownload(req.user, file.resource_id);
  if (!limitCheck.ok) {
    const paywall = await getPaywallSettings();
    return res.status(429).json({
      error: limitCheck.message,
      code: 'DOWNLOAD_LIMIT',
      quota: limitCheck.quota,
      resetMessage: limitCheck.resetMessage,
      paywall,
    });
  }

  const storagePath = await resolveStoragePath(file);
  const stream = await db.storageDownloadStream(storagePath);
  if (!stream) {
    return res.status(404).json({ error: 'File not found on the server.' });
  }

  res.setHeader('Content-Type', file.mime_type || 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition('inline', file.original_name));
  res.setHeader('Cache-Control', 'private, no-store');
  stream.pipe(res);
});

export default router;
