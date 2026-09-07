import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as db from '../db/index.js';
import { COL } from '../db/firestoreDb.js';
import { isFirestoreBackend } from '../config/database.js';
import { normalizeFileName, normalizeImportedStoragePath } from '../utils/storagePaths.js';

const router = Router();

function toTs(v) {
  if (!v) return null;
  return Timestamp.fromDate(new Date(v));
}

// Fail closed: without MIGRATION_SECRET the destructive import and the
// password-reset helper are disabled, never open to the world.
function migrationAuthorized(req) {
  const secret = process.env.MIGRATION_SECRET;
  if (!secret) return false;
  const provided = String(req.headers['x-migration-secret'] || '');
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/import', async (req, res) => {
  if (!isFirestoreBackend()) {
    return res.status(400).json({ error: 'Import is available only with the Firebase backend.' });
  }

  if (!migrationAuthorized(req)) {
    return res.status(process.env.MIGRATION_SECRET ? 403 : 503).json({
      error: process.env.MIGRATION_SECRET
        ? 'Invalid migration secret.'
        : 'Migration endpoint is disabled on this deployment.',
    });
  }

  const { tables = {}, files = [] } = req.body;
  const stats = {};
  const filesOnly = req.query.files_only === '1';
  const tablesOnly = req.query.tables_only === '1';
  const migrationRunId = String(req.headers['x-migration-run-id'] || `import-${Date.now()}`).trim();
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(migrationRunId)) {
    return res.status(400).json({ error: 'Invalid migration run id.' });
  }
  const migrationPhase = filesOnly ? 'files' : 'tables';
  const migrationManifestId = `${migrationRunId}:${migrationPhase}`;
  await db.importDoc('_migration_runs', migrationManifestId, {
    run_id: migrationRunId,
    phase: migrationPhase,
    status: 'processing',
    updated_at: new Date().toISOString(),
  });

  if (filesOnly) {
    if (!Array.isArray(files) || files.length > 50) {
      return res.status(400).json({ error: 'Files must be sent in batches of at most 50.' });
    }

    const prepared = [];
    for (const file of files) {
      const encoded = String(file?.base64 || '').trim();
      const storagePath = normalizeImportedStoragePath(file?.path);
      if (!storagePath || !encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
        return res.status(400).json({ error: 'Each imported file requires a valid path and base64 payload.' });
      }
      const buffer = Buffer.from(encoded, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'Imported files cannot be empty.' });
      const lowerPath = storagePath.toLowerCase();
      const mime = lowerPath.endsWith('.pdf') ? 'application/pdf'
        : lowerPath.endsWith('.png') ? 'image/png'
          : lowerPath.endsWith('.webp') ? 'image/webp'
            : lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') ? 'image/jpeg'
              : 'application/octet-stream';
      prepared.push({ buffer, storagePath, mime });
    }

    const uploadedPaths = [];
    try {
      for (const item of prepared) {
        await db.storageUpload(item.buffer, item.storagePath, item.mime);
        uploadedPaths.push(item.storagePath);
      }
    } catch (error) {
      await Promise.all(uploadedPaths.map((storagePath) => db.storageDelete(storagePath).catch(() => {})));
      await db.importDoc('_migration_runs', migrationManifestId, {
        status: 'failed',
        error: error.message,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
      throw error;
    }
    await db.importDoc('_migration_runs', migrationManifestId, {
      status: 'completed',
      uploaded: prepared.length,
      updated_at: new Date().toISOString(),
    });
    return res.json({ message: 'Files uploaded.', uploaded: prepared.length });
  }

  if (!tablesOnly && files.length) {
    return res.status(400).json({ error: 'Upload files separately with ?files_only=1' });
  }

  async function importRows(collection, rows, transform) {
    for (const row of rows) {
      await db.importDoc(collection, row.id, transform(row));
    }
    stats[collection] = rows.length;
  }

  async function importRowsByKey(collection, rows, key, transform = (row) => row) {
    for (const row of rows) {
      const id = row?.[key];
      if (id === undefined || id === null || id === '') continue;
      await db.importDoc(collection, id, transform(row));
    }
    stats[collection] = rows.length;
  }

  await importRows(COL.users, tables.users || [], (r) => ({
    name: r.name,
    email: r.email,
    password_hash: r.password_hash,
    role: r.role,
    is_blocked: r.is_blocked,
    avatar_url: r.avatar_url,
    reset_token: r.reset_token,
    reset_token_expires: toTs(r.reset_token_expires),
    created_at: toTs(r.created_at),
    updated_at: toTs(r.updated_at),
    account_type: r.account_type,
    signup_method: r.signup_method,
    signup_source: r.signup_source,
    signup_referrer: r.signup_referrer,
    signup_utm_source: r.signup_utm_source,
    signup_utm_medium: r.signup_utm_medium,
    signup_utm_campaign: r.signup_utm_campaign,
    signup_landing_path: r.signup_landing_path,
    stripe_customer_id: r.stripe_customer_id,
    stripe_subscription_id: r.stripe_subscription_id,
  }));

  await importRows(COL.categories, tables.categories || [], (r) => ({
    name: r.name,
    slug: r.slug,
    description: r.description,
    parent_id: r.parent_id,
    sort_order: r.sort_order,
    nav_visible: r.nav_visible,
    is_archived: r.is_archived,
    created_at: toTs(r.created_at),
    updated_at: toTs(r.updated_at),
  }));

  for (const r of tables.resources || []) {
    let cover = r.cover_image;
    if (cover?.startsWith('/uploads/')) {
      cover = cover;
    }
    await db.importDoc(COL.resources, r.id, {
      title: r.title,
      slug: r.slug,
      description: r.description,
      content_description: r.content_description,
      age_range: r.age_range,
      category_id: r.category_id,
      cover_image: cover,
      cover_hidden: r.cover_hidden,
      display_mode: r.display_mode || 'default',
      download_limit_max: r.download_limit_max,
      download_limit_period: r.download_limit_period,
      keywords: r.keywords,
      action_visibility: r.action_visibility,
      grade_level: r.grade_level,
      material_type: r.material_type,
      google_slides_url: r.google_slides_url,
      canva_url: r.canva_url,
      page_layout: r.page_layout,
      is_published: r.is_published,
      is_archived: r.is_archived,
      sort_order: r.sort_order,
      is_premium: r.is_premium,
      school_only: r.school_only,
      view_count: r.view_count || 0,
      download_count: r.download_count || 0,
      created_by: r.created_by,
      created_at: toTs(r.created_at),
      updated_at: toTs(r.updated_at),
    });
  }
  stats[COL.resources] = (tables.resources || []).length;

  for (const f of tables.resource_files || []) {
    await db.importDoc(COL.files, f.id, {
      resource_id: f.resource_id,
      file_name: normalizeFileName(f.file_name),
      original_name: f.original_name,
      label: f.label,
      sort_order: f.sort_order || 0,
      is_archived: f.is_archived || 0,
      file_type: f.file_type === 'presentation' ? 'pptx' : f.file_type,
      file_size: f.file_size,
      mime_type: f.mime_type,
      is_primary: f.is_primary,
      is_bundle: f.is_bundle || 0,
      premium_only: f.premium_only || 0,
      thumbnail: f.thumbnail,
      created_at: toTs(f.created_at),
    });
  }
  stats[COL.files] = (tables.resource_files || []).length;

  for (const s of tables.settings || []) {
    await db.settingsUpsert(s.setting_key, s.setting_value ?? '');
  }
  stats.settings = (tables.settings || []).length;

  await importRows(COL.downloads, tables.downloads || [], (r) => ({
    resource_id: r.resource_id,
    file_id: r.file_id,
    user_id: r.user_id,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    request_id: r.request_id,
    status: r.status,
    reserved_until: toTs(r.reserved_until),
    completed_at: toTs(r.completed_at),
    created_at: toTs(r.created_at),
  }));

  for (const f of tables.favorites || []) {
    await db.importDoc(COL.favorites, `${f.user_id}_${f.resource_id}`, {
      user_id: f.user_id,
      resource_id: f.resource_id,
      folder_id: f.folder_id || null,
      created_at: toTs(f.created_at),
    });
  }
  stats.favorites = (tables.favorites || []).length;

  await importRows(COL.plans, tables.plans || [], (r) => ({
    name: r.name,
    slug: r.slug,
    description: r.description,
    price: r.price,
    interval_type: r.interval_type,
    is_active: r.is_active,
    created_at: toTs(r.created_at),
  }));

  await importRows(COL.subscriptions, tables.subscriptions || [], (r) => ({
    user_id: r.user_id,
    plan_id: r.plan_id,
    status: r.status,
    tier: r.tier,
    starts_at: toTs(r.starts_at),
    ends_at: toTs(r.ends_at),
    renewal_reminder_sent_at: toTs(r.renewal_reminder_sent_at),
    created_at: toTs(r.created_at),
  }));

  await importRows(COL.pageViews, tables.page_views || [], (r) => ({
    path: r.path,
    page_title: r.page_title,
    referrer: r.referrer,
    user_agent: r.user_agent,
    session_id: r.session_id,
    created_at: toTs(r.created_at),
  }));

  await importRowsByKey(COL.favoriteFolders, tables.favorite_folders || [], 'id', (r) => ({
    user_id: r.user_id,
    name: r.name,
    is_default: !!r.is_default,
    created_at: toTs(r.created_at),
  }));

  await importRowsByKey(COL.downloadIntents, tables.download_intents || [], 'id', (r) => ({
    resource_id: r.resource_id,
    file_id: r.file_id,
    user_id: r.user_id,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    created_at: toTs(r.created_at),
  }));

  await importRowsByKey(COL.editorUploadSessions, tables.editor_upload_sessions || [], 'upload_id', (r) => ({
    upload_id: r.upload_id,
    owner_id: r.owner_id,
    name: r.name,
    mime_type: r.mime_type,
    size: r.size ?? r.size_bytes,
    kind: r.kind,
    chunk_size: r.chunk_size,
    storage_path: r.storage_path,
    session_url: r.session_url,
    staged_path: r.staged_path,
    status: r.status,
    received_bytes: r.received_bytes,
    last_chunk: r.last_chunk,
    expires_at: toTs(r.expires_at),
    created_at: toTs(r.created_at),
    updated_at: toTs(r.updated_at),
  }));

  await importRowsByKey(COL.interactionEvents, tables.analytics_interactions || [], 'id', (r) => ({
    event_key: r.event_key,
    event_name: r.event_name,
    resource_id: r.resource_id,
    file_id: r.file_id,
    resource_title: r.resource_title,
    file_label: r.file_label,
    page_index: r.page_index,
    path: r.path,
    session_id: r.session_id,
    user_id: r.user_id,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    created_at: toTs(r.created_at),
  }));

  await importRowsByKey(COL.stripeWebhookEvents, tables.stripe_webhook_events || [], 'event_id', (r) => ({
    event_id: r.event_id,
    status: r.status,
    created_at: toTs(r.created_at),
    completed_at: toTs(r.completed_at),
  }));

  await importRowsByKey(COL.contactMessages, tables.contact_messages || [], 'id', (r) => ({
    name: r.name,
    email: r.email,
    message: r.message,
    status: r.status,
    read_at: toTs(r.read_at),
    notification_status: r.notification_status,
    created_at: toTs(r.created_at),
  }));

  // These tables are not part of the current application adapter. Keep them
  // in an explicit namespace instead of silently dropping valid legacy data.
  for (const table of ['comments', 'tags', 'payments']) {
    await importRowsByKey(`legacy_${table}`, tables[table] || [], 'id', (row) => row);
  }
  const legacyResourceTags = tables.resource_tags || [];
  for (const row of legacyResourceTags) {
    const id = `${row.resource_id ?? 'resource'}_${row.tag_id ?? 'tag'}`;
    await db.importDoc('legacy_resource_tags', id, row);
  }
  stats.legacy_resource_tags = legacyResourceTags.length;

  const counters = {
    users: Math.max(0, ...(tables.users || []).map((r) => r.id)),
    categories: Math.max(0, ...(tables.categories || []).map((r) => r.id)),
    resources: Math.max(0, ...(tables.resources || []).map((r) => r.id)),
    resource_files: Math.max(0, ...(tables.resource_files || []).map((r) => r.id)),
    downloads: Math.max(0, ...(tables.downloads || []).map((r) => r.id)),
    plans: Math.max(0, ...(tables.plans || []).map((r) => r.id)),
    subscriptions: Math.max(0, ...(tables.subscriptions || []).map((r) => r.id)),
    page_views: Math.max(0, ...(tables.page_views || []).map((r) => r.id)),
    favorite_folders: Math.max(0, ...(tables.favorite_folders || []).map((r) => r.id)),
    download_intents: Math.max(0, ...(tables.download_intents || []).map((r) => r.id)),
    analytics_interactions: Math.max(0, ...(tables.analytics_interactions || []).map((r) => r.id)),
  };
  for (const [name, seq] of Object.entries(counters)) {
    if (seq > 0) await db.setCounter(name, seq);
  }

  await db.importDoc('_migration_runs', migrationManifestId, {
    status: 'completed',
    stats,
    counters,
    updated_at: new Date().toISOString(),
  });
  res.json({ message: 'Import completed.', stats, counters, migrationRunId });
});

router.post('/reset-password', async (req, res) => {
  if (!migrationAuthorized(req)) {
    return res.status(process.env.MIGRATION_SECRET ? 403 : 503).json({
      error: process.env.MIGRATION_SECRET
        ? 'Invalid migration secret.'
        : 'Migration endpoint is disabled on this deployment.',
    });
  }

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await db.userFindByEmail(String(email).trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const password_hash = await bcrypt.hash(password, 10);
  await db.userUpdate(user.id, { password_hash });

  res.json({ message: `Password updated for ${user.email}.` });
});

export default router;
