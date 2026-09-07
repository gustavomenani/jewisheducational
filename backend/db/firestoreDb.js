import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { firestore, bucket } from '../config/firebaseAdmin.js';
import { sourceForRow } from '../utils/attribution.js';

const COL = {
  users: 'users',
  categories: 'categories',
  resources: 'resources',
  files: 'resource_files',
  settings: 'settings',
  downloads: 'downloads',
  downloadQuotaLocks: 'download_quota_locks',
  downloadIntents: 'download_intents',
  favorites: 'favorites',
  favoriteFolders: 'favorite_folders',
  subscriptions: 'subscriptions',
  plans: 'plans',
  pageViews: 'page_views',
  interactionEvents: 'analytics_interactions',
  contactMessages: 'contact_messages',
  editorUploadSessions: 'editor_upload_sessions',
  stripeWebhookEvents: 'stripe_webhook_events',
  counters: '_counters',
};

const editorBatchContext = new AsyncLocalStorage();

function currentEditorBatch() {
  return editorBatchContext.getStore();
}

function pendingValue(ref) {
  return currentEditorBatch()?.pending.get(ref.path);
}

function queueSet(ref, data, options = {}) {
  const context = currentEditorBatch();
  if (!context) return ref.set(data, options);
  context.writes.set(ref.path, { type: 'set', ref, data: { ...data }, options });
  const previous = context.pending.get(ref.path);
  context.pending.set(ref.path, { deleted: false, data: options.merge ? { ...(previous?.data || {}), ...data } : { ...data } });
  return Promise.resolve();
}

function queueUpdate(ref, data) {
  const context = currentEditorBatch();
  if (!context) return ref.update(data);
  const previousWrite = context.writes.get(ref.path);
  if (previousWrite?.type === 'set') {
    previousWrite.data = { ...previousWrite.data, ...data };
  } else if (previousWrite?.type === 'update') {
    previousWrite.data = { ...previousWrite.data, ...data };
  } else {
    context.writes.set(ref.path, { type: 'update', ref, data: { ...data } });
  }
  const previous = context.pending.get(ref.path);
  context.pending.set(ref.path, { deleted: false, data: { ...(previous?.data || {}), ...data } });
  return Promise.resolve();
}

function queueDelete(ref) {
  const context = currentEditorBatch();
  if (!context) return ref.delete();
  context.writes.set(ref.path, { type: 'delete', ref });
  context.pending.set(ref.path, { deleted: true, data: null });
  return Promise.resolve();
}

function toId(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function fromDoc(doc) {
  if (!doc?.exists) return null;
  const data = doc.data();
  const row = { id: toId(doc.id), ...data };
  if (data.created_at?.toDate) row.created_at = data.created_at.toDate();
  if (data.updated_at?.toDate) row.updated_at = data.updated_at.toDate();
  if (data.starts_at?.toDate) row.starts_at = data.starts_at.toDate();
  if (data.ends_at?.toDate) row.ends_at = data.ends_at.toDate();
  if (data.reserved_until?.toDate) row.reserved_until = data.reserved_until.toDate();
  if (data.completed_at?.toDate) row.completed_at = data.completed_at.toDate();
  if (data.reset_token_expires?.toDate) row.reset_token_expires = data.reset_token_expires.toDate();
  return row;
}

function fromDocs(snap) {
  return snap.docs.map((d) => fromDoc(d));
}

async function nextId(name) {
  const ref = firestore.collection(COL.counters).doc(name);
  const context = currentEditorBatch();
  if (context?.tx) {
    const doc = await context.tx.get(ref);
    // A single editor transaction can create several rows of the same
    // collection. Reuse the locally queued sequence value instead of reading
    // the persisted counter again, otherwise every file receives the same ID.
    const queuedSeq = context.pending.get(ref.path)?.data?.seq;
    const seq = (Number(queuedSeq ?? doc.data()?.seq) || 0) + 1;
    context.writes.set(ref.path, { type: 'set', ref, data: { seq }, options: { merge: true } });
    context.pending.set(ref.path, { deleted: false, data: { seq } });
    return seq;
  }
  const id = await firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const seq = (doc.data()?.seq || 0) + 1;
    tx.set(ref, { seq }, { merge: true });
    return seq;
  });
  return id;
}

function now() {
  return Timestamp.now();
}

function dateAddMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return Timestamp.fromDate(d);
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function userFindById(id) {
  const doc = await firestore.collection(COL.users).doc(String(id)).get();
  return fromDoc(doc);
}

export async function userFindByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  const snap = await firestore.collection(COL.users).where('email', '==', normalized).limit(1).get();
  if (!snap.empty) return fromDoc(snap.docs[0]);
  const snapRaw = await firestore.collection(COL.users).where('email', '==', email).limit(1).get();
  return snapRaw.empty ? null : fromDoc(snapRaw.docs[0]);
}

export async function userCreate(data) {
  const email = String(data.email || '').trim().toLowerCase();
  if (email && await userFindByEmail(email)) {
    const error = new Error('Duplicate user email.');
    error.code = 'DUPLICATE_USER_EMAIL';
    throw error;
  }
  const id = await nextId('users');
  const ref = firestore.collection(COL.users).doc(String(id));
  const row = {
    ...data,
    email,
    role: data.role || 'user',
    is_blocked: ['true', true, 1, '1'].includes(data.is_blocked) ? 1 : 0,
    created_at: now(),
    updated_at: now(),
  };
  await ref.set(row);
  return { insertId: id };
}

export async function userUpdate(id, fields) {
  const data = { ...fields, updated_at: now() };
  if (data.reset_token_expires instanceof Date) {
    data.reset_token_expires = Timestamp.fromDate(data.reset_token_expires);
  }
  await firestore.collection(COL.users).doc(String(id)).update(data);
}

export async function userDelete(id) {
  await deleteUserRelatedData(id);
  await firestore.collection(COL.users).doc(String(id)).delete();
}

async function deleteUserRelatedData(userId) {
  const uid = Number(userId);
  const collections = [COL.favorites, COL.favoriteFolders, COL.downloads, COL.downloadIntents, COL.subscriptions, COL.pageViews, COL.interactionEvents];
  let removed = 0;
  for (const name of collections) {
    const snap = await firestore.collection(name).where('user_id', '==', uid).get();
    if (snap.empty) continue;
    const batch = firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
  }
  return removed;
}

export async function purgeNonAdminUsers() {
  const snap = await firestore.collection(COL.users).get();
  const admins = [];
  const deleted = [];
  let relatedRemoved = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.role === 'admin') {
      admins.push({ id: Number(doc.id), name: data.name, email: data.email });
      continue;
    }
    relatedRemoved += await deleteUserRelatedData(doc.id);
    await firestore.collection(COL.users).doc(doc.id).delete();
    deleted.push({ id: Number(doc.id), name: data.name, email: data.email });
  }

  return { admins, deleted, relatedRemoved };
}

export async function userList() {
  const snap = await firestore.collection(COL.users).orderBy('created_at', 'desc').get();
  return fromDocs(snap);
}

export async function userCount() {
  const snap = await firestore.collection(COL.users).count().get();
  return { total: snap.data().count };
}

export async function userFindByResetToken(token) {
  const snap = await firestore.collection(COL.users)
    .where('reset_token', '==', token)
    .limit(5)
    .get();
  const nowDate = new Date();
  for (const doc of snap.docs) {
    const row = fromDoc(doc);
    if (row.reset_token_expires && row.reset_token_expires > nowDate) return { id: row.id };
  }
  return null;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function categoryFindById(id) {
  const ref = firestore.collection(COL.categories).doc(String(id));
  const pending = pendingValue(ref);
  if (pending) return pending.deleted ? null : { id: toId(ref.id), ...pending.data };
  const doc = await ref.get();
  return fromDoc(doc);
}

export async function categoryFindBySlug(slug) {
  const snap = await firestore.collection(COL.categories).where('slug', '==', slug).limit(1).get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export async function categorySlugExists(slug, excludeId = null) {
  const snap = await firestore.collection(COL.categories).where('slug', '==', slug).limit(1).get();
  if (!snap.empty && (!excludeId || String(snap.docs[0].id) !== String(excludeId))) return true;
  const context = currentEditorBatch();
  if (!context) return false;
  return [...context.pending.entries()].some(([path, entry]) => !entry.deleted && entry.data?.slug === slug && (!excludeId || String(path.split('/').pop()) !== String(excludeId)));
}

export async function categoryListAll() {
  const snap = await firestore.collection(COL.categories).get();
  return fromDocs(snap);
}

export async function categoryChildren(parentId) {
  const snap = await firestore.collection(COL.categories)
    .where('parent_id', '==', Number(parentId))
    .get();
  return fromDocs(snap).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
}

export async function categoryCreate(data) {
  const id = await nextId('categories');
  const row = {
    ...data,
    parent_id: data.parent_id ? Number(data.parent_id) : null,
    sort_order: data.sort_order || 0,
    nav_visible: data.nav_visible === undefined ? 1 : data.nav_visible,
    created_at: now(),
    updated_at: now(),
  };
  await queueSet(firestore.collection(COL.categories).doc(String(id)), row);
  return { insertId: id };
}

export async function categoryUpdate(id, data) {
  const next = { ...data, updated_at: now() };
  if (Object.prototype.hasOwnProperty.call(data, 'parent_id')) {
    next.parent_id = data.parent_id ? Number(data.parent_id) : null;
    if (next.parent_id) {
      const visited = new Set();
      let current = next.parent_id;
      while (current) {
        if (current === Number(id) || visited.has(current)) {
          const error = new Error('Category hierarchy contains a cycle.');
          error.status = 400;
          throw error;
        }
        visited.add(current);
        const parent = await categoryFindById(current);
        if (!parent) {
          const error = new Error('Invalid parent category.');
          error.status = 400;
          throw error;
        }
        current = parent.parent_id ? Number(parent.parent_id) : null;
      }
    }
  }
  Object.keys(next).forEach((key) => next[key] === undefined && delete next[key]);
  await queueUpdate(firestore.collection(COL.categories).doc(String(id)), next);
}

export async function categoryDelete(id) {
  await queueDelete(firestore.collection(COL.categories).doc(String(id)));
}

export async function categoryGetDescendantIds(categoryId) {
  const all = await categoryListAll();
  const ids = [];
  const queue = [Number(categoryId)];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (!Number.isFinite(current) || visited.has(current)) continue;
    visited.add(current);
    ids.push(current);
    all.filter((category) => Number(category.parent_id) === current)
      .forEach((child) => queue.push(Number(child.id)));
  }
  return ids;
}

export async function categoryListWithCounts() {
  const [categories, resources] = await Promise.all([
    categoryListAll(),
    resourceListPublished(),
  ]);

  function descendantIds(categoryId) {
    const ids = [];
    const queue = [Number(categoryId)];
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (!Number.isFinite(current) || visited.has(current)) continue;
      visited.add(current);
      ids.push(current);
      categories.filter((category) => Number(category.parent_id) === current)
        .forEach((child) => queue.push(Number(child.id)));
    }
    return ids;
  }

  return categories
    .map((c) => {
      const parent = c.parent_id ? categories.find((p) => p.id === c.parent_id) : null;
      const scopeIds = descendantIds(c.id);
      const count = resources.filter((r) => scopeIds.includes(Number(r.category_id))).length;
      return {
        ...c,
        nav_visible: c.nav_visible === undefined ? 1 : c.nav_visible,
        parent_name: parent?.name || null,
        parent_slug: parent?.slug || null,
        resource_count: count,
      };
    })
    .sort((a, b) => {
      const aRoot = a.parent_id || a.id;
      const bRoot = b.parent_id || b.id;
      if (aRoot !== bRoot) return aRoot - bRoot;
      if (!!a.parent_id !== !!b.parent_id) return a.parent_id ? 1 : -1;
      return (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name);
    });
}

// ─── Resources ───────────────────────────────────────────────────────────────

async function enrichResource(row, { includeAuthor = true } = {}) {
  if (!row) return null;
  const category = row.category_id ? await categoryFindById(row.category_id) : null;
  const parent = category?.parent_id ? await categoryFindById(category.parent_id) : null;
  const author = includeAuthor && row.created_by ? await userFindById(row.created_by) : null;
  return {
    ...row,
    category_name: category?.name || null,
    category_slug: category?.slug || null,
    parent_category_name: parent?.name || null,
    parent_category_slug: parent?.slug || null,
    author_name: author?.name || null,
  };
}

export async function resourceFindById(id) {
  const ref = firestore.collection(COL.resources).doc(String(id));
  const pending = pendingValue(ref);
  if (pending) return pending.deleted ? null : { id: toId(ref.id), ...pending.data };
  const doc = await ref.get();
  return fromDoc(doc);
}

export async function resourceFindBySlug(slug, publishedOnly = true) {
  const snap = await firestore.collection(COL.resources).where('slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  const row = fromDoc(snap.docs[0]);
  if (publishedOnly && (!row.is_published || row.is_archived)) return null;
  if (publishedOnly && row.category_id) {
    const categories = await categoryListAll();
    if (!publicCategorySet(categories).has(Number(row.category_id))) return null;
  }
  return enrichResource(row);
}

export async function resourceSlugExists(slug, excludeId = null) {
  const snap = await firestore.collection(COL.resources).where('slug', '==', slug).limit(1).get();
  if (!snap.empty && (!excludeId || String(snap.docs[0].id) !== String(excludeId))) return true;
  const context = currentEditorBatch();
  if (!context) return false;
  return [...context.pending.entries()].some(([path, entry]) => !entry.deleted && entry.data?.slug === slug && (!excludeId || String(path.split('/').pop()) !== String(excludeId)));
}

export async function resourceListPublished() {
  const snap = await firestore.collection(COL.resources).where('is_published', '==', 1).get();
  const rows = fromDocs(snap).filter((row) => !row.is_archived);
  const categories = await categoryListAll();
  const publicIds = publicCategorySet(categories);
  return rows.filter((row) => !row.category_id || publicIds.has(Number(row.category_id)));
}

export async function resourceCreate(data) {
  const id = await nextId('resources');
  const row = {
    ...data,
    is_published: data.is_published ?? 1,
    is_premium: data.is_premium ?? 0,
    view_count: 0,
    download_count: 0,
    created_at: now(),
    updated_at: now(),
  };
  await queueSet(firestore.collection(COL.resources).doc(String(id)), row);
  return { insertId: id };
}

export async function resourceUpdate(id, data) {
  await queueUpdate(firestore.collection(COL.resources).doc(String(id)), {
    ...data,
    updated_at: now(),
  });
}

export async function resourceDelete(id) {
  const files = await filesByResource(id, { includeArchived: true });
  await queueDelete(firestore.collection(COL.resources).doc(String(id)));
  for (const file of files) await queueDelete(firestore.collection(COL.files).doc(String(file.id)));
}

export async function resourceCoverReferenceCount(storagePath, excludeId = null) {
  const target = String(storagePath || '').replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!target) return 0;
  const snap = await firestore.collection(COL.resources).get();
  return snap.docs.reduce((count, doc) => {
    const id = toId(doc.id);
    if (excludeId !== null && Number(id) === Number(excludeId)) return count;
    const value = String(doc.data()?.cover_image || '').replace(/^\/+/, '').replace(/^uploads\//, '');
    return count + (value === target || value.endsWith(`/${target}`) ? 1 : 0);
  }, 0);
}

export async function resourceIncrementViews(id) {
  await firestore.collection(COL.resources).doc(String(id)).update({
    view_count: FieldValue.increment(1),
  });
}

export async function resourceIncrementDownloads(id) {
  await firestore.collection(COL.resources).doc(String(id)).update({
    download_count: FieldValue.increment(1),
  });
}

export async function resourceAdminList() {
  const snap = await firestore.collection(COL.resources).orderBy('created_at', 'desc').get();
  const rows = fromDocs(snap);
  return Promise.all(rows.map(async (r) => {
    const cat = r.category_id ? await categoryFindById(r.category_id) : null;
    return { ...r, category_name: cat?.name || null };
  }));
}

export async function resourceListFiltered({ conditions, params, orderBy, limit, offset }) {
  let rows = await resourceListPublished();

  if (params.q) {
    const q = params.q.toLowerCase();
    rows = rows.filter((r) =>
      r.title?.toLowerCase().includes(q)
      || r.description?.toLowerCase().includes(q)
      || r.keywords?.toLowerCase().includes(q)
    );
  }
  if (params.categoryIds) {
    rows = rows.filter((r) => params.categoryIds.includes(Number(r.category_id)));
  }
  if (params.type) {
    const files = await filesAll();
    const byRes = {};
    files.forEach((f) => {
      if (f.is_archived) return;
      if (!byRes[f.resource_id]) byRes[f.resource_id] = new Set();
      byRes[f.resource_id].add(f.file_type);
    });
    if (params.type === 'presentation') {
      rows = rows.filter((r) => {
        const types = byRes[r.id];
        return r.canva_url || (types && (types.has('ppt') || types.has('pptx')));
      });
    } else {
      rows = rows.filter((r) => byRes[r.id]?.has(params.type));
    }
  }
  if (params.access === 'free') rows = rows.filter((r) => !r.is_premium);
  if (params.access === 'premium') rows = rows.filter((r) => r.is_premium);
  if (params.grade) rows = rows.filter((r) => r.grade_level === params.grade);
  if (params.materialType) rows = rows.filter((r) => r.material_type === params.materialType);

  const sortMap = {
    featured: (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || new Date(b.created_at || 0) - new Date(a.created_at || 0),
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    downloads: (a, b) => (b.download_count || 0) - (a.download_count || 0),
    views: (a, b) => (b.view_count || 0) - (a.view_count || 0),
    title_asc: (a, b) => a.title.localeCompare(b.title),
    title_desc: (a, b) => b.title.localeCompare(a.title),
  };
  rows.sort(sortMap[orderBy] || sortMap.newest);

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);

  const files = await filesAll();
  const categories = await categoryListAll();
  const enriched = page.map((r) => {
    const resFiles = files.filter((f) => f.resource_id === r.id && !f.is_archived);
    const types = [...new Set(resFiles.map((f) => f.file_type))].sort().join(',');
    const cat = categories.find((c) => c.id === r.category_id);
    const sortedFiles = [...resFiles].sort((a, b) => {
      if (!!b.is_primary !== !!a.is_primary) return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      cover_image: r.cover_image,
      download_count: r.download_count,
      view_count: r.view_count,
      is_premium: r.is_premium,
      display_mode: r.display_mode,
      grade_level: r.grade_level || null,
      material_type: r.material_type || null,
      canva_url: r.canva_url || null,
      created_at: r.created_at,
      category_name: cat?.name || null,
      category_slug: cat?.slug || null,
      file_types: types || null,
      file_count: resFiles.length,
      primary_file_id: sortedFiles[0]?.id || null,
    };
  });

  return { resources: enriched, total };
}

// ─── Files ───────────────────────────────────────────────────────────────────

export async function fileFindById(id) {
  const ref = firestore.collection(COL.files).doc(String(id));
  const pending = pendingValue(ref);
  if (pending) return pending.deleted ? null : { id: toId(ref.id), ...pending.data };
  const doc = await ref.get();
  return fromDoc(doc);
}

export async function fileFindByIdAndResource(fileId, resourceId) {
  const file = await fileFindById(fileId);
  if (!file || Number(file.resource_id) !== Number(resourceId)) return null;
  const resource = await resourceFindById(resourceId);
  return {
    ...file,
    resource_title: resource?.title,
    is_published: resource?.is_published,
  };
}

export async function filesByResource(resourceId, options = {}) {
  const snap = await firestore.collection(COL.files)
    .where('resource_id', '==', Number(resourceId))
    .get();
  const files = fromDocs(snap);
  const context = currentEditorBatch();
  if (context) {
    for (const [path, pending] of context.pending.entries()) {
      if (!path.startsWith(`${COL.files}/`)) continue;
      const id = path.split('/').pop();
      const index = files.findIndex((file) => String(file.id) === String(id));
      if (pending.deleted) {
        if (index >= 0) files.splice(index, 1);
      } else if (Number(pending.data?.resource_id) === Number(resourceId)) {
        if (index >= 0) files[index] = { id: toId(id), ...pending.data };
        else files.push({ id: toId(id), ...pending.data });
      }
    }
  }
  const visibleFiles = files.filter((file) => options === true || options?.includeArchived === true || !file.is_archived);
  return visibleFiles.sort((a, b) =>
    (a.sort_order || 0) - (b.sort_order || 0)
    || (b.is_primary || 0) - (a.is_primary || 0)
    || a.id - b.id
  );
}

export async function filesAll() {
  const snap = await firestore.collection(COL.files).get();
  return fromDocs(snap);
}

export async function fileCreate(resourceId, data) {
  const id = await nextId('resource_files');
  const row = {
    ...data,
    resource_id: Number(resourceId),
    is_primary: data.is_primary || 0,
    is_archived: data.is_archived || 0,
    is_bundle: data.is_bundle || 0,
    premium_only: data.premium_only || 0,
    sort_order: data.sort_order ?? 0,
    thumbnail: data.thumbnail ?? null,
    created_at: now(),
  };
  await queueSet(firestore.collection(COL.files).doc(String(id)), row);
  return { insertId: id };
}

export async function fileUpdate(id, data) {
  await queueUpdate(firestore.collection(COL.files).doc(String(id)), data);
}

export async function fileDelete(id) {
  await queueDelete(firestore.collection(COL.files).doc(String(id)));
}

export async function fileMaxSortOrder(resourceId) {
  const files = await filesByResource(resourceId);
  if (!files.length) return { maxOrder: -1 };
  return { maxOrder: Math.max(...files.map((f) => f.sort_order || 0)) };
}

export async function fileClearBundleFlags(resourceId, exceptId = null) {
  const files = await filesByResource(resourceId);
  const batch = firestore.batch();
  files.forEach((f) => {
    if (exceptId && f.id === Number(exceptId)) return;
    batch.update(firestore.collection(COL.files).doc(String(f.id)), {
      is_bundle: 0,
      premium_only: 0,
    });
  });
  await batch.commit();
}

// ─── Settings ────────────────────────────────────────────────────────────────

// Shared publish boundary. SQL deployments provide a real transaction; this
// adapter keeps the same API for Firestore document writes.
export async function withTransaction(work) {
  const existing = currentEditorBatch();
  if (existing) return work({ transactional: true, batch: existing.batch });
  // Use a real Firestore transaction for editor publishes. The revision
  // document is read before the queued writes are committed, so concurrent
  // administrators cannot both publish against the same browser snapshot.
  return firestore.runTransaction(async (tx) => {
    const context = { tx, pending: new Map(), writes: new Map() };
    return editorBatchContext.run(context, async () => {
      const result = await work({ transactional: true, tx });
      for (const write of context.writes.values()) {
        if (write.type === 'delete') tx.delete(write.ref);
        else if (write.type === 'update') tx.update(write.ref, write.data);
        else tx.set(write.ref, write.data, write.options || {});
      }
      return result;
    });
  });
}

export async function settingsGetAll() {
  const snap = await firestore.collection(COL.settings).get();
  return snap.docs.map((d) => ({ setting_key: d.id, setting_value: d.data().value ?? '' }));
}

export async function settingsGetByKeys(keys) {
  const docs = await Promise.all(
    keys.map((k) => firestore.collection(COL.settings).doc(k).get())
  );
  return docs
    .filter((d) => d.exists)
    .map((d) => ({ setting_key: d.id, setting_value: d.data().value ?? '' }));
}

export async function settingsUpsert(key, value) {
  await queueSet(firestore.collection(COL.settings).doc(key), { value: value ?? '' }, { merge: true });
}

export async function settingsSeed(defaults) {
  const batch = firestore.batch();
  for (const [key, value] of defaults) {
    const ref = firestore.collection(COL.settings).doc(key);
    batch.set(ref, { value }, { merge: true });
  }
  await batch.commit();
}

// ─── Downloads ───────────────────────────────────────────────────────────────

function periodStart(period) {
  const d = new Date();
  if (period === 'day') d.setHours(0, 0, 0, 0);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  else return null;
  return d;
}

const DOWNLOAD_RESERVATION_TTL_MS = 30 * 60 * 1000;

function reservationLockKey({ userId, resourceId, period, mode }) {
  return [
    Number(userId),
    mode === 'global' ? 'global' : Number(resourceId),
    period || 'month',
  ].join(':');
}

function reservationIsCounted(row, nowDate = new Date()) {
  if (row?.status !== 'reserved') return true;
  if (!row.reserved_until) return false;
  return new Date(row.reserved_until) > nowDate;
}

function quotaError({ used, max, period, mode }) {
  const error = new Error('Download limit reached.');
  error.code = 'DOWNLOAD_LIMIT';
  error.status = 429;
  error.quota = { used, max, period, mode };
  return error;
}

export async function downloadCreate(data) {
  const id = await nextId('downloads');
  await firestore.collection(COL.downloads).doc(String(id)).set({
    ...data,
    status: 'completed',
    request_id: data.request_id || null,
    resource_id: Number(data.resource_id),
    file_id: data.file_id ? Number(data.file_id) : null,
    user_id: data.user_id ? Number(data.user_id) : null,
    created_at: now(),
  });
  return { insertId: id };
}

export async function downloadIntentCreate(data) {
  const id = await nextId('download_intents');
  await firestore.collection(COL.downloadIntents).doc(String(id)).set({
    resource_id: Number(data.resource_id),
    file_id: Number(data.file_id),
    user_id: Number(data.user_id),
    ip_address: data.ip_address || null,
    user_agent: data.user_agent?.slice(0, 500) || null,
    created_at: now(),
  });
  return { insertId: id };
}

export async function downloadIntentRecent(limit = 20) {
  const snap = await firestore.collection(COL.downloadIntents)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
  const rows = fromDocs(snap);
  return Promise.all(rows.map(async (d) => {
    const resource = await resourceFindById(d.resource_id);
    const user = d.user_id ? await userFindById(d.user_id) : null;
    const file = d.file_id ? await fileFindById(d.file_id) : null;
    return {
      created_at: d.created_at,
      resource_title: resource?.title || null,
      file_label: file?.label || file?.original_name || null,
      user_name: user?.name || 'Anonymous',
      user_email: user?.email || null,
    };
  }));
}

export async function downloadCountByUser(userId, { resourceId = null, period = 'month', mode = 'global' } = {}) {
  const snap = await firestore.collection(COL.downloads)
    .where('user_id', '==', Number(userId))
    .get();
  let rows = fromDocs(snap).filter((row) => reservationIsCounted(row));
  const start = periodStart(period);
  if (start) rows = rows.filter((r) => r.created_at >= start);
  if (mode !== 'global' && resourceId) {
    rows = rows.filter((r) => r.resource_id === Number(resourceId));
  }
  return rows.length;
}

export async function downloadCount() {
  const snap = await firestore.collection(COL.downloads).get();
  return { total: fromDocs(snap).filter((row) => row.status !== 'reserved').length };
}

export async function downloadRecent(limit = 10) {
  const snap = await firestore.collection(COL.downloads)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();
  const rows = fromDocs(snap).filter((row) => row.status !== 'reserved');
  return Promise.all(rows.map(async (d) => {
    const resource = await resourceFindById(d.resource_id);
    const user = d.user_id ? await userFindById(d.user_id) : null;
    const file = d.file_id ? await fileFindById(d.file_id) : null;
    return {
      created_at: d.created_at,
      resource_title: resource?.title || null,
      resource_id: d.resource_id,
      file_id: d.file_id,
      file_label: file?.label || file?.original_name || null,
      user_name: user?.name || null,
      user_email: user?.email || null,
    };
  }));
}

export async function downloadReport(limit = 100) {
  const snap = await firestore.collection(COL.downloads)
    .orderBy('created_at', 'desc')
    .limit(500)
    .get();
  const downloads = fromDocs(snap).filter((row) => row.status !== 'reserved');

  const byFile = {};
  const byUser = {};
  const recent = [];

  for (const d of downloads) {
    const resource = await resourceFindById(d.resource_id);
    const user = d.user_id ? await userFindById(d.user_id) : null;
    const file = d.file_id ? await fileFindById(d.file_id) : null;
    const label = file?.label || file?.original_name || `File #${d.file_id}`;
    const fileKey = `${d.resource_id}:${d.file_id}`;

    if (!byFile[fileKey]) {
      byFile[fileKey] = {
        resource_id: d.resource_id,
        resource_title: resource?.title || null,
        file_id: d.file_id,
        file_label: label,
        count: 0,
      };
    }
    byFile[fileKey].count += 1;

    if (user) {
      const userKey = String(user.id);
      if (!byUser[userKey]) {
        byUser[userKey] = {
          user_id: user.id,
          user_name: user.name,
          user_email: user.email,
          total: 0,
          files: {},
        };
      }
      byUser[userKey].total += 1;
      byUser[userKey].files[fileKey] = byUser[userKey].files[fileKey] || {
        resource_title: resource?.title,
        file_label: label,
        count: 0,
      };
      byUser[userKey].files[fileKey].count += 1;
    }

    if (recent.length < limit) {
      recent.push({
        created_at: d.created_at,
        resource_title: resource?.title,
        file_label: label,
        user_name: user?.name || 'Anonymous',
        user_email: user?.email || null,
      });
    }
  }

  const perFile = Object.values(byFile).sort((a, b) => b.count - a.count);
  const perUser = Object.values(byUser)
    .map((u) => ({
      ...u,
      files: Object.values(u.files).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);

  const recentIntents = await downloadIntentRecent(Math.min(limit, 30));

  return { perFile, perUser, recent, recentIntents, total: downloads.length };
}

export async function downloadsByUser(userId) {
  const snap = await firestore.collection(COL.downloads)
    .where('user_id', '==', Number(userId))
    .get();
  const byResource = new Map();
  for (const d of fromDocs(snap).filter((row) => row.status !== 'reserved')) {
    const rid = Number(d.resource_id);
    const entry = byResource.get(rid);
    if (!entry) {
      byResource.set(rid, { count: 1, last: d.created_at, lastFileId: d.file_id || null });
    } else {
      entry.count += 1;
      if (new Date(d.created_at) > new Date(entry.last)) {
        entry.last = d.created_at;
        entry.lastFileId = d.file_id || entry.lastFileId;
      }
    }
  }
  const ordered = [...byResource.entries()].sort(
    (a, b) => new Date(b[1].last) - new Date(a[1].last)
  );
  const result = [];
  for (const [rid, info] of ordered) {
    const r = await resourceFindById(rid);
    if (!r?.is_published) continue;
    const cat = r.category_id ? await categoryFindById(r.category_id) : null;
    result.push({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      cover_image: r.cover_image,
      category_name: cat?.name || null,
      category_slug: cat?.slug || null,
      download_count: info.count,
      downloaded_at: info.last,
      last_file_id: info.lastFileId,
      files: await filesByResource(rid),
    });
  }
  return result;
}

// ─── Favorites ───────────────────────────────────────────────────────────────

function favDocId(userId, resourceId) {
  return `${userId}_${resourceId}`;
}

export async function favoriteFolderEnsureDefault(userId) {
  const snap = await firestore.collection(COL.favoriteFolders)
    .where('user_id', '==', Number(userId))
    .where('is_default', '==', true)
    .limit(1)
    .get();
  let defaultId;
  if (!snap.empty) {
    defaultId = Number(snap.docs[0].id);
  } else {
    defaultId = await nextId('favorite_folders');
    await firestore.collection(COL.favoriteFolders).doc(String(defaultId)).set({
      user_id: Number(userId),
      name: 'Default',
      is_default: true,
      created_at: now(),
    });
  }

  const favSnap = await firestore.collection(COL.favorites)
    .where('user_id', '==', Number(userId))
    .get();
  const batch = firestore.batch();
  let orphans = 0;
  favSnap.docs.forEach((doc) => {
    if (!doc.data().folder_id) {
      batch.update(doc.ref, { folder_id: defaultId });
      orphans += 1;
    }
  });
  if (orphans) await batch.commit();

  return defaultId;
}

export async function favoriteFolderFindById(id, userId) {
  const doc = await firestore.collection(COL.favoriteFolders).doc(String(id)).get();
  const row = fromDoc(doc);
  if (!row || Number(row.user_id) !== Number(userId)) return null;
  return row;
}

export async function favoriteFolderListByUser(userId) {
  await favoriteFolderEnsureDefault(userId);
  const snap = await firestore.collection(COL.favoriteFolders)
    .where('user_id', '==', Number(userId))
    .get();
  const folders = fromDocs(snap).sort((a, b) => {
    if (a.is_default) return -1;
    if (b.is_default) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const favSnap = await firestore.collection(COL.favorites)
    .where('user_id', '==', Number(userId))
    .get();
  const counts = {};
  fromDocs(favSnap).forEach((f) => {
    const fid = f.folder_id || 'none';
    counts[fid] = (counts[fid] || 0) + 1;
  });

  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    is_default: !!f.is_default,
    item_count: counts[f.id] || 0,
  }));
}

export async function favoriteFolderCreate(userId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Folder name is required.');
  const id = await nextId('favorite_folders');
  await firestore.collection(COL.favoriteFolders).doc(String(id)).set({
    user_id: Number(userId),
    name: trimmed,
    is_default: false,
    created_at: now(),
  });
  return { id, name: trimmed, is_default: false, item_count: 0 };
}

export async function favoriteListByUser(userId, folderId = null) {
  let snap = await firestore.collection(COL.favorites)
    .where('user_id', '==', Number(userId))
    .get();
  let rows = fromDocs(snap);
  if (folderId) {
    rows = rows.filter((f) => Number(f.folder_id) === Number(folderId));
  }
  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const folderMap = new Map();
  const folderSnap = await firestore.collection(COL.favoriteFolders)
    .where('user_id', '==', Number(userId))
    .get();
  fromDocs(folderSnap).forEach((f) => folderMap.set(f.id, f.name));

  const result = [];
  for (const f of rows) {
    const r = await resourceFindById(f.resource_id);
    if (!r?.is_published) continue;
    const cat = r.category_id ? await categoryFindById(r.category_id) : null;
    result.push({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      cover_image: r.cover_image,
      canva_url: r.canva_url || null,
      category_id: r.category_id,
      category_name: cat?.name || null,
      category_slug: cat?.slug || null,
      saved_at: f.created_at,
      folder_id: f.folder_id || null,
      folder_name: folderMap.get(f.folder_id) || null,
      files: await filesByResource(r.id),
    });
  }
  return result;
}

export async function favoriteIdsByUser(userId) {
  const snap = await firestore.collection(COL.favorites)
    .where('user_id', '==', Number(userId))
    .get();
  return fromDocs(snap).map((f) => f.resource_id);
}

export async function favoriteAdd(userId, resourceId, folderId = null) {
  let fid = folderId ? Number(folderId) : null;
  if (fid) {
    const folder = await favoriteFolderFindById(fid, userId);
    if (!folder) fid = await favoriteFolderEnsureDefault(userId);
  } else {
    fid = await favoriteFolderEnsureDefault(userId);
  }

  const id = favDocId(userId, resourceId);
  await firestore.collection(COL.favorites).doc(id).set({
    user_id: Number(userId),
    resource_id: Number(resourceId),
    folder_id: fid,
    created_at: now(),
  });
  return fid;
}

export async function favoriteRemove(userId, resourceId) {
  await firestore.collection(COL.favorites).doc(favDocId(userId, resourceId)).delete();
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function planFindPremium() {
  const snap = await firestore.collection(COL.plans).where('slug', '==', 'premium').limit(1).get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export async function planFindBySlug(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  if (!normalized) return null;
  const snap = await firestore.collection(COL.plans).where('slug', '==', normalized).limit(1).get();
  return snap.empty ? null : fromDoc(snap.docs[0]);
}

export async function planCreateFromConfig(data = {}) {
  const slug = String(data.slug || '').trim().toLowerCase();
  if (!slug) throw new Error('Plan slug is required.');
  const existing = await planFindBySlug(slug);
  if (existing) return { insertId: existing.id };
  const id = await nextId('plans');
  await firestore.collection(COL.plans).doc(String(id)).set({
    name: String(data.name || slug).slice(0, 150),
    slug,
    description: data.description || null,
    price: Number(data.price) || 0,
    interval_type: ['monthly', 'yearly', 'lifetime'].includes(data.interval_type) ? data.interval_type : 'monthly',
    is_active: 1,
    created_at: now(),
  });
  return { insertId: id };
}

export async function planCreatePremium() {
  const id = await nextId('plans');
  await firestore.collection(COL.plans).doc(String(id)).set({
    name: 'Premium',
    slug: 'premium',
    description: 'Assinatura',
    price: 0,
    interval_type: 'monthly',
    is_active: 1,
    created_at: now(),
  });
  return { insertId: id };
}

export async function subscriptionHasActive(userId) {
  const snap = await firestore.collection(COL.subscriptions)
    .where('user_id', '==', Number(userId))
    .where('status', '==', 'active')
    .get();
  const nowDate = new Date();
  return fromDocs(snap).some((s) => !s.ends_at || s.ends_at > nowDate);
}

export async function subscriptionGetStatus(userId) {
  const snap = await firestore.collection(COL.subscriptions)
    .where('user_id', '==', Number(userId))
    .where('status', '==', 'active')
    .get();
  const nowDate = new Date();
  const subs = fromDocs(snap)
    .filter((s) => !s.ends_at || s.ends_at > nowDate)
    .sort((a, b) => b.id - a.id);
  if (!subs.length) return { active: false };
  const sub = subs[0];
  const plan = sub.plan_id ? await firestore.collection(COL.plans).doc(String(sub.plan_id)).get() : null;
  const planData = fromDoc(plan) || {};
  return {
    active: true,
    planName: planData.name,
    price: planData.price,
    intervalType: planData.interval_type,
    endsAt: sub.ends_at,
  };
}

export async function subscriptionCancelActive(userId) {
  const snap = await firestore.collection(COL.subscriptions)
    .where('user_id', '==', Number(userId))
    .where('status', '==', 'active')
    .get();
  const batch = firestore.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { status: 'cancelled' }));
  await batch.commit();
}

export async function subscriptionActivate(userId, planId, months, tier = 'standard') {
  const id = await nextId('subscriptions');
  await firestore.collection(COL.subscriptions).doc(String(id)).set({
    user_id: Number(userId),
    plan_id: Number(planId),
    status: 'active',
    tier: tier === 'school' ? 'school' : 'standard',
    starts_at: now(),
    ends_at: dateAddMonths(months),
    renewal_reminder_sent_at: null,
    created_at: now(),
  });
}

// Tier ('school' | 'standard') da assinatura ativa mais recente, ou null.
export async function subscriptionActiveTier(userId) {
  const snap = await firestore.collection(COL.subscriptions)
    .where('user_id', '==', Number(userId))
    .where('status', '==', 'active')
    .get();
  const nowDate = new Date();
  const subs = fromDocs(snap)
    .filter((s) => !s.ends_at || s.ends_at > nowDate)
    .sort((a, b) => b.id - a.id);
  if (!subs.length) return null;
  return subs[0].tier || 'standard';
}

export async function subscriptionListNeedingReminder(daysBefore = 7) {
  const snap = await firestore.collection(COL.subscriptions)
    .where('status', '==', 'active')
    .get();
  const nowDate = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const targetStart = new Date(nowDate.getTime() + (daysBefore - 1) * dayMs);
  const targetEnd = new Date(nowDate.getTime() + (daysBefore + 1) * dayMs);

  return fromDocs(snap).filter((s) => {
    if (!s.ends_at || s.renewal_reminder_sent_at) return false;
    const ends = s.ends_at instanceof Date ? s.ends_at : new Date(s.ends_at);
    return ends >= targetStart && ends <= targetEnd;
  });
}

export async function subscriptionMarkReminderSent(subscriptionId) {
  await firestore.collection(COL.subscriptions).doc(String(subscriptionId)).update({
    renewal_reminder_sent_at: now(),
  });
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export async function pageViewCreate(data) {
  const id = await nextId('page_views');
  await firestore.collection(COL.pageViews).doc(String(id)).set({
    ...data,
    created_at: now(),
  });
}

function aggregatePageViews(rows) {
  const sessions = new Set(rows.map((r) => r.session_id).filter(Boolean));
  return { pageViews: rows.length, visitors: sessions.size };
}

export async function pageViewStats() {
  const snap = await firestore.collection(COL.pageViews).get();
  const all = fromDocs(snap);
  const nowDate = new Date();
  const todayStart = new Date(nowDate);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(nowDate);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(nowDate);
  monthStart.setDate(monthStart.getDate() - 30);
  const chartStart = new Date(nowDate);
  chartStart.setDate(chartStart.getDate() - 13);
  chartStart.setHours(0, 0, 0, 0);

  const today = all.filter((r) => r.created_at >= todayStart);
  const week = all.filter((r) => r.created_at >= weekStart);
  const month = all.filter((r) => r.created_at >= monthStart);

  const topMap = {};
  month.forEach((r) => {
    topMap[r.path] = (topMap[r.path] || 0) + 1;
  });
  const topPages = Object.entries(topMap)
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);

  const recentVisits = [...all]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 12)
    .map((r) => ({
      path: r.path,
      page_title: r.page_title,
      referrer: r.referrer,
      created_at: r.created_at,
    }));

  const dayMap = {};
  all.filter((r) => r.created_at >= chartStart).forEach((r) => {
    const day = r.created_at.toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = { views: 0, sessions: new Set() };
    dayMap[day].views += 1;
    if (r.session_id) dayMap[day].sessions.add(r.session_id);
  });
  const dailyChart = Object.entries(dayMap)
    .map(([day, v]) => ({ day, views: v.views, visitors: v.sessions.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const sourceMap = {};
  month.forEach((r) => {
    const key = sourceForRow(r);
    sourceMap[key] = (sourceMap[key] || 0) + 1;
  });
  const topTrafficSources = Object.entries(sourceMap)
    .map(([source, visits]) => ({ source, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  return {
    today: aggregatePageViews(today),
    week: aggregatePageViews(week),
    month: aggregatePageViews(month),
    total: aggregatePageViews(all),
    topPages,
    recentVisits,
    dailyChart,
    topTrafficSources,
  };
}

export async function userSignupSourceStats() {
  const users = await userList();
  const map = {};
  users.forEach((u) => {
    const key = sourceForRow({
      traffic_source: u.signup_source,
      referrer: u.signup_referrer,
      utm_source: u.signup_utm_source,
      utm_medium: u.signup_utm_medium,
    });
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

export async function resourceTopByDownloads(limit = 5) {
  const snap = await firestore.collection(COL.resources).get();
  return fromDocs(snap)
    .sort((a, b) => (b.download_count || 0) - (a.download_count || 0))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      title: r.title,
      download_count: r.download_count,
      view_count: r.view_count,
    }));
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function storageUpload(buffer, destPath, mimeType, options = {}) {
  const file = bucket.file(destPath);
  await file.save(buffer, {
    metadata: { contentType: mimeType },
    public: options.public !== false && String(destPath).startsWith('covers/'),
  });
  return options.public === false ? `gs://${bucket.name}/${destPath}` : `https://storage.googleapis.com/${bucket.name}/${destPath}`;
}

export async function storageCopy(sourcePath, destinationPath, mimeType, options = {}) {
  const source = bucket.file(sourcePath);
  const destination = bucket.file(destinationPath);
  await source.copy(destination);
  if (mimeType || options.public) {
    await destination.setMetadata({
      ...(mimeType ? { contentType: mimeType } : {}),
      ...(options.public ? { cacheControl: 'public,max-age=3600' } : {}),
    });
  }
  if (options.public) await destination.makePublic();
  return options.public ? `https://storage.googleapis.com/${bucket.name}/${destinationPath}` : `gs://${bucket.name}/${destinationPath}`;
}

export async function storageStat(storagePath) {
  const file = bucket.file(storagePath);
  const [metadata] = await file.getMetadata().catch(() => [null]);
  return metadata ? { size: Number(metadata.size) || 0, contentType: metadata.contentType || '' } : null;
}

export async function storageDownloadStream(storagePath) {
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) return null;
  return file.createReadStream();
}

export async function storageDelete(storagePath) {
  try {
    await bucket.file(storagePath).delete();
  } catch (error) {
    const code = Number(error?.code || error?.response?.status);
    if (code !== 404) throw error;
  }
}

export function localPathToStorage(localPath) {
  if (!localPath) return null;
  if (localPath.startsWith('https://')) return localPath;
  const clean = localPath.replace(/^\/uploads\//, '');
  return clean;
}

export async function setCounter(name, seq) {
  await firestore.collection(COL.counters).doc(name).set({ seq }, { merge: true });
}

export async function importDoc(collection, id, data) {
  await firestore.collection(collection).doc(String(id)).set(data, { merge: true });
}

export async function contactMessageCreate(data) {
  const id = await nextId('contact_messages');
  await firestore.collection(COL.contactMessages).doc(String(id)).set({
    name: data.name,
    email: data.email,
    message: data.message,
    status: data.status === 'read' ? 'read' : 'unread',
    read_at: data.status === 'read' ? now() : null,
    notification_status: data.notification_status || 'not_configured',
    created_at: now(),
  });
  return { insertId: id };
}

export async function stripeWebhookEventClaim(eventId) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('Stripe event id is required.');
  const ref = firestore.collection(COL.stripeWebhookEvents).doc(id);
  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.status === 'completed') return false;
      const createdAt = data.created_at?.toDate
        ? data.created_at.toDate().getTime()
        : new Date(data.created_at || 0).getTime();
      if (Number.isFinite(createdAt) && Date.now() - createdAt < 15 * 60 * 1000) return false;
      tx.update(ref, { status: 'processing', created_at: now() });
      return true;
    }
    tx.create(ref, { event_id: id, status: 'processing', created_at: now() });
    return true;
  });
}

export async function stripeWebhookEventComplete(eventId) {
  const ref = firestore.collection(COL.stripeWebhookEvents).doc(String(eventId));
  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) return false;
    tx.update(ref, { status: 'completed', completed_at: now() });
    return true;
  });
}

export async function stripeWebhookEventRelease(eventId) {
  const ref = firestore.collection(COL.stripeWebhookEvents).doc(String(eventId));
  return firestore.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists || existing.data()?.status !== 'processing') return false;
    tx.delete(ref);
    return true;
  });
}

// Reserve the quota slot and create the eventual download record in one
// Firestore transaction. The lock document makes the read/count/write cycle
// conflict for concurrent requests from different function instances, while
// request_id makes retries idempotent.
export async function downloadReserve(data) {
  const requestId = String(data.request_id || '').trim();
  if (!requestId) throw new Error('A download request id is required.');
  const userId = Number(data.user_id);
  const resourceId = Number(data.resource_id);
  const fileId = data.file_id ? Number(data.file_id) : null;
  const period = data.period || 'month';
  const mode = data.mode || 'global';
  const max = Number(data.max);
  const hasLimit = Number.isFinite(max) && max > 0;
  const lockRef = firestore.collection(COL.downloadQuotaLocks).doc(reservationLockKey({ userId, resourceId, period, mode }));
  const reservationRef = firestore.collection(COL.downloads).doc(requestId);
  const nowDate = new Date();

  return firestore.runTransaction(async (tx) => {
    await tx.get(lockRef);
    const existingDoc = await tx.get(reservationRef);
    const existing = fromDoc(existingDoc);
    if (existing?.status === 'completed') {
      return { id: requestId, requestId, alreadyCompleted: true, created: false };
    }
    if (existing?.status === 'reserved' && reservationIsCounted(existing, nowDate)) {
      return { id: requestId, requestId, alreadyReserved: true, created: false };
    }
    const snap = await tx.get(firestore.collection(COL.downloads).where('user_id', '==', userId));
    const start = periodStart(period);
    const rows = fromDocs(snap).filter((row) => {
      if (!reservationIsCounted(row, nowDate)) return false;
      if (start && new Date(row.created_at) < start) return false;
      return mode === 'global' || !resourceId || Number(row.resource_id) === resourceId;
    });
    const used = rows.length;
    if (hasLimit && used >= max) throw quotaError({ used, max, period, mode });

    const reservedUntil = Timestamp.fromDate(new Date(Date.now() + DOWNLOAD_RESERVATION_TTL_MS));
    tx.set(lockRef, { updated_at: now() }, { merge: true });
    tx.set(reservationRef, {
      request_id: requestId,
      status: 'reserved',
      resource_id: resourceId,
      file_id: fileId,
      user_id: userId,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent?.slice(0, 500) || null,
      created_at: now(),
      reserved_until: reservedUntil,
    });
    return { id: requestId, requestId, created: true, used: used + 1 };
  });
}

export async function downloadFinalize(requestId) {
  const ref = firestore.collection(COL.downloads).doc(String(requestId));
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data()?.status !== 'reserved') return false;
    tx.update(ref, { status: 'completed', reserved_until: null, completed_at: now() });
    return true;
  });
}

export async function downloadComplete(requestId, resourceId) {
  const downloadRef = firestore.collection(COL.downloads).doc(String(requestId));
  const resourceRef = firestore.collection(COL.resources).doc(String(resourceId));
  return firestore.runTransaction(async (tx) => {
    const downloadDoc = await tx.get(downloadRef);
    if (!downloadDoc.exists || downloadDoc.data()?.status !== 'reserved') return false;
    const resourceDoc = await tx.get(resourceRef);
    if (!resourceDoc.exists) throw new Error('Resource not found while completing download.');
    tx.update(downloadRef, { status: 'completed', reserved_until: null, completed_at: now() });
    tx.update(resourceRef, { download_count: FieldValue.increment(1) });
    return true;
  });
}

export async function downloadRelease(requestId) {
  const ref = firestore.collection(COL.downloads).doc(String(requestId));
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists || doc.data()?.status !== 'reserved') return false;
    tx.delete(ref);
    return true;
  });
}

export async function editorRevisionGet() {
  const doc = await firestore.collection(COL.settings).doc('editor_revision').get();
  return Number(doc.data()?.value) || 0;
}

export async function editorRevisionBump(expected = null) {
  const ref = firestore.collection(COL.settings).doc('editor_revision');
  const context = currentEditorBatch();
  if (context?.tx) {
    const doc = await context.tx.get(ref);
    const current = Number(doc.data()?.value) || 0;
    if (expected !== null && expected !== undefined && Number(expected) !== current) {
      const error = new Error('This site changed in another editor. Reload the latest version before publishing.');
      error.code = 'EDITOR_REVISION_CONFLICT';
      error.status = 409;
      throw error;
    }
    const next = current + 1;
    context.writes.set(ref.path, { type: 'set', ref, data: { value: String(next) }, options: { merge: true } });
    context.pending.set(ref.path, { deleted: false, data: { value: String(next) } });
    return next;
  }
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const current = Number(doc.data()?.value) || 0;
    if (expected !== null && expected !== undefined && Number(expected) !== current) {
      const error = new Error('This site changed in another editor. Reload the latest version before publishing.');
      error.code = 'EDITOR_REVISION_CONFLICT';
      error.status = 409;
      throw error;
    }
    const next = current + 1;
    tx.set(ref, { value: String(next) }, { merge: true });
    return next;
  });
}

export async function editorUploadSessionCreate(data) {
  const uploadId = String(data.upload_id);
  const row = {
    upload_id: uploadId,
    owner_id: Number(data.owner_id),
    name: String(data.name || 'upload').slice(0, 255),
    mime_type: String(data.mime_type || 'application/octet-stream'),
    size: Number(data.size) || 0,
    kind: data.kind === 'cover' ? 'cover' : 'file',
    chunk_size: Number(data.chunk_size) || 8 * 1024 * 1024,
    storage_path: data.storage_path || null,
    session_url: data.session_url || null,
    staged_path: data.staged_path || null,
    status: data.status || 'started',
    received_bytes: Number(data.received_bytes) || 0,
    last_chunk: data.last_chunk === undefined ? -1 : Number(data.last_chunk),
    expires_at: data.expires_at instanceof Date
      ? Timestamp.fromDate(data.expires_at)
      : (data.expires_at || Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))),
    created_at: now(),
    updated_at: now(),
  };
  await firestore.collection(COL.editorUploadSessions).doc(uploadId).set(row);
  return editorUploadSessionFind(uploadId, data.owner_id);
}

export async function editorUploadSessionFind(uploadId, ownerId = null) {
  const doc = await firestore.collection(COL.editorUploadSessions).doc(String(uploadId)).get();
  if (!doc.exists) return null;
  const row = fromDoc(doc);
  row.size = Number(row.size ?? row.size_bytes) || 0;
  if (ownerId !== null && ownerId !== undefined && Number(row.owner_id) !== Number(ownerId)) return null;
  return row;
}

export async function editorUploadSessionUpdate(uploadId, fields = {}) {
  const next = { ...fields, updated_at: now() };
  if (next.size_bytes !== undefined && next.size === undefined) {
    next.size = next.size_bytes;
    delete next.size_bytes;
  }
  if (next.expires_at instanceof Date) next.expires_at = Timestamp.fromDate(next.expires_at);
  await firestore.collection(COL.editorUploadSessions).doc(String(uploadId)).set(next, { merge: true });
  return editorUploadSessionFind(uploadId);
}

export async function editorUploadSessionDelete(uploadId, ownerId = null) {
  const ref = firestore.collection(COL.editorUploadSessions).doc(String(uploadId));
  if (ownerId !== null && ownerId !== undefined) {
    const current = await ref.get();
    if (!current.exists || Number(current.data()?.owner_id) !== Number(ownerId)) return false;
  }
  await ref.delete();
  return true;
}

export async function editorUploadSessionListExpired(before = new Date()) {
  const cutoff = before instanceof Date ? Timestamp.fromDate(before) : before;
  const snap = await firestore.collection(COL.editorUploadSessions)
    .where('expires_at', '<=', cutoff)
    .get();
  return fromDocs(snap).map((row) => ({ ...row, size: Number(row.size) || 0 }));
}

export async function interactionEventCreate(data) {
  const eventKey = data.event_key || data.client_event_id || null;
  const id = eventKey
    ? `key-${createHash('sha256').update(String(eventKey)).digest('hex')}`
    : String(await nextId('analytics_interactions'));
  const ref = firestore.collection(COL.interactionEvents).doc(String(id));
  if (eventKey) {
    const existing = await ref.get();
    if (existing.exists) return fromDoc(existing);
  }
  const row = {
    ...data,
    event_key: eventKey,
    created_at: now(),
  };
  await ref.set(row);
  return { id, ...row };
}

export async function interactionEventStats(limit = 30) {
  const snap = await firestore.collection(COL.interactionEvents).get();
  const events = fromDocs(snap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const byFile = new Map();
  for (const event of events) {
    if (!event.file_id || !event.resource_id) continue;
    const key = `${event.resource_id}:${event.file_id}`;
    const row = byFile.get(key) || {
      resource_id: event.resource_id,
      resource_title: event.resource_title || 'Resource',
      file_id: event.file_id,
      file_label: event.file_label || 'File',
      previews: 0,
      page_clicks: 0,
      download_clicks: 0,
      download_page_opens: 0,
      download_started: 0,
      download_completed: 0,
    };
    if (event.event_name === 'resource_preview_open') row.previews += 1;
    if (event.event_name === 'resource_page_click') row.page_clicks += 1;
    if (event.event_name === 'resource_download_click') row.download_clicks += 1;
    if (event.event_name === 'download_page_open') row.download_page_opens += 1;
    if (event.event_name === 'download_started') row.download_started += 1;
    if (event.event_name === 'download_completed') row.download_completed += 1;
    byFile.set(key, row);
  }
  return {
    recent: events.slice(0, limit),
    perFile: [...byFile.values()].sort((a, b) =>
      (b.previews + b.page_clicks + b.download_clicks) - (a.previews + a.page_clicks + a.download_clicks)
    ),
    totals: events.reduce((acc, event) => {
      acc[event.event_name] = (acc[event.event_name] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function contactMessageList() {
  const snap = await firestore.collection(COL.contactMessages).orderBy('created_at', 'desc').get();
  return fromDocs(snap).map((row) => ({
    ...row,
    status: row.status === 'read' ? 'read' : 'unread',
    read_at: row.read_at?.toDate ? row.read_at.toDate() : (row.read_at || null),
    notification_status: row.notification_status || 'not_configured',
  }));
}

export async function contactMessageUpdate(id, changes = {}) {
  const data = {};
  if (changes.status === 'read' || changes.status === 'unread') {
    data.status = changes.status;
    data.read_at = changes.status === 'read' ? now() : null;
  }
  if (['not_configured', 'sent', 'failed'].includes(changes.notification_status)) {
    data.notification_status = changes.notification_status;
  }
  if (Object.keys(data).length) {
    await firestore.collection(COL.contactMessages).doc(String(id)).set(data, { merge: true });
  }
}

// Categories are hierarchical. Archiving a parent must hide its entire
// subtree from public pages even when a child itself is still active.
function publicCategorySet(categories) {
  const byId = new Map(categories.map((category) => [Number(category.id), category]));
  const memo = new Map();
  function isPublic(id, visiting = new Set()) {
    const key = Number(id);
    if (!key) return true;
    if (memo.has(key)) return memo.get(key);
    if (visiting.has(key)) {
      // Corrupt or concurrently-written hierarchy: fail closed instead of
      // recursing forever and taking public resource reads down.
      memo.set(key, false);
      return false;
    }
    const category = byId.get(key);
    if (!category || category.is_archived) {
      memo.set(key, false);
      return false;
    }
    const nextVisiting = new Set(visiting);
    nextVisiting.add(key);
    const result = !category.parent_id || isPublic(category.parent_id, nextVisiting);
    memo.set(key, result);
    return result;
  }
  return new Set(categories.filter((category) => isPublic(category.id)).map((category) => Number(category.id)));
}

export async function contactMessageDelete(id) {
  await firestore.collection(COL.contactMessages).doc(String(id)).delete();
}

export { COL };
