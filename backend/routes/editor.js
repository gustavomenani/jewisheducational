import { Router, raw } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { contentMatchesType, getFileType, processUploadedFiles, upload, EXT_BY_MIME } from '../middleware/upload.js';
import { settingsToObject, uniqueSlug } from '../utils/helpers.js';
import { isFirestoreBackend } from '../config/database.js';
import { bucket } from '../config/firebaseAdmin.js';
import { SITE_DOCUMENT_KEY, validateSiteDocumentPayload } from '../utils/siteDocument.js';
import { resolveCanvaSourceUrl } from '../utils/canva.js';

const router = Router();
const EDITOR_UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
const EDITOR_FILE_LIMIT = 50 * 1024 * 1024;
const EDITOR_IMAGE_LIMIT = 10 * 1024 * 1024;
const EDITOR_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const editorUploadRoot = path.join(process.env.UPLOAD_DIR || 'uploads', 'editor-staging');

export function publicationErrorStatus(error) {
  if (error?.status) return error.status;
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'DB_UNAVAILABLE'].includes(error?.code)) {
    return 503;
  }
  return 500;
}

function publicationInputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function editorUploadPath(userId, uploadId) {
  return `editor-staging/${String(userId)}/${String(uploadId)}`;
}

function editorUploadDiskPath(userId, uploadId) {
  return path.join(editorUploadRoot, String(userId), String(uploadId));
}

function uploadIdIsValid(uploadId) {
  return /^[0-9a-f-]{20,}$/i.test(String(uploadId || ''));
}

function uploadSessionSize(session) {
  return Number(session?.size ?? session?.size_bytes) || 0;
}

function uploadSessionKind(session) {
  return session?.kind === 'cover' ? 'cover' : 'file';
}

function uploadSessionExpiry() {
  return new Date(Date.now() + EDITOR_UPLOAD_TTL_MS);
}

function parseContentRange(value) {
  const match = String(value || '').match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
}

function assertChunkRange(session, buffer, headers) {
  const size = uploadSessionSize(session);
  const chunkSize = Number(session.chunk_size) || EDITOR_UPLOAD_CHUNK_SIZE;
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > chunkSize) {
    const error = new Error('Invalid upload chunk.');
    error.status = 400;
    throw error;
  }
  const range = parseContentRange(headers['content-range']);
  const indexHeader = headers['x-chunk-index'];
  const inferredIndex = range ? Math.floor(range.start / chunkSize) : 0;
  const part = Number(indexHeader ?? inferredIndex);
  if (!Number.isInteger(part) || part < 0) {
    const error = new Error('Invalid upload chunk index.');
    error.status = 400;
    throw error;
  }
  const start = range ? range.start : part * chunkSize;
  const end = range ? range.end : (start + buffer.length - 1);
  if (!range || range.total !== size || range.end < range.start || end - start + 1 !== buffer.length) {
    const error = new Error('Content-Range must match the upload size and chunk length.');
    error.status = 400;
    throw error;
  }
  if (start !== part * chunkSize || start < 0 || end >= size) {
    const error = new Error('Upload chunk is outside the declared file range.');
    error.status = 400;
    throw error;
  }
  return { part, start, end, total: size };
}

function validateEditorUpload({ name, mimeType, size, kind }) {
  const image = String(mimeType || '').startsWith('image/');
  const allowed = image
    ? ['image/jpeg', 'image/png', 'image/webp'].includes(String(mimeType))
    : ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(String(mimeType))
      || /\.(pdf|docx|ppt|pptx)$/i.test(String(name || ''));
  if (!allowed) { const error = new Error('File type not allowed.'); error.status = 400; throw error; }
  if (kind === 'cover' && !image) { const error = new Error('A cover must be a JPG, PNG or WEBP image.'); error.status = 400; throw error; }
  const max = image ? EDITOR_IMAGE_LIMIT : EDITOR_FILE_LIMIT;
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > max) { const error = new Error(`File is too large. The limit is ${Math.round(max / (1024 * 1024))} MB.`); error.status = 400; throw error; }
}

function normalizedEditorMime(name, mimeType) {
  const current = String(mimeType || '');
  if (current && current !== 'application/octet-stream') return current;
  const extension = path.extname(String(name || '')).toLowerCase();
  return ({
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  })[extension] || current;
}

async function readStoragePrefix(storagePath, maxBytes = 2048) {
  const stream = await db.storageDownloadStream(storagePath);
  if (!stream) return null;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;
    const finish = (error = null) => {
      if (finished) return;
      finished = true;
      if (typeof stream.pause === 'function') stream.pause();
      if (typeof stream.destroy === 'function' && !stream.destroyed) stream.destroy();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks).subarray(0, maxBytes));
    };
    stream.on('data', (chunk) => {
      if (finished) return;
      const buffer = Buffer.from(chunk);
      const remaining = Math.max(0, maxBytes - total);
      if (remaining) chunks.push(buffer.subarray(0, remaining));
      total += buffer.length;
      if (total >= maxBytes) finish();
    });
    stream.on('end', () => finish());
    stream.on('error', (error) => finish(error));
  });
}

async function assertStoredUploadContent(storagePath, mimeType) {
  const prefix = await readStoragePrefix(storagePath);
  if (!prefix) {
    const error = new Error('Upload content could not be read.');
    error.status = 503;
    throw error;
  }
  if (!contentMatchesType(prefix, mimeType)) {
    const error = new Error('File content does not match the declared type.');
    error.status = 400;
    error.code = 'INVALID_UPLOAD_CONTENT';
    throw error;
  }
}

export const DEFAULT_QUICK_TOPICS = [
  { id: 'aleph-bet', label: 'Aleph-Bet', targetType: 'search', target: '/library?q=hebrew', icon: 'bi bi-translate', visible: true, sortOrder: 0 },
  { id: 'parashah', label: 'Parashah', targetType: 'search', target: '/library?q=parashah', icon: 'bi bi-book', visible: true, sortOrder: 1 },
  { id: 'chanukah', label: 'Chanukah', targetType: 'search', target: '/library?q=chanukah', icon: 'bi bi-stars', visible: true, sortOrder: 2 },
  { id: 'coloring', label: 'Coloring', targetType: 'search', target: '/library?q=coloring', icon: 'bi bi-palette', visible: true, sortOrder: 3 },
  { id: 'torah', label: 'Torah', targetType: 'search', target: '/library?q=torah', icon: 'bi bi-journal-bookmark', visible: true, sortOrder: 4 },
  { id: 'view-all', label: 'View all', targetType: 'url', target: '/library', icon: 'bi bi-collection', visible: true, sortOrder: 5 },
];

const CATEGORY_FIELDS = ['name', 'description', 'parent_id', 'sort_order', 'nav_visible', 'is_archived'];
const MATERIAL_FIELDS = [
  'title', 'description', 'content_description', 'age_range', 'keywords', 'grade_level',
  'material_type', 'category_id', 'cover_image', 'cover_hidden', 'display_mode', 'download_limit_max',
  'download_limit_period', 'school_only', 'page_layout', 'is_published', 'is_archived', 'sort_order',
  'action_visibility',
];

const CATEGORY_TEXT_FIELDS = {
  name: { required: true, limit: 180 },
  description: { limit: 8000 },
};

const MATERIAL_TEXT_FIELDS = {
  title: { required: true, limit: 220 },
  description: { limit: 8000 },
  content_description: { limit: 30000 },
  age_range: { limit: 160 },
  keywords: { limit: 1000 },
  grade_level: { limit: 160 },
  material_type: { limit: 160 },
};

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function getId(result) {
  if (result && result.insertId !== undefined) return result.insertId;
  return result?.id;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeQuickTopics(value) {
  const source = Array.isArray(value) ? value : DEFAULT_QUICK_TOPICS;
  return source
    .map((item, index) => ({
      id: String(item?.id || `topic-${index + 1}`),
      label: String(item?.label || '').trim(),
      targetType: ['category', 'search', 'url'].includes(item?.targetType) ? item.targetType : 'url',
      target: String(item?.target || '/library').trim() || '/library',
      icon: String(item?.icon || 'bi bi-folder2'),
      visible: asBool(item?.visible, true),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    }))
    .filter((item) => item.label)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

async function resolveQuickTopicTargets(topics, clientIds) {
  const list = normalizeQuickTopics(topics);
  return Promise.all(list.map(async (topic) => {
    if (topic.targetType !== 'category') return topic;
    const resolvedId = resolveId(topic.target, clientIds);
    const category = resolvedId ? await db.categoryFindById(resolvedId) : null;
    // Store a stable slug when possible. This makes a topic linked to a
    // category created in the same Publish survive the temporary client ID.
    return category ? { ...topic, target: category.slug || String(category.id) } : topic;
  }));
}

function pickFields(source, fields) {
  const result = {};
  fields.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) result[key] = source[key];
  });
  return result;
}

// The canvas always sends plain text. Keep the same contract at the API edge
// so an editor draft cannot persist arbitrary values into visible copy fields.
function normalizeEditorTextFields(next, fields) {
  for (const [field, options] of Object.entries(fields)) {
    if (!Object.prototype.hasOwnProperty.call(next, field)) continue;
    const raw = next[field];
    if (raw === null && !options.required) {
      next[field] = '';
      continue;
    }
    if (typeof raw !== 'string') throw publicationInputError(`${field} must be plain text.`);
    const value = raw.trim();
    if (options.required && !value) throw publicationInputError(`${field === 'name' ? 'Category name' : 'Material title'} is required.`);
    if (value.length > options.limit) throw publicationInputError(`${field} is too long.`);
    next[field] = value;
  }
}

function normalizeEditorPageLayout(value) {
  if (value === null || value === '') return null;
  let serialized = value;
  if (typeof serialized !== 'string') {
    try { serialized = JSON.stringify(serialized); } catch { throw publicationInputError('page_layout must be valid JSON.'); }
  }
  if (serialized.length > 100000) throw publicationInputError('page_layout is too long.');
  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
  } catch {
    throw publicationInputError('page_layout must be valid JSON.');
  }
  return serialized;
}

function normalizeCategory(category) {
  return {
    ...category,
    id: Number(category.id),
    parent_id: category.parent_id ? Number(category.parent_id) : null,
    sort_order: Number(category.sort_order) || 0,
    nav_visible: category.nav_visible === undefined ? 1 : (asBool(category.nav_visible, true) ? 1 : 0),
    is_archived: asBool(category.is_archived) ? 1 : 0,
  };
}

function normalizeMaterial(material, files = []) {
  return {
    ...material,
    id: Number(material.id),
    category_id: material.category_id ? Number(material.category_id) : null,
    sort_order: Number(material.sort_order) || 0,
    is_published: material.is_published === undefined ? 1 : (asBool(material.is_published, true) ? 1 : 0),
    is_archived: asBool(material.is_archived) ? 1 : 0,
    action_visibility: parseJson(material.action_visibility, material.action_visibility || null),
    files: (files || []).map((file) => ({
      ...file,
      is_archived: asBool(file.is_archived) ? 1 : 0,
    })),
  };
}

async function listMaterials() {
  const result = await db.resourceAdminList({ page: 1, limit: 10000 });
  const rows = Array.isArray(result) ? result : (result?.resources || []);
  return Promise.all(rows.map(async (row) => normalizeMaterial(row, await db.filesByResource(row.id, { includeArchived: true }))));
}

export async function loadEditorContent() {
  const [settingsRows, categories, materials, revision] = await Promise.all([
    db.settingsGetAll(),
    db.categoryListAll(),
    listMaterials(),
    db.editorRevisionGet(),
  ]);
  const settings = settingsToObject(settingsRows);
  const quickTopics = normalizeQuickTopics(parseJson(settings.home_quick_topics, DEFAULT_QUICK_TOPICS));
  const counts = new Map();
  const categoryById = new Map(categories.map((category) => [Number(category.id), category]));
  materials.forEach((material) => {
    if (!material.is_archived && material.is_published !== 0 && material.category_id) {
      const visited = new Set();
      let current = categoryById.get(Number(material.category_id));
      while (current && !current.is_archived && !visited.has(Number(current.id))) {
        visited.add(Number(current.id));
        counts.set(Number(current.id), (counts.get(Number(current.id)) || 0) + 1);
        current = current.parent_id ? categoryById.get(Number(current.parent_id)) : null;
      }
    }
  });
  return {
    revision: Number(revision) || 0,
    quickTopics,
    categories: categories.map((category) => ({ ...normalizeCategory(category), resource_count: counts.get(Number(category.id)) || 0 })),
    materials,
  };
}

function resolveId(value, clientIds) {
  if (value === undefined || value === null || value === '') return null;
  return clientIds.get(String(value)) || Number(value) || null;
}

async function assertSafeCategoryParent(parentId, categoryId = null, clientIds = new Map()) {
  const resolvedParent = resolveId(parentId, clientIds);
  if (!resolvedParent) return null;
  if (categoryId && Number(resolvedParent) === Number(categoryId)) {
    throw publicationInputError('A category cannot be its own parent.');
  }
  const visited = new Set();
  let current = resolvedParent;
  while (current) {
    if (visited.has(Number(current))) throw publicationInputError('Category hierarchy contains a cycle.');
    visited.add(Number(current));
    if (categoryId && Number(current) === Number(categoryId)) {
      throw publicationInputError('A category cannot be moved inside one of its own subcategories.');
    }
    const row = await db.categoryFindById(current);
    if (!row) throw publicationInputError('Invalid parent category.');
    current = row.parent_id ? resolveId(row.parent_id, clientIds) : null;
  }
  return Number(resolvedParent);
}

function fileUrl(file) {
  if (file?.publicUrl) return file.publicUrl;
  if (file?.mimetype?.startsWith('image/')) return `/uploads/covers/${file.filename}`;
  return `/uploads/files/${file.filename}`;
}

async function fileStoragePath(file) {
  if (file?.storagePath) return file.storagePath;
  return db.localPathToStorage(fileUrl(file));
}

async function storedAssetStoragePath(value) {
  if (!value) return null;
  const raw = await db.localPathToStorage(value);
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return String(raw).startsWith('covers/') ? raw : null;
  try {
    const parsed = new URL(raw);
    const markerIndex = parsed.pathname.indexOf('/o/');
    if (markerIndex >= 0) {
      const objectPath = decodeURIComponent(parsed.pathname.slice(markerIndex + 3));
      return objectPath.startsWith('covers/') ? objectPath : null;
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    const objectPath = parts.length > 1 ? decodeURIComponent(parts.slice(1).join('/')) : null;
    return objectPath?.startsWith('covers/') ? objectPath : null;
  } catch {
    return null;
  }
}

async function cleanupUnreferencedCover(storagePath, excludeId = null) {
  const normalized = await storedAssetStoragePath(storagePath) || storagePath;
  if (!normalized || !String(normalized).startsWith('covers/')) return;
  try {
    const references = await db.resourceCoverReferenceCount(normalized, excludeId);
    if (Number(references) === 0) await db.storageDelete(normalized);
  } catch {
    // A failed reference check must never delete user media. The orphan can
    // be collected by the scheduled cleanup job instead.
  }
}

async function assertUploadSession(req, uploadId, { requireComplete = false } = {}) {
  if (!uploadIdIsValid(uploadId)) {
    const error = new Error('Invalid upload ID.');
    error.status = 400;
    throw error;
  }
  const session = await db.editorUploadSessionFind(String(uploadId), req.user.id);
  if (!session) {
    const error = new Error('Upload session not found.');
    error.status = 404;
    throw error;
  }
  const expiresAt = session.expires_at?.toDate ? session.expires_at.toDate() : new Date(session.expires_at || 0);
  if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    await db.editorUploadSessionUpdate(uploadId, { status: 'expired' });
    const error = new Error('Upload session expired. Start the upload again.');
    error.status = 410;
    throw error;
  }
  if (['cancelled', 'expired'].includes(String(session.status))) {
    const error = new Error('Upload session is no longer active.');
    error.status = 409;
    throw error;
  }
  if (requireComplete && session.status !== 'complete') {
    const error = new Error('Upload is not complete.');
    error.status = 409;
    throw error;
  }
  return session;
}

function requestUploadedFiles(req) {
  return Object.values(req.files || {}).flat().filter(Boolean);
}

async function cleanupRequestUploadedFiles(req) {
  for (const file of requestUploadedFiles(req)) {
    try {
      if (file.storagePath) await db.storageDelete(file.storagePath);
      else if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch { /* best effort cleanup */ }
  }
}

async function cleanupExpiredEditorUploads() {
  const expired = await db.editorUploadSessionListExpired(new Date());
  await Promise.all((expired || []).map(async (session) => {
    const storagePath = session.storage_path || editorUploadPath(session.owner_id, session.upload_id);
    try { await db.storageDelete(isFirestoreBackend() ? storagePath : `${storagePath}/complete`); } catch { /* best effort */ }
    if (!isFirestoreBackend()) {
      const dir = editorUploadDiskPath(session.owner_id, session.upload_id);
      if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    }
    try { await db.editorUploadSessionDelete(session.upload_id, session.owner_id); } catch { /* best effort */ }
  }));
}

function fileFor(manifest, files, opId, kind) {
  const entry = manifest.find((item) => String(item.opId) === String(opId) && item.kind === kind);
  if (!entry) return null;
  const file = files[Number(entry.index)];
  return file ? { file, entry } : null;
}

async function applyCategoryOperation(operation, clientIds, undo) {
  const data = operation.data || {};
  const rawId = operation.id || data.id;
  const id = resolveId(rawId, clientIds);
  if (operation.action === 'create') {
    const name = String(data.name || '').trim();
    if (!name) throw publicationInputError('Category name is required.');
    const parentId = await assertSafeCategoryParent(data.parent_id, null, clientIds);
    const slug = await uniqueSlug(name, (candidate) => db.categorySlugExists(candidate));
    const created = await db.categoryCreate({
      name,
      slug,
      description: data.description || null,
      parent_id: parentId,
      sort_order: Number(data.sort_order) || 0,
      nav_visible: asBool(data.nav_visible, true) ? 1 : 0,
      is_archived: asBool(data.is_archived) ? 1 : 0,
    });
    const createdId = getId(created);
    if (!createdId) throw new Error('Could not create category.');
    if (operation.clientId) clientIds.set(String(operation.clientId), createdId);
    undo.push(() => db.categoryDelete(createdId));
    return createdId;
  }

  if (operation.action === 'reorder') {
    const items = Array.isArray(data.items) ? data.items : [];
    const previous = (await Promise.all(items.map((item) => {
      const itemId = resolveId(item.id, clientIds);
      return itemId ? db.categoryFindById(itemId) : null;
    }))).filter(Boolean);
    const parentIds = new Set(previous.map((item) => String(item.parent_id || '')));
    if (parentIds.size > 1) throw publicationInputError('Categories can only be reordered within the same parent topic.');
    undo.push(() => Promise.all(previous.map((item) => db.categoryUpdate(item.id, { sort_order: item.sort_order }))));
    await Promise.all(items.map((item) => {
      const itemId = resolveId(item.id, clientIds);
      return itemId ? db.categoryUpdate(itemId, { sort_order: Number(item.sort_order) || 0 }) : null;
    }));
    return resolveId(items[0]?.id, clientIds);
  }

  if (!id) throw publicationInputError('Category id is required.');
  const existing = await db.categoryFindById(id);
  if (!existing) throw publicationInputError('Category not found.');
  const previous = { ...existing };
  undo.push(() => db.categoryUpdate(id, previous));
  if (operation.action === 'archive' || operation.action === 'restore') {
    await db.categoryUpdate(id, { is_archived: operation.action === 'archive' ? 1 : 0 });
    return id;
  }
  if (operation.action !== 'update') throw publicationInputError('Unsupported category operation.');
  const next = pickFields(data, CATEGORY_FIELDS);
  normalizeEditorTextFields(next, CATEGORY_TEXT_FIELDS);
  if (Object.prototype.hasOwnProperty.call(next, 'parent_id')) next.parent_id = await assertSafeCategoryParent(next.parent_id, id, clientIds);
  if (Object.prototype.hasOwnProperty.call(next, 'nav_visible')) next.nav_visible = asBool(next.nav_visible, true) ? 1 : 0;
  if (Object.prototype.hasOwnProperty.call(next, 'is_archived')) next.is_archived = asBool(next.is_archived) ? 1 : 0;
  await db.categoryUpdate(id, next);
  return id;
}

async function applyMaterialOperation(operation, clientIds, undo, uploaded, manifest, userId = 1, cleanupAfterCommit = []) {
  const data = operation.data || {};
  const rawId = operation.id || data.id;
  const id = resolveId(rawId, clientIds);
  const cover = fileFor(manifest, uploaded, operation.opId, 'cover');
  const files = manifest
    .filter((item) => String(item.opId) === String(operation.opId) && item.kind === 'file')
    .map((item) => ({ file: uploaded[Number(item.index)], entry: item }))
    .filter((item) => item.file);

  if (operation.action === 'create') {
    const title = String(data.title || '').trim();
    if (!title) throw publicationInputError('Material title is required.');
    const categoryId = resolveId(data.category_id, clientIds);
    if (categoryId && !(await db.categoryFindById(categoryId))) throw publicationInputError('Invalid material category.');
    const slug = await uniqueSlug(title, (candidate) => db.resourceSlugExists(candidate));
    let coverImage = cover ? fileUrl(cover.file) : (data.cover_image || null);
    if (!cover && data.source_cover_image) {
      const sourcePath = await storedAssetStoragePath(data.source_cover_image);
      if (sourcePath) {
        const extension = path.extname(sourcePath) || '.jpg';
        const destination = `covers/${randomUUID()}${extension}`;
        const copiedCover = await db.storageCopy(sourcePath, destination, 'image/jpeg', { public: true });
        coverImage = copiedCover || coverImage;
        undo.push(() => db.storageDelete(destination));
      }
    }
    const created = await db.resourceCreate({
      title,
      slug,
      description: data.description || null,
      content_description: data.content_description || null,
      age_range: data.age_range || null,
      keywords: data.keywords || null,
      grade_level: data.grade_level || null,
      material_type: data.material_type || null,
      category_id: categoryId,
      cover_image: coverImage,
      cover_hidden: asBool(data.cover_hidden) ? 1 : 0,
      display_mode: ['default', 'grid', 'gallery'].includes(data.display_mode) ? data.display_mode : 'default',
      download_limit_max: data.download_limit_max || null,
      download_limit_period: data.download_limit_period || null,
      school_only: asBool(data.school_only) ? 1 : 0,
      page_layout: data.page_layout || null,
      is_published: data.is_published === false || data.is_published === 'false' ? 0 : 1,
      is_archived: asBool(data.is_archived) ? 1 : 0,
      sort_order: Number(data.sort_order) || 0,
      created_by: Number(userId) || 1,
    });
    const createdId = getId(created);
    if (!createdId) throw new Error('Could not create material.');
    if (operation.clientId) clientIds.set(String(operation.clientId), createdId);
    undo.push(() => db.resourceDelete(createdId));
    await createFiles(createdId, files, undo, clientIds);
    await cloneExistingFiles(createdId, data.files, undo, clientIds);
    return createdId;
  }

  if (operation.action === 'reorder') {
    const items = Array.isArray(data.items) ? data.items : [];
    const previous = (await Promise.all(items.map((item) => {
      const itemId = resolveId(item.id, clientIds);
      return itemId ? db.resourceFindById(itemId) : null;
    }))).filter(Boolean);
    undo.push(() => Promise.all(previous.map((item) => db.resourceUpdate(item.id, { sort_order: item.sort_order }))));
    await Promise.all(items.map(async (item) => {
      const itemId = resolveId(item.id, clientIds);
      if (!itemId || !(await db.resourceFindById(itemId))) return null;
      return db.resourceUpdate(itemId, { sort_order: Number(item.sort_order) || 0 });
    }));
    return resolveId(items[0]?.id, clientIds);
  }

  if (!id) throw publicationInputError('Material id is required.');
  const existing = await db.resourceFindById(id);
  if (!existing) throw publicationInputError('Material not found.');
  const previous = { ...existing };
  undo.push(() => db.resourceUpdate(id, previous));
  if (operation.action === 'archive' || operation.action === 'restore') {
    await db.resourceUpdate(id, { is_archived: operation.action === 'archive' ? 1 : 0 });
  } else if (operation.action === 'update') {
    const next = pickFields(data, MATERIAL_FIELDS);
    normalizeEditorTextFields(next, MATERIAL_TEXT_FIELDS);
    if (Object.prototype.hasOwnProperty.call(next, 'page_layout')) next.page_layout = normalizeEditorPageLayout(next.page_layout);
    if (Object.prototype.hasOwnProperty.call(next, 'category_id')) {
      next.category_id = resolveId(next.category_id, clientIds);
      if (next.category_id && !(await db.categoryFindById(next.category_id))) throw publicationInputError('Invalid material category.');
    }
    if (Object.prototype.hasOwnProperty.call(next, 'is_published')) next.is_published = asBool(next.is_published, true) ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(next, 'is_archived')) next.is_archived = asBool(next.is_archived) ? 1 : 0;
    if (cover) {
      next.cover_image = fileUrl(cover.file);
      next.cover_hidden = 0;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'cover_image')
      && next.cover_image !== existing.cover_image
      && existing.cover_image) {
      const previousCover = await storedAssetStoragePath(existing.cover_image);
      if (previousCover) cleanupAfterCommit.push({ storagePath: previousCover, excludeId: id });
    }
    if (Object.keys(next).length) await db.resourceUpdate(id, next);
    await createFiles(id, files, undo, clientIds);
  } else {
    throw publicationInputError('Unsupported material operation.');
  }
  return id;
}

async function applyFileOperation(operation, clientIds, undo, uploaded, manifest) {
  const data = operation.data || {};
  const materialId = resolveId(operation.materialId || data.material_id || data.resource_id, clientIds);
  if (!materialId) throw publicationInputError('Material id is required for file operation.');
  const material = await db.resourceFindById(materialId);
  if (!material) throw publicationInputError('Material not found for file operation.');

  if (operation.action === 'add') {
    const entry = fileFor(manifest, uploaded, operation.opId, 'file');
    if (!entry) throw publicationInputError('A file is required for this upload.');
    const file = entry.file;
    const maxOrder = await db.fileMaxSortOrder(materialId);
    const created = await db.fileCreate(materialId, {
      file_name: file.filename,
      original_name: file.originalname,
      label: entry.entry.label || data.label || null,
      sort_order: Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : (Number(maxOrder?.maxOrder) + 1 || 0),
      file_type: getFileType(file.mimetype),
      file_size: file.size || file.buffer?.length || 0,
      mime_type: file.mimetype,
      is_primary: entry.entry.primary ? 1 : 0,
      is_archived: asBool(data.is_archived) ? 1 : 0,
      is_bundle: 0,
      premium_only: 0,
      thumbnail: null,
    });
    const createdId = getId(created);
    if (createdId) {
      if (operation.clientId) clientIds.set(String(operation.clientId), createdId);
      undo.push(() => db.fileDelete(createdId));
    }
    return createdId;
  }

  if (operation.action === 'reorder') {
    const items = Array.isArray(data.items) ? data.items : [];
    const existingFiles = await db.filesByResource(materialId, { includeArchived: true });
    const existingIds = new Set(existingFiles.map((file) => String(file.id)));
    undo.push(() => Promise.all(existingFiles.map((file) => db.fileUpdate(file.id, { sort_order: file.sort_order }))));
    await Promise.all(items.map((item) => {
      const id = resolveId(item.id, clientIds);
      if (!id || !existingIds.has(String(id))) return null;
      return db.fileUpdate(id, { sort_order: Number(item.sort_order) || 0 });
    }));
    return materialId;
  }

  const fileId = resolveId(operation.id || data.id, clientIds);
  if (!fileId) throw publicationInputError('File id is required.');
  const existing = await db.fileFindById(fileId);
  if (!existing || Number(existing.resource_id) !== Number(materialId)) throw publicationInputError('File not found.');
  undo.push(() => db.fileUpdate(fileId, { ...existing }));

  if (operation.action === 'archive' || operation.action === 'restore') {
    await db.fileUpdate(fileId, { is_archived: operation.action === 'archive' ? 1 : 0 });
    return fileId;
  }
  if (operation.action === 'update') {
    const next = {};
    if (Object.prototype.hasOwnProperty.call(data, 'label')) next.label = data.label || null;
    if (Object.prototype.hasOwnProperty.call(data, 'sort_order')) next.sort_order = Number(data.sort_order) || 0;
    if (Object.prototype.hasOwnProperty.call(data, 'is_primary')) next.is_primary = asBool(data.is_primary) ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(data, 'is_archived')) next.is_archived = asBool(data.is_archived) ? 1 : 0;
    if (Object.keys(next).length) await db.fileUpdate(fileId, next);
    return fileId;
  }
  throw publicationInputError('Unsupported file operation.');
}

async function createFiles(resourceId, fileEntries, undo, clientIds = new Map()) {
  let sortOrder = (await db.fileMaxSortOrder(resourceId))?.maxOrder;
  if (!Number.isFinite(Number(sortOrder))) sortOrder = -1;
  for (const { file, entry } of fileEntries) {
    const fileId = await db.fileCreate(resourceId, {
      file_name: file.filename,
      original_name: file.originalname,
      label: entry.label || null,
      sort_order: ++sortOrder,
      file_type: getFileType(file.mimetype),
      file_size: file.size || file.buffer?.length || 0,
      mime_type: file.mimetype,
      is_primary: entry.primary ? 1 : 0,
      is_archived: asBool(entry.is_archived) ? 1 : 0,
      is_bundle: 0,
      premium_only: 0,
      thumbnail: null,
    });
    const id = getId(fileId);
    if (id) {
      if (entry.clientId) clientIds.set(String(entry.clientId), id);
      undo.push(() => db.fileDelete(id));
    }
  }
}

async function cloneExistingFiles(resourceId, sourceFiles, undo, clientIds = new Map()) {
  const rows = Array.isArray(sourceFiles) ? sourceFiles : [];
  for (const source of rows) {
    // Temporary browser uploads have a clientId but no sourceFileId and must
    // be handled by the multipart manifest. Duplicated persisted rows carry
    // sourceFileId so subsequent label/archive/reorder operations can resolve
    // their temporary id to the newly cloned database row.
    if (!source || (source.clientId && !source.sourceFileId) || !source.file_name) continue;
    const rawSourceName = String(source.file_name).replace(/^\/?uploads\//, '');
    const sourceStoragePath = rawSourceName.includes('/') ? rawSourceName : `files/${rawSourceName}`;
      const extension = path.extname(source.file_name || '') || '';
      const destinationStoragePath = `files/${randomUUID()}${extension}`;
      undo.push(() => db.storageDelete(destinationStoragePath));
      await db.storageCopy(sourceStoragePath, destinationStoragePath, source.mime_type || 'application/octet-stream', { public: false });
      let thumbnail = source.thumbnail || null;
      const thumbnailPath = await storedAssetStoragePath(source.thumbnail);
      if (thumbnailPath) {
        const thumbnailExtension = path.extname(thumbnailPath) || '.jpg';
        const thumbnailDestination = `covers/${randomUUID()}${thumbnailExtension}`;
        undo.push(() => db.storageDelete(thumbnailDestination));
        const copiedThumbnail = await db.storageCopy(thumbnailPath, thumbnailDestination, 'image/jpeg', { public: true });
        thumbnail = copiedThumbnail || `/uploads/${thumbnailDestination}`;
      }
      const created = await db.fileCreate(resourceId, {
      file_name: path.basename(destinationStoragePath),
      original_name: source.original_name || source.file_name,
      label: source.label || null,
      sort_order: Number(source.sort_order) || 0,
      file_type: source.file_type || getFileType(source.mime_type),
      file_size: Number(source.file_size) || 0,
      mime_type: source.mime_type || null,
      is_primary: asBool(source.is_primary) ? 1 : 0,
      is_archived: asBool(source.is_archived) ? 1 : 0,
      is_bundle: asBool(source.is_bundle) ? 1 : 0,
      premium_only: asBool(source.premium_only) ? 1 : 0,
       thumbnail,
    });
    const id = getId(created);
    if (id) {
      if (source.clientId) clientIds.set(String(source.clientId), id);
      undo.push(() => db.fileDelete(id));
    }
  }
}

async function assembleLocalEditorUpload(userId, uploadId, totalSize) {
  const dir = editorUploadDiskPath(userId, uploadId);
  const partIndexes = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => /^part-\d+$/.test(name)).map((name) => Number(name.slice(5))).sort((a, b) => a - b)
    : [];
  if (!partIndexes.length) throw publicationInputError('No upload chunks were received.');
  const expectedParts = Math.ceil(Number(totalSize) / EDITOR_UPLOAD_CHUNK_SIZE);
  for (let index = 0; index < expectedParts; index += 1) {
    if (partIndexes[index] !== index) throw publicationInputError('Upload is incomplete. Please resume the missing chunk.');
  }
  const output = path.join(dir, 'complete');
  const stream = fs.createWriteStream(output);
  let bytes = 0;
  for (const index of partIndexes) {
    const buffer = fs.readFileSync(path.join(dir, `part-${index}`));
    bytes += buffer.length;
    if (bytes > totalSize) throw publicationInputError('Upload is larger than declared.');
    stream.write(buffer);
  }
  await new Promise((resolve, reject) => { stream.end(resolve); stream.on('error', reject); });
  if (bytes !== Number(totalSize)) throw publicationInputError('Upload is incomplete.');
  return { storagePath: `editor-staging/${userId}/${uploadId}/complete`, size: bytes };
}

async function promoteStagedUploads(req, manifest) {
  const entries = Array.isArray(manifest) ? manifest : [];
  const staged = entries.filter((entry) => entry?.uploadId || entry?.stagedPath);
  const uploaded = [];
  const stagedPaths = [];
  const permanentPaths = [];
  const uploadIds = [];
  const promotedByUpload = new Map();
  try {
    for (const entry of staged) {
      const uploadId = String(entry.uploadId || '');
      if (!uploadIdIsValid(uploadId)) throw publicationInputError('Invalid staged upload reference.');
      if (!Number.isInteger(Number(entry.index)) || Number(entry.index) < 0) throw publicationInputError('Invalid staged upload manifest index.');
      const session = await assertUploadSession(req, uploadId, { requireComplete: true });
      const expectedPath = session.staged_path || `${editorUploadPath(req.user.id, uploadId)}/complete`;
      const stagedPath = String(entry.stagedPath || expectedPath);
      if (stagedPath !== expectedPath) throw publicationInputError('Invalid staged upload reference.');
      const sessionKind = uploadSessionKind(session);
      const kind = entry.kind === 'cover' ? 'cover' : 'file';
      if (sessionKind !== kind) throw publicationInputError('Upload kind does not match its session.');
      const originalName = String(entry.originalName || session.name || 'upload').slice(0, 255);
      const mimeType = normalizedEditorMime(originalName, entry.mimeType || session.mime_type);
      const size = uploadSessionSize(session);
      if (Number(entry.size) !== size) throw publicationInputError(`Upload ${originalName} has an invalid size.`);
      validateEditorUpload({ name: originalName, mimeType, size, kind });
      if (promotedByUpload.has(uploadId)) {
        const existing = promotedByUpload.get(uploadId);
        uploaded[Number(entry.index)] = existing;
        continue;
      }
      const metadata = await db.storageStat(stagedPath);
      if (!metadata || Number(metadata.size) !== size) throw publicationInputError(`Upload ${originalName} is incomplete.`);
      // A resumable endpoint only validates ranges; validate the assembled
      // object again immediately before copying it into published storage.
      await assertStoredUploadContent(stagedPath, mimeType);
      const ext = EXT_BY_MIME[mimeType] || path.extname(originalName).toLowerCase() || (kind === 'cover' ? '.jpg' : '');
      const destinationPath = `${kind === 'cover' ? 'covers' : 'files'}/${randomUUID()}${ext}`;
      permanentPaths.push(destinationPath);
      const copiedUrl = await db.storageCopy(stagedPath, destinationPath, mimeType, { public: kind === 'cover' });
      stagedPaths.push(stagedPath);
      const filename = path.basename(destinationPath);
      const promoted = {
        filename,
        originalname: originalName || filename,
        mimetype: mimeType,
        size,
        storagePath: destinationPath,
        publicUrl: kind === 'cover' ? copiedUrl : undefined,
      };
      promotedByUpload.set(uploadId, promoted);
      uploadIds.push(uploadId);
      uploaded[Number(entry.index)] = promoted;
    }
    return { uploaded, stagedPaths, permanentPaths, uploadIds };
  } catch (error) {
    // Staged sessions remain available for a corrected Publish retry. Only
    // permanent copies created during this request are safe to remove here.
    await Promise.all(permanentPaths.map((storagePath) => db.storageDelete(storagePath).catch(() => {})));
    throw error;
  }
}

router.post('/uploads/start', authenticate, requireAdmin, async (req, res) => {
  await cleanupExpiredEditorUploads();
  const body = req.body || {};
  const uploadId = randomUUID();
  const name = String(body.name || 'upload').slice(0, 255);
  const mimeType = normalizedEditorMime(name, String(body.mimeType || body.mime_type || 'application/octet-stream'));
  const size = Number(body.size);
  const kind = body.kind === 'cover' ? 'cover' : 'file';
  validateEditorUpload({ name, mimeType, size, kind });
  const storagePath = editorUploadPath(req.user.id, uploadId);
  let sessionUrl = null;
  if (isFirestoreBackend()) {
    [sessionUrl] = await bucket.file(storagePath).createResumableUpload({
      metadata: { contentType: mimeType, metadata: { ownerId: String(req.user.id), uploadId, originalName: name, size: String(size), kind } },
      resumable: true,
    });
  } else {
    fs.mkdirSync(editorUploadDiskPath(req.user.id, uploadId), { recursive: true });
  }
  try {
    await db.editorUploadSessionCreate({
      upload_id: uploadId,
      owner_id: req.user.id,
      name,
      mime_type: mimeType,
      size,
      kind,
      chunk_size: EDITOR_UPLOAD_CHUNK_SIZE,
      storage_path: storagePath,
      session_url: sessionUrl,
      status: 'started',
      received_bytes: 0,
      last_chunk: -1,
      expires_at: uploadSessionExpiry(),
    });
  } catch (error) {
    if (!isFirestoreBackend()) {
      const dir = editorUploadDiskPath(req.user.id, uploadId);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    throw error;
  }
  // The Firebase resumable URL is intentionally kept server-side. Chunks go
  // through the authenticated route below so a leaked URL cannot be reused
  // by another administrator.
  return res.json({ uploadId, chunkSize: EDITOR_UPLOAD_CHUNK_SIZE, resumable: true });
});

router.get('/uploads/:uploadId', authenticate, requireAdmin, async (req, res) => {
  const session = await assertUploadSession(req, req.params.uploadId);
  let receivedBytes = Number(session.received_bytes) || 0;
  if (!isFirestoreBackend()) {
    const dir = editorUploadDiskPath(req.user.id, req.params.uploadId);
    const parts = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => /^part-\d+$/.test(name))
      : [];
    receivedBytes = parts.reduce((total, name) => total + fs.statSync(path.join(dir, name)).size, 0);
  }
  res.json({
    uploadId: session.upload_id,
    name: session.name,
    mimeType: session.mime_type,
    size: uploadSessionSize(session),
    kind: uploadSessionKind(session),
    status: session.status,
    receivedBytes,
    chunkSize: Number(session.chunk_size) || EDITOR_UPLOAD_CHUNK_SIZE,
    stagedPath: session.staged_path || null,
  });
});

router.put('/uploads/:uploadId/chunk', authenticate, requireAdmin, raw({ type: '*/*', limit: `${EDITOR_UPLOAD_CHUNK_SIZE}b` }), async (req, res) => {
  const uploadId = String(req.params.uploadId);
  const session = await assertUploadSession(req, uploadId);
  if (!['started', 'uploading'].includes(String(session.status))) {
    const error = new Error('Upload session is no longer accepting chunks.');
    error.status = 409;
    throw error;
  }
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
  const range = assertChunkRange(session, buffer, req.headers);
  const mimeType = session.mime_type || 'application/octet-stream';
  if (session.session_url) {
    const response = await fetch(session.session_url, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.length),
        'Content-Range': `bytes ${range.start}-${range.end}/${range.total}`,
      },
      body: buffer,
    });
    if (![200, 201, 202, 308].includes(response.status)) {
      const error = new Error(`Storage rejected upload chunk (${response.status}).`);
      error.status = 502;
      throw error;
    }
  } else {
    const dir = editorUploadDiskPath(req.user.id, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `part-${range.part}`), buffer);
  }
  const receivedBytes = Math.min(range.total, Math.max(Number(session.received_bytes) || 0, range.end + 1));
  await db.editorUploadSessionUpdate(uploadId, {
    status: receivedBytes >= range.total ? 'uploading' : 'uploading',
    received_bytes: receivedBytes,
    last_chunk: range.part,
  });
  return res.status(session.session_url && receivedBytes < range.total ? 202 : 200).json({
    uploadId,
    part: range.part,
    received: buffer.length,
    receivedBytes,
    size: range.total,
  });
});

router.post('/uploads/:uploadId/complete', authenticate, requireAdmin, async (req, res) => {
  const body = req.body || {};
  const uploadId = String(req.params.uploadId);
  const session = await assertUploadSession(req, uploadId);
  const name = String(session.name || 'upload').slice(0, 255);
  const mimeType = normalizedEditorMime(name, session.mime_type);
  const size = uploadSessionSize(session);
  const kind = uploadSessionKind(session);
  validateEditorUpload({ name, mimeType, size, kind });
  if (body.name && String(body.name).slice(0, 255) !== name) throw publicationInputError('Upload metadata does not match the upload session.');
  if (body.size !== undefined && Number(body.size) !== size) throw publicationInputError('Upload size does not match the upload session.');
  if (body.kind && (body.kind === 'cover' ? 'cover' : 'file') !== kind) throw publicationInputError('Upload kind does not match the upload session.');
  if (!isFirestoreBackend()) await assembleLocalEditorUpload(req.user.id, uploadId, size);
  const storagePath = session.storage_path || editorUploadPath(req.user.id, uploadId);
  const completePath = isFirestoreBackend() ? storagePath : `${storagePath}/complete`;
  const metadata = await db.storageStat(completePath);
  if (!metadata || Number(metadata.size) !== size) throw publicationInputError('Upload is incomplete.');
  await assertStoredUploadContent(completePath, mimeType);
  await db.editorUploadSessionUpdate(uploadId, { status: 'complete', staged_path: completePath, received_bytes: size });
  return res.json({ uploadId, stagedPath: completePath, name, mimeType, size, kind, status: 'complete' });
});

router.delete('/uploads/:uploadId', authenticate, requireAdmin, async (req, res) => {
  const uploadId = String(req.params.uploadId);
  const session = await db.editorUploadSessionFind(uploadId, req.user.id);
  if (!session) return res.json({ ok: true });
  const storagePath = session.storage_path || editorUploadPath(req.user.id, uploadId);
  await db.storageDelete(isFirestoreBackend() ? storagePath : `${storagePath}/complete`);
  if (!isFirestoreBackend()) {
    const dir = editorUploadDiskPath(req.user.id, uploadId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  await db.editorUploadSessionDelete(uploadId, req.user.id);
  res.json({ ok: true });
});

router.get('/content', authenticate, requireAdmin, async (req, res) => {
  res.json(await loadEditorContent());
});

router.post('/publish', authenticate, requireAdmin, upload.fields([{ name: 'files', maxCount: 100 }]), async (req, res) => {
  const body = req.body || {};
  const settings = parseJson(body.settings, {});
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return res.status(400).json({ error: 'Editor settings must be an object.' });
  }
  if (Object.prototype.hasOwnProperty.call(settings, SITE_DOCUMENT_KEY)) {
    try {
      settings[SITE_DOCUMENT_KEY] = validateSiteDocumentPayload(settings[SITE_DOCUMENT_KEY]);
    } catch (error) {
      return res.status(publicationErrorStatus(error)).json({ error: error.message || 'The visual document is invalid.' });
    }
  }
  if (Object.prototype.hasOwnProperty.call(settings, 'home_canva_url')) {
    const requested = String(settings.home_canva_url || '').trim();
    const normalized = requested ? await resolveCanvaSourceUrl(requested) : '';
    if (requested && !normalized) {
      return res.status(400).json({ error: 'Enter a public Canva view, edit, embed, or canva.link URL.' });
    }
    settings.home_canva_url = normalized;
  }
  const hasContentPayload = body.content !== undefined;
  const content = hasContentPayload ? (parseJson(body.content, {}) || {}) : {};
  const operations = hasContentPayload && Array.isArray(content.operations) ? content.operations : [];
  let quickTopics = hasContentPayload ? normalizeQuickTopics(content.quickTopics) : null;
  const manifest = parseJson(body.file_manifest, []) || [];
  const expectedRevision = body.base_revision === undefined || body.base_revision === ''
    ? null
    : Number(body.base_revision);
  let revisionValidationError = null;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    revisionValidationError = new Error('The editor revision is required. Reload Content before publishing.');
    revisionValidationError.code = 'EDITOR_REVISION_REQUIRED';
    revisionValidationError.status = 400;
  } else if (hasContentPayload && content.baseRevision !== undefined
    && Number(content.baseRevision) !== expectedRevision) {
    revisionValidationError = new Error('The editor revision does not match the Content draft. Reload Content before publishing.');
    revisionValidationError.code = 'EDITOR_REVISION_MISMATCH';
    revisionValidationError.status = 400;
  }
  let uploaded = [];
  const undo = [];
  let uploadedStorage = [];
  let stagedStorage = [];
  let stagedUploadIds = [];
  const touchedSettings = [...new Set([
    ...Object.keys(settings || {}),
    ...(hasContentPayload ? ['home_quick_topics'] : []),
    'editor_revision',
  ])];
  const clientIds = new Map();
  const cleanupAfterCommit = [];
  let transactionMode = 'unknown';
  let previousSettings = {};
  let previousSettingsReady = false;
  let committed = false;
  let revision = null;
  try {
    if (revisionValidationError) throw revisionValidationError;
    const manifestCounts = new Map();
    (Array.isArray(manifest) ? manifest : []).filter((entry) => entry?.kind === 'file').forEach((entry) => {
      const materialId = entry.materialId || entry.resourceId || 'unknown';
      manifestCounts.set(String(materialId), (manifestCounts.get(String(materialId)) || 0) + 1);
    });
    if ([...manifestCounts.values()].some((count) => count > 100)) throw publicationInputError('A material can have at most 100 files.');
    uploaded = await processUploadedFiles(req.files?.files || []);
    uploadedStorage = (await Promise.all(uploaded.map((file) => fileStoragePath(file)))).filter(Boolean);
    const promoted = await promoteStagedUploads(req, manifest);
    stagedStorage = promoted.stagedPaths;
    stagedUploadIds = promoted.uploadIds || [];
    uploadedStorage.push(...promoted.permanentPaths);
    promoted.uploaded.forEach((file, index) => { uploaded[index] = file; });
    previousSettings = settingsToObject(await db.settingsGetAll());
    previousSettingsReady = true;
    await db.withTransaction(async (transaction) => {
      transactionMode = transaction?.transactional ? 'atomic' : 'compensating';
      revision = await db.editorRevisionBump(Number.isFinite(expectedRevision) ? expectedRevision : null);
      const categoryOps = operations.filter((operation) => operation.entity === 'category');
      const materialOps = operations.filter((operation) => operation.entity === 'material');
      const fileOps = operations.filter((operation) => operation.entity === 'file');
      for (const operation of categoryOps) await applyCategoryOperation(operation, clientIds, undo);
      for (const operation of materialOps) await applyMaterialOperation(operation, clientIds, undo, uploaded, manifest, req.user?.id, cleanupAfterCommit);
      for (const operation of fileOps) await applyFileOperation(operation, clientIds, undo, uploaded, manifest);
      if (hasContentPayload) quickTopics = await resolveQuickTopicTargets(quickTopics, clientIds);

      for (const [key, value] of Object.entries(settings || {})) {
        await db.settingsUpsert(key, value ?? '');
      }
      if (hasContentPayload) await db.settingsUpsert('home_quick_topics', JSON.stringify(quickTopics));
    });
    committed = true;
    for (const storagePath of stagedStorage) {
      try { await db.storageDelete(storagePath); } catch { /* best effort cleanup */ }
    }
    for (const uploadId of stagedUploadIds) {
      try { await db.editorUploadSessionDelete(uploadId, req.user.id); } catch { /* best effort cleanup */ }
    }
    for (const pendingCleanup of cleanupAfterCommit) {
      if (pendingCleanup?.storagePath) await cleanupUnreferencedCover(pendingCleanup.storagePath, pendingCleanup.excludeId);
    }
    const idMap = Object.fromEntries([...clientIds.entries()]);
    try {
      res.json({ ...(await loadEditorContent()), published: true, revision, idMap, publishedSettings: settings });
    } catch {
      // The database/storage commit already succeeded. A snapshot read failure
      // must never be reported as a rollback or delete the new uploads.
      res.json({ published: true, revision, idMap, publishedSettings: settings, refreshRequired: true });
    }
  } catch (error) {
    // MySQL has already rolled back the transaction. Fallback adapters use the
    // existing compensation list so an editor failure still leaves a clean draft.
    if (!committed && transactionMode !== 'atomic') {
      for (const revert of [...undo].reverse()) {
        try { await revert(); } catch { /* best effort rollback */ }
      }
      if (previousSettingsReady) {
        for (const key of touchedSettings) {
          try { await db.settingsUpsert(key, previousSettings[key] ?? ''); } catch { /* best effort rollback */ }
        }
      }
    }
    if (!committed) {
      // Keep completed staging sessions available for a corrected retry. The
      // explicit Discard endpoint cancels them, and the staging cleanup job
      // can remove abandoned sessions after their TTL. Permanent copies and
      // legacy multipart uploads are still removed immediately below.
      for (const storagePath of uploadedStorage) {
        try { await db.storageDelete(storagePath); } catch { /* best effort cleanup */ }
      }
      await cleanupRequestUploadedFiles(req);
    }
    res.status(publicationErrorStatus(error)).json({
      error: error.message || 'Could not publish editor changes.',
      code: error.code || undefined,
    });
  }
});

export default router;
