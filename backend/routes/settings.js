import { Router } from 'express';
import path from 'node:path';
import * as db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { settingsToObject } from '../utils/helpers.js';
import { upload, processUploadedFile, uploadDir } from '../middleware/upload.js';
import {
  isValidContactEmail,
  isValidContactRedirect,
  normalizeRedirectDelay,
} from '../utils/contactConfig.js';
import { resolveCanvaSourceUrl } from '../utils/canva.js';

const router = Router();

const SENSITIVE_SETTING_KEYS = new Set(['paypal_client_secret']);
const NEUTRAL_CONTACT_LEAD = 'Questions, suggestions or school partnerships — send us a message.';
const LEGACY_AI_CONTACT_LEADS = new Set([
  'This digital material was created with AI assistance. If you spot an error, please let us know so we can correct it. Thank you!',
  'This digital material was created with AI assistance. If you spot an error, please let us know so we can correct it. Thank you.',
]);
const PUBLIC_IMAGE_SETTING_KEYS = new Set([
  'site_logo',
  'home_hero_image',
  'hero_bg_image',
  'section_potential_image',
  'section_access_bg_image',
  'section_access_mascot_image',
  'section_contact_image',
  'section_contact_background',
]);

function settingImageStoragePath(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.startsWith('/uploads/')) {
    const pathValue = raw.slice('/uploads/'.length);
    return /^(?:files|covers)\/[^/]+$/i.test(pathValue) ? pathValue : null;
  }
  try {
    const segments = decodeURIComponent(new URL(raw).pathname)
      .split('/')
      .filter(Boolean)
      .map((item) => decodeURIComponent(item));
    const storageIndex = segments.findIndex((item) => /^(?:files|covers)$/i.test(item));
    if (storageIndex < 0) return null;
    const storagePath = segments.slice(storageIndex).join('/');
    return /^(?:files|covers)\/[^/]+$/i.test(storagePath) ? storagePath : null;
  } catch {
    return null;
  }
}

function settingImageContentType(storagePath, metadata) {
  if (metadata?.contentType) return metadata.contentType;
  const extension = path.extname(storagePath || '').toLowerCase();
  return extension === '.jpg' || extension === '.jpeg'
    ? 'image/jpeg'
    : extension === '.webp'
      ? 'image/webp'
      : 'image/png';
}

function publicSettings(rows) {
  const obj = settingsToObject(rows);
  SENSITIVE_SETTING_KEYS.forEach((key) => delete obj[key]);
  for (const key of PUBLIC_IMAGE_SETTING_KEYS) {
    const storagePath = settingImageStoragePath(obj[key]);
    // Older editor uploads were placed in the private `files/` area. Keep
    // those images renderable through a narrowly scoped public proxy until
    // the setting is replaced by a new upload in `covers/`.
    if (storagePath?.startsWith('files/')) obj[key] = `/api/settings/media/${encodeURIComponent(key)}`;
  }
  const normalizedContact = String(obj.section_contact_lead || '').replace(/\s+/g, ' ').trim();
  if (LEGACY_AI_CONTACT_LEADS.has(normalizedContact)) obj.section_contact_lead = NEUTRAL_CONTACT_LEAD;
  return obj;
}

function coverStoragePath(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw.startsWith('/uploads/')) {
    const pathValue = raw.slice('/uploads/'.length);
    return pathValue.startsWith('covers/') ? pathValue : null;
  }
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname);
    const segments = pathname.split('/').filter(Boolean);
    const coverIndex = segments.indexOf('covers');
    if (coverIndex < 0) return null;
    const pathValue = segments.slice(coverIndex).join('/');
    return pathValue.startsWith('covers/') ? pathValue : null;
  } catch {
    return null;
  }
}

router.get('/', async (req, res) => {
  const rows = await db.settingsGetAll();
  res.json({ settings: publicSettings(rows) });
});

router.get('/media/:key', async (req, res) => {
  const key = String(req.params.key || '');
  if (!PUBLIC_IMAGE_SETTING_KEYS.has(key)) return res.status(404).end();
  const rows = await db.settingsGetByKeys([key]);
  const value = rows[0]?.setting_value;
  const storagePath = settingImageStoragePath(value);
  if (!storagePath) return res.status(404).end();
  const stream = await db.storageDownloadStream(storagePath);
  if (!stream) return res.status(404).end();
  const metadata = await db.storageStat(storagePath);
  res.set('Content-Type', settingImageContentType(storagePath, metadata));
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  });
  return stream.pipe(res);
});

router.put('/', authenticate, requireAdmin, async (req, res) => {
  const payload = req.body.settings || req.body;
  if (Object.hasOwn(payload, 'home_canva_url')) {
    const requested = String(payload.home_canva_url || '').trim();
    const normalized = requested ? await resolveCanvaSourceUrl(requested) : '';
    if (requested && !normalized) {
      return res.status(400).json({ error: 'Enter a public Canva view, edit, embed, or canva.link URL.' });
    }
    payload.home_canva_url = normalized;
  }
  if (
    Object.hasOwn(payload, 'contact_notify_email')
    && !isValidContactEmail(payload.contact_notify_email)
  ) {
    return res.status(400).json({ error: 'Enter a valid contact notification email.' });
  }
  if (
    Object.hasOwn(payload, 'contact_redirect_url')
    && !isValidContactRedirect(payload.contact_redirect_url)
  ) {
    return res.status(400).json({ error: 'Contact redirect must be a site path or a complete HTTPS URL.' });
  }
  if (Object.hasOwn(payload, 'contact_redirect_delay')) {
    const rawDelay = Number(payload.contact_redirect_delay);
    if (!Number.isInteger(rawDelay) || rawDelay < 0 || rawDelay > 10) {
      return res.status(400).json({ error: 'Contact redirect delay must be between 0 and 10 seconds.' });
    }
    payload.contact_redirect_delay = String(normalizeRedirectDelay(rawDelay));
  }

  const entries = Object.entries(payload);
  for (const [key, value] of entries) {
    await db.settingsUpsert(key, value ?? '');
  }
  const rows = await db.settingsGetAll();
  res.json({ settings: publicSettings(rows) });
});

router.post('/upload', authenticate, requireAdmin, upload.settingsImage(), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  if (!req.file.mimetype.startsWith('image/')) {
    try {
      const relative = req.file.path ? path.relative(uploadDir, req.file.path).replaceAll('\\', '/') : req.file.storagePath;
      if (relative) await db.storageDelete(relative);
    } catch { /* best effort cleanup */ }
    return res.status(400).json({ error: 'Please upload images only (JPG, PNG, or WebP).' });
  }
  await processUploadedFile(req.file);
  const url = req.file.publicUrl || `/uploads/covers/${req.file.filename}`;
  res.json({ url });
});

router.delete('/upload', authenticate, requireAdmin, async (req, res) => {
  const storagePath = coverStoragePath(req.body?.url);
  if (!storagePath) return res.status(400).json({ error: 'Invalid image upload.' });
  await db.storageDelete(storagePath);
  res.json({ ok: true });
});

export default router;
