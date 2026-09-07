import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { sourceForRow } from '../utils/attribution.js';

const DATA_FILE = path.resolve(process.env.JER_MEMORY_DATA_FILE || 'uploads/db_data.json');

const DEFAULT_ADMIN_HASH = bcrypt.hashSync('admin123', 10);

const initialData = {
  users: [
    {
      id: 1,
      name: 'Administrator',
      email: 'admin@example.com',
      password_hash: DEFAULT_ADMIN_HASH,
      role: 'admin',
      is_blocked: 0,
      avatar_url: null,
      created_at: new Date().toISOString(),
    },
  ],
  categories: [
    { id: 1, name: 'HEBREW LANGUAGE', slug: 'hebrew-language', description: 'Hebrew Language & Alphabet', parent_id: null, sort_order: 1, nav_visible: 1, is_archived: 0 },
    { id: 2, name: 'READING - KRIYA', slug: 'reading-kriya', description: 'Reading & Kriya Practice', parent_id: null, sort_order: 2, nav_visible: 1, is_archived: 0 },
    { id: 3, name: 'MAAGAL HASHANAH', slug: 'maagal-hashanah', description: 'Holiday Cycle & Jewish Calendar', parent_id: null, sort_order: 3, nav_visible: 1, is_archived: 0 },
    { id: 4, name: 'YEDIOS KLALIYOS', slug: 'yedios-klaliyos', description: 'General Jewish Knowledge', parent_id: null, sort_order: 4, nav_visible: 1, is_archived: 0 },
    { id: 5, name: 'TEFILLAH', slug: 'tefillah', description: 'Prayers & Tefillah', parent_id: null, sort_order: 5, nav_visible: 1, is_archived: 0 },
  ],
  resources: [
    {
      id: 1,
      title: 'Hebrew Alphabet — Aleph-Bet',
      slug: 'alfabeto-hebraico-aleph-bet',
      description: 'Activities and worksheets for learning the 22 letters of the Aleph-Bet.',
      category_id: 3,
      grade_level: 'Early Childhood',
      material_type: 'Worksheet',
      cover_image: '/images/hero/hero-worksheet.png',
      is_archived: 0,
      sort_order: 0,
      is_free: 1,
      view_count: 12,
      download_count: 5,
      created_by: 1,
      created_at: new Date().toISOString(),
    },
  ],
  files: [],
  settings: {
    site_name: 'Jewish Educational Resources',
    site_description: 'Library of digital and printable Jewish educational materials.',
    site_tagline: 'Jewish materials for early childhood education and schools',
    hero_title: 'WHERE LEARNING FLOURISHES',
    hero_lead: 'Hebrew, Torah, holidays and more for early childhood Jewish education and schools.',
    hero_content_align: 'left',
    home_hero_cta_primary_show: 'true',
    home_hero_cta_secondary_show: 'true',
    social_facebook: '',
    social_pinterest: 'https://www.pinterest.com/jewisheducationalresources1/',
    social_instagram: '',
    social_youtube: '',
    google_analytics_id: 'G-HHPLFCMXZC',
    home_quick_topics: JSON.stringify([
      { id: 'aleph-bet', label: 'Aleph-Bet', targetType: 'search', target: '/library?q=hebrew', icon: 'bi bi-translate', visible: true, sortOrder: 0 },
      { id: 'parashah', label: 'Parashah', targetType: 'search', target: '/library?q=parashah', icon: 'bi bi-book', visible: true, sortOrder: 1 },
      { id: 'chanukah', label: 'Chanukah', targetType: 'search', target: '/library?q=chanukah', icon: 'bi bi-stars', visible: true, sortOrder: 2 },
      { id: 'coloring', label: 'Coloring', targetType: 'search', target: '/library?q=coloring', icon: 'bi bi-palette', visible: true, sortOrder: 3 },
      { id: 'torah', label: 'Torah', targetType: 'search', target: '/library?q=torah', icon: 'bi bi-journal-bookmark', visible: true, sortOrder: 4 },
      { id: 'view-all', label: 'View all', targetType: 'url', target: '/library', icon: 'bi bi-collection', visible: true, sortOrder: 5 },
    ]),
    grade_levels: 'Basic\nIntermediate\nAdvanced',
    // Match the production migration defaults: free users can download up to
    // ten individual sheets per day, while premium access remains unlimited.
    download_limit_enabled: 'true',
    download_limit_max: '10',
    download_limit_period: 'day',
    download_limit_mode: 'global',
    contact_notify_email: 'jewisheducationalresources1@gmail.com',
    contact_redirect_url: '',
    contact_redirect_delay: '0',
  },
  downloads: [],
  downloadIntents: [],
  favorites: [],
  favoriteFolders: [],
  subscriptions: [],
  plans: [],
  pageViews: [],
  interactionEvents: [],
  contactMessages: [],
  editorUploadSessions: [],
  stripeWebhookEvents: [],
  counters: { users: 1, categories: 5, resources: 1, files: 0, downloads: 0 },
};

function normalizeResourceCounters(resources = []) {
  return resources.map((resource) => ({
    ...resource,
    // Older memory snapshots did not persist publication/archive flags. Keep
    // their behavior aligned with MySQL/Firestore: a missing publication flag
    // means published, while explicit string false values remain private.
    is_published: booleanFlag(resource.is_published, true) ? 1 : 0,
    is_archived: booleanFlag(resource.is_archived, false) ? 1 : 0,
    view_count: Number(resource.view_count ?? resource.views_count ?? 0),
    download_count: Number(resource.download_count ?? resource.downloads_count ?? 0),
  }));
}

function normalizeCounters(data) {
  const counters = { ...(data.counters || {}) };
  ['users', 'categories', 'resources', 'files', 'downloads', 'downloadIntents', 'interactionEvents'].forEach((collection) => {
    const rows = Array.isArray(data[collection]) ? data[collection] : [];
    const maxId = rows.reduce((max, row) => Math.max(max, Number(row?.id) || 0), 0);
    counters[collection] = Math.max(Number(counters[collection]) || 0, maxId);
  });
  return counters;
}

function loadData() {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      const merged = {
        ...initialData,
        ...parsed,
        settings: { ...initialData.settings, ...(parsed.settings || {}) },
        editorUploadSessions: Array.isArray(parsed.editorUploadSessions) ? parsed.editorUploadSessions : [],
        stripeWebhookEvents: Array.isArray(parsed.stripeWebhookEvents) ? parsed.stripeWebhookEvents : [],
        counters: normalizeCounters({ ...initialData, ...parsed }),
      };
      merged.resources = normalizeResourceCounters(merged.resources);
      merged.downloads = Array.isArray(merged.downloads) ? merged.downloads : [];
      merged.plans = Array.isArray(merged.plans) ? merged.plans : [];
      return merged;
    }
  } catch (err) {
    console.error('Erro ao ler DB fallback:', err.message);
  }
  const normalizedInitialData = {
    ...initialData,
    resources: normalizeResourceCounters(initialData.resources),
    counters: normalizeCounters(initialData),
  };
  saveData(normalizedInitialData);
  return normalizedInitialData;
}

function saveData(data) {
  try {
    if (!fs.existsSync(path.dirname(DATA_FILE))) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar DB fallback:', err.message);
  }
}

let state = loadData();

function nextId(collectionName) {
  state.counters[collectionName] = (state.counters[collectionName] || 0) + 1;
  saveData(state);
  return state.counters[collectionName];
}

function booleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return value === true || value === 1;
}

function withCollectionAliases(items, key, total, totalPages) {
  Object.defineProperty(items, key, { value: items, enumerable: false });
  if (total !== undefined) Object.defineProperty(items, 'total', { value: total, enumerable: false });
  if (totalPages !== undefined) Object.defineProperty(items, 'totalPages', { value: totalPages, enumerable: false });
  return items;
}

// --- Users ---
export async function userFindById(id) {
  const u = state.users.find((x) => x.id === Number(id));
  return u ? { ...u } : null;
}

export async function userFindByEmail(email) {
  const u = state.users.find((x) => String(x.email || '').toLowerCase() === String(email).trim().toLowerCase());
  return u ? { ...u } : null;
}

export async function userCreate(data) {
  const email = String(data.email || '').trim().toLowerCase();
  if (state.users.some((user) => String(user.email || '').trim().toLowerCase() === email)) {
    const error = new Error('Duplicate user email.');
    error.code = 'ER_DUP_ENTRY';
    throw error;
  }
  const id = nextId('users');
  const user = {
    id,
    name: data.name,
    email,
    password_hash: data.password_hash,
    role: data.role || 'user',
    avatar_url: data.avatar_url || null,
    is_blocked: booleanFlag(data.is_blocked, false) ? 1 : 0,
    account_type: data.account_type || 'free',
    signup_method: data.signup_method || null,
    signup_source: data.signup_source || null,
    signup_referrer: data.signup_referrer || null,
    signup_utm_source: data.signup_utm_source || null,
    signup_utm_medium: data.signup_utm_medium || null,
    signup_utm_campaign: data.signup_utm_campaign || null,
    signup_landing_path: data.signup_landing_path || null,
    stripe_customer_id: data.stripe_customer_id || null,
    stripe_subscription_id: data.stripe_subscription_id || null,
    created_at: new Date().toISOString(),
  };
  state.users.push(user);
  saveData(state);
  return { ...user, insertId: id };
}

export async function userUpdate(id, data) {
  const idx = state.users.findIndex((x) => x.id === Number(id));
  if (idx !== -1) {
    state.users[idx] = { ...state.users[idx], ...data };
    saveData(state);
    return state.users[idx];
  }
  return null;
}

export async function userDelete(id) {
  state.users = state.users.filter((x) => x.id !== Number(id));
  saveData(state);
  return true;
}

export async function purgeNonAdminUsers() {
  const deleted = state.users.filter((user) => user.role !== 'admin');
  const deletedIds = new Set(deleted.map((user) => Number(user.id)));
  const relatedCollections = [
    'favorites', 'favoriteFolders', 'downloads', 'downloadIntents',
    'subscriptions', 'pageViews', 'interactionEvents',
  ];
  let relatedRemoved = 0;
  for (const collection of relatedCollections) {
    const rows = Array.isArray(state[collection]) ? state[collection] : [];
    const kept = rows.filter((row) => !deletedIds.has(Number(row.user_id)));
    relatedRemoved += rows.length - kept.length;
    state[collection] = kept;
  }
  state.users = state.users.filter((x) => x.role === 'admin');
  saveData(state);
  return {
    admins: state.users.map((user) => ({ id: user.id, name: user.name, email: user.email })),
    deleted: deleted.map((user) => ({ id: user.id, name: user.name, email: user.email })),
    relatedRemoved,
  };
}

export async function userList({ page = 1, limit = 20, search = '' } = {}) {
  let list = [...state.users];
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((u) => u.name?.toLowerCase().includes(s) || u.email?.toLowerCase().includes(s));
  }
  const total = list.length;
  return withCollectionAliases(list, 'users', total, total ? 1 : 0);
}

export async function userCount() {
  return { total: state.users.length };
}

export async function userFindByResetToken(token) {
  const user = state.users.find((u) => u.reset_token === token
    && u.reset_token_expires
    && new Date(u.reset_token_expires).getTime() > Date.now());
  return user ? { id: user.id } : null;
}

// --- Categories ---
export async function categoryFindById(id) {
  return state.categories.find((c) => c.id === Number(id)) || null;
}

export async function categoryFindBySlug(slug) {
  return state.categories.find((c) => c.slug === slug) || null;
}

export async function categorySlugExists(slug, excludeId = null) {
  return state.categories.some((c) => c.slug === slug && c.id !== Number(excludeId));
}

export async function categoryListAll() {
  return [...state.categories];
}

export async function categoryChildren(parentId) {
  return state.categories.filter((c) => c.parent_id === Number(parentId));
}

export async function categoryCreate(data) {
  const parentId = data.parent_id ? Number(data.parent_id) : null;
  if (parentId && !state.categories.some((category) => Number(category.id) === parentId)) {
    const error = new Error('Invalid parent category.');
    error.status = 400;
    throw error;
  }
  const id = nextId('categories');
  const cat = {
    id,
    name: data.name,
    slug: data.slug,
    description: data.description || '',
    parent_id: parentId,
    sort_order: data.sort_order || 0,
    nav_visible: data.nav_visible === undefined ? 1 : Number(data.nav_visible) ? 1 : 0,
    is_archived: data.is_archived ? 1 : 0,
  };
  state.categories.push(cat);
  saveData(state);
  return { ...cat, insertId: id };
}

export async function categoryUpdate(id, data) {
  const idx = state.categories.findIndex((c) => c.id === Number(id));
  if (idx !== -1) {
    const next = { ...state.categories[idx], ...data };
    if (Object.prototype.hasOwnProperty.call(data, 'parent_id')) {
      const parentId = data.parent_id ? Number(data.parent_id) : null;
      const visited = new Set();
      let current = parentId;
      while (current) {
        if (current === Number(id) || visited.has(current)) {
          const error = new Error('Category hierarchy contains a cycle.');
          error.status = 400;
          throw error;
        }
        visited.add(current);
        const parent = state.categories.find((category) => Number(category.id) === current);
        if (!parent) {
          const error = new Error('Invalid parent category.');
          error.status = 400;
          throw error;
        }
        current = parent.parent_id ? Number(parent.parent_id) : null;
      }
      next.parent_id = parentId;
    }
    state.categories[idx] = next;
    saveData(state);
    return state.categories[idx];
  }
  return null;
}

export async function categoryDelete(id) {
  state.categories = state.categories.filter((c) => c.id !== Number(id));
  saveData(state);
  return true;
}

export async function categoryGetDescendantIds(id) {
  const result = [Number(id)];
  const queue = [Number(id)];
  while (queue.length) {
    const curr = queue.shift();
    const children = state.categories.filter((c) => c.parent_id === curr).map((c) => c.id);
    for (const ch of children) {
      if (!result.includes(ch)) {
        result.push(ch);
        queue.push(ch);
      }
    }
  }
  return result;
}

export async function categoryListWithCounts() {
  return state.categories.filter((c) => !c.is_archived).map((c) => {
    const count = state.resources.filter((r) => r.category_id === c.id && !r.is_archived && r.is_published !== 0).length;
    return { ...c, resource_count: count };
  });
}

// --- Resources ---
export async function resourceFindById(id) {
  const r = state.resources.find((x) => x.id === Number(id));
  if (!r) return null;
  const cat = state.categories.find((c) => c.id === r.category_id);
  const author = state.users.find((u) => u.id === r.created_by);
  return {
    ...r,
    category_name: cat?.name || '',
    category_slug: cat?.slug || '',
    author_name: author?.name || 'Admin',
  };
}

export async function resourceFindBySlug(slug, publishedOnly = true) {
  const r = state.resources.find((x) => x.slug === slug);
  if (!r) return null;
  if (publishedOnly && (!r.is_published || r.is_archived)) return null;
  if (publishedOnly && r.category_id) {
    const category = state.categories.find((c) => c.id === r.category_id);
    const visited = new Set();
    let current = category;
    while (current) {
      if (current.is_archived) return null;
      if (visited.has(current.id)) return null;
      visited.add(current.id);
      current = current.parent_id ? state.categories.find((c) => c.id === current.parent_id) : null;
    }
  }
  return resourceFindById(r.id);
}

export async function resourceSlugExists(slug, excludeId = null) {
  return state.resources.some((r) => r.slug === slug && r.id !== Number(excludeId));
}

export async function resourceCreate(data) {
  const id = nextId('resources');
  const isPremium = data.is_premium !== undefined
    ? (data.is_premium ? 1 : 0)
    : (data.is_free !== undefined ? (Number(data.is_free) ? 0 : 1) : 0);
  const res = {
    id,
    title: data.title,
    slug: data.slug,
    description: data.description || '',
    content_description: data.content_description || '',
    age_range: data.age_range || null,
    keywords: data.keywords || null,
    action_visibility: data.action_visibility || null,
    category_id: Number(data.category_id) || null,
    grade_level: data.grade_level || null,
    material_type: data.material_type || null,
    google_slides_url: data.google_slides_url || null,
    canva_url: data.canva_url || null,
    cover_image: data.cover_image || null,
    cover_hidden: data.cover_hidden ? 1 : 0,
    display_mode: data.display_mode || 'default',
    download_limit_max: data.download_limit_max || null,
    download_limit_period: data.download_limit_period || null,
    school_only: data.school_only ? 1 : 0,
    page_layout: data.page_layout || null,
    is_published: data.is_published === undefined ? 1 : (data.is_published ? 1 : 0),
    is_premium: isPremium,
    is_free: data.is_free !== undefined ? Number(data.is_free) : (isPremium ? 0 : 1),
    view_count: 0,
    download_count: 0,
    created_by: Number(data.created_by) || 1,
    is_archived: data.is_archived ? 1 : 0,
    sort_order: Number(data.sort_order) || 0,
    created_at: new Date().toISOString(),
  };
  state.resources.push(res);
  saveData(state);
  return { ...res, insertId: id };
}

export async function resourceUpdate(id, data) {
  const idx = state.resources.findIndex((r) => r.id === Number(id));
  if (idx !== -1) {
    state.resources[idx] = { ...state.resources[idx], ...data };
    saveData(state);
    return state.resources[idx];
  }
  return null;
}

export async function resourceDelete(id) {
  state.resources = state.resources.filter((r) => r.id !== Number(id));
  state.files = state.files.filter((f) => f.resource_id !== Number(id));
  saveData(state);
  return true;
}

export async function resourceCoverReferenceCount(storagePath, excludeId = null) {
  const target = String(storagePath || '').replace(/^\/+/, '').replace(/^uploads\//, '');
  if (!target) return 0;
  return state.resources.filter((resource) => {
    if (excludeId !== null && Number(resource.id) === Number(excludeId)) return false;
    const value = String(resource.cover_image || '').replace(/^\/+/, '').replace(/^uploads\//, '');
    return value === target || value.endsWith(`/${target}`);
  }).length;
}

export async function resourceIncrementViews(id) {
  const r = state.resources.find((x) => x.id === Number(id));
  if (r) {
    r.view_count = (r.view_count || 0) + 1;
    saveData(state);
  }
}

export async function resourceIncrementDownloads(id) {
  const r = state.resources.find((x) => x.id === Number(id));
  if (r) {
    r.download_count = (r.download_count || 0) + 1;
    saveData(state);
  }
}

export async function resourceAdminList({ page = 1, limit = 20, search = '', categoryId = null } = {}) {
  let list = [...state.resources];
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((r) => r.title.toLowerCase().includes(s));
  }
  if (categoryId) list = list.filter((r) => r.category_id === Number(categoryId));
  const total = list.length;
  const items = list.map((r) => {
    const cat = state.categories.find((c) => c.id === r.category_id);
    return { ...r, category_name: cat?.name || '' };
  });
  return withCollectionAliases(items, 'resources', total, total ? 1 : 0);
}

export async function resourceListFiltered(input = {}) {
  const params = input.params || input;
  const limit = Number(input.limit || params.limit) || 20;
  const offset = Number.isFinite(Number(input.offset)) ? Number(input.offset) : ((Number(params.page) || 1) - 1) * limit;
  const categoryId = params.categoryId || null;
  const categoryIds = params.categoryIds || null;
  const q = params.q || '';
  const grade = params.grade || '';
  const type = params.type || '';
  const materialType = params.materialType || '';
  const orderBy = input.orderBy || params.orderBy || 'newest';
  const publicCategory = (categoryIdValue) => {
    const visited = new Set();
    let current = state.categories.find((c) => c.id === categoryIdValue);
    while (current) {
      if (current.is_archived || visited.has(current.id)) return false;
      visited.add(current.id);
      current = current.parent_id ? state.categories.find((c) => c.id === current.parent_id) : null;
    }
    return true;
  };
  let list = state.resources.filter((r) => !r.is_archived && r.is_published !== 0 && publicCategory(r.category_id));
  if (categoryId) list = list.filter((r) => r.category_id === Number(categoryId));
  if (categoryIds && categoryIds.length) list = list.filter((r) => categoryIds.includes(r.category_id));
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((r) => r.title?.toLowerCase().includes(s) || r.description?.toLowerCase().includes(s));
  }
  if (grade) list = list.filter((r) => r.grade_level === grade);
  if (materialType) list = list.filter((r) => r.material_type === materialType);
  if (type) {
    list = list.filter((r) => {
      const files = state.files.filter((file) => file.resource_id === Number(r.id) && !file.is_archived);
      return type === 'presentation'
        ? !!r.canva_url || files.some((file) => ['ppt', 'pptx'].includes(String(file.file_type || '').toLowerCase()))
        : files.some((file) => String(file.file_type || '').toLowerCase() === String(type).toLowerCase());
    });
  }

  const sorters = {
    featured: (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || new Date(b.created_at || 0) - new Date(a.created_at || 0),
    newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    oldest: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
    downloads: (a, b) => (b.download_count || 0) - (a.download_count || 0),
    views: (a, b) => (b.view_count || 0) - (a.view_count || 0),
    title_asc: (a, b) => String(a.title || '').localeCompare(String(b.title || '')),
    title_desc: (a, b) => String(b.title || '').localeCompare(String(a.title || '')),
  };
  list.sort(sorters[orderBy] || sorters.newest);

  const total = list.length;
  const items = list.slice(offset, offset + limit).map((r) => {
    const cat = state.categories.find((c) => c.id === r.category_id);
    const files = state.files.filter((file) => file.resource_id === Number(r.id) && !file.is_archived);
    const primary = [...files].sort((a, b) => Number(b.is_primary || 0) - Number(a.is_primary || 0)
      || Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || Number(a.id) - Number(b.id))[0];
    return {
      ...r,
      category_name: cat?.name || '',
      file_types: [...new Set(files.map((file) => file.file_type).filter(Boolean))].sort().join(',') || null,
      file_count: files.length,
      primary_file_id: primary?.id || null,
    };
  });
  return { resources: items, total, totalPages: Math.ceil(total / limit) };
}

// --- Files ---
export async function fileFindById(id) {
  return state.files.find((f) => f.id === Number(id)) || null;
}

export async function fileFindByIdAndResource(fileId, resourceId) {
  const file = state.files.find((f) => f.id === Number(fileId) && f.resource_id === Number(resourceId));
  if (!file) return null;
  const resource = state.resources.find((r) => r.id === Number(resourceId));
  return { ...file, is_published: resource?.is_published ?? 1 };
}

export async function filesByResource(resourceId, options = {}) {
  return state.files.filter((f) => f.resource_id === Number(resourceId) && (options === true || options?.includeArchived === true || !f.is_archived));
}

export async function fileCreate(resourceIdOrData, maybeData) {
  const id = nextId('files');
  const data = maybeData === undefined ? resourceIdOrData : { resource_id: resourceIdOrData, ...maybeData };
  const file = {
    id,
    is_archived: 0,
    ...data,
    resource_id: data.resource_id == null ? null : Number(data.resource_id),
  };
  state.files.push(file);
  saveData(state);
  return { ...file, insertId: id };
}

export async function fileUpdate(id, data) {
  const idx = state.files.findIndex((f) => f.id === Number(id));
  if (idx !== -1) {
    state.files[idx] = { ...state.files[idx], ...data };
    saveData(state);
    return state.files[idx];
  }
  return null;
}

export async function fileDelete(id) {
  state.files = state.files.filter((f) => f.id !== Number(id));
  saveData(state);
  return true;
}

export async function fileMaxSortOrder(resourceId) {
  const list = state.files.filter((f) => f.resource_id === Number(resourceId));
  if (!list.length) return { maxOrder: -1 };
  return { maxOrder: Math.max(...list.map((f) => f.sort_order || 0)) };
}

// Resumable editor uploads are deliberately persisted in the same local
// fallback store as the content data.  This lets a browser reload resume a
// session without trusting metadata supplied by the next request.
export async function editorUploadSessionCreate(data) {
  const session = {
    upload_id: String(data.upload_id),
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
    created_at: data.created_at || new Date().toISOString(),
    updated_at: data.updated_at || new Date().toISOString(),
    expires_at: data.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  state.editorUploadSessions = (state.editorUploadSessions || []).filter((item) => item.upload_id !== session.upload_id);
  state.editorUploadSessions.push(session);
  saveData(state);
  return { ...session };
}

export async function editorUploadSessionFind(uploadId, ownerId = null) {
  const session = (state.editorUploadSessions || []).find((item) => (
    item.upload_id === String(uploadId)
    && (ownerId === null || Number(item.owner_id) === Number(ownerId))
  ));
  return session ? { ...session } : null;
}

export async function editorUploadSessionUpdate(uploadId, fields = {}) {
  const index = (state.editorUploadSessions || []).findIndex((item) => item.upload_id === String(uploadId));
  if (index < 0) return null;
  const next = {
    ...state.editorUploadSessions[index],
    ...fields,
    updated_at: new Date().toISOString(),
  };
  state.editorUploadSessions[index] = next;
  saveData(state);
  return { ...next };
}

export async function editorUploadSessionDelete(uploadId, ownerId = null) {
  const before = (state.editorUploadSessions || []).length;
  state.editorUploadSessions = (state.editorUploadSessions || []).filter((item) => !(
    item.upload_id === String(uploadId)
    && (ownerId === null || Number(item.owner_id) === Number(ownerId))
  ));
  if (state.editorUploadSessions.length !== before) saveData(state);
  return state.editorUploadSessions.length !== before;
}

export async function editorUploadSessionListExpired(before = new Date()) {
  const cutoff = new Date(before).getTime();
  return (state.editorUploadSessions || [])
    .filter((item) => new Date(item.expires_at || 0).getTime() <= cutoff)
    .map((item) => ({ ...item }));
}

// The in-memory adapter has no external transaction to open. Keeping the
// same interface lets the editor route use one publish boundary everywhere.
export async function withTransaction(work) {
  return work({ transactional: false });
}

export async function fileClearBundleFlags(resourceId, exceptId = null) {
  state.files.forEach((f) => {
    if (f.resource_id === Number(resourceId) && String(f.id) !== String(exceptId)) {
      f.is_bundle = 0;
      f.premium_only = 0;
    }
  });
  saveData(state);
}

// --- Settings ---
export async function settingsGetAll() {
  return Object.entries(state.settings).map(([setting_key, setting_value]) => ({
    setting_key,
    setting_value,
  }));
}

export async function settingsGetByKeys(keys) {
  const set = new Set(keys);
  return Object.entries(state.settings)
    .filter(([k]) => set.has(k))
    .map(([setting_key, setting_value]) => ({ setting_key, setting_value }));
}

export async function settingsUpsert(key, value) {
  state.settings[key] = String(value ?? '');
  saveData(state);
}

export async function settingsSeed(entries) {
  for (const [k, v] of Object.entries(entries)) {
    if (state.settings[k] === undefined) {
      state.settings[k] = String(v ?? '');
    }
  }
  saveData(state);
}

export async function editorRevisionGet() {
  return Number(state.settings.editor_revision) || 0;
}

export async function editorRevisionBump(expected = null) {
  const current = Number(state.settings.editor_revision) || 0;
  if (expected !== null && expected !== undefined && Number(expected) !== current) {
    const error = new Error('This site changed in another editor. Reload the latest version before publishing.');
    error.code = 'EDITOR_REVISION_CONFLICT';
    error.status = 409;
    throw error;
  }
  state.settings.editor_revision = String(current + 1);
  saveData(state);
  return current + 1;
}

// --- Downloads ---
const DOWNLOAD_RESERVATION_TTL_MS = 30 * 60 * 1000;

function periodStart(period, now = new Date()) {
  const start = new Date(now);
  if (period === 'day') start.setHours(0, 0, 0, 0);
  else if (period === 'week') {
    start.setDate(start.getDate() - 7);
  } else if (period === 'month') {
    start.setMonth(start.getMonth() - 1);
  } else if (period === 'year') {
    start.setFullYear(start.getFullYear() - 1);
  } else if (period === 'forever') return new Date(0);
  else start.setMonth(start.getMonth() - 1);
  return start;
}

function isActiveReservation(download, now = Date.now()) {
  return download.status === 'reserved' && new Date(download.reserved_until || 0).getTime() > now;
}

function isCompletedDownload(download) {
  return download.status !== 'reserved';
}

function quotaError(used, max) {
  const error = new Error('Download limit reached.');
  error.code = 'DOWNLOAD_LIMIT';
  error.status = 429;
  error.used = used;
  error.max = max;
  return error;
}

function quotaUsage(userId, { resourceId = null, period = 'month', mode = 'global' } = {}) {
  const since = periodStart(period).getTime();
  const now = Date.now();
  return state.downloads.filter((download) => {
    if (Number(download.user_id) !== Number(userId)) return false;
    if (mode !== 'global' && resourceId !== null && Number(download.resource_id) !== Number(resourceId)) return false;
    if (new Date(download.created_at || 0).getTime() < since) return false;
    return isCompletedDownload(download) || isActiveReservation(download, now);
  }).length;
}

export async function downloadCreate(data) {
  const id = nextId('downloads');
  const now = new Date().toISOString();
  const d = {
    id,
    ...data,
    request_id: data.request_id || null,
    status: 'completed',
    completed_at: now,
    created_at: now,
  };
  state.downloads.push(d);
  saveData(state);
  return { ...d, insertId: id };
}

export async function downloadReserve(data) {
  const requestId = String(data.request_id || '').trim();
  if (!requestId) throw new Error('A download request id is required.');

  const now = Date.now();
  const existing = state.downloads.find((download) => download.request_id === requestId);
  if (existing?.status === 'completed') return { alreadyCompleted: true, id: existing.id, requestId };
  if (existing && isActiveReservation(existing, now)) return { alreadyReserved: true, id: existing.id, requestId };
  if (existing) state.downloads = state.downloads.filter((download) => download !== existing);

  const max = Number(data.max) || 0;
  const used = quotaUsage(data.user_id, data);
  if (max > 0 && used >= max) throw quotaError(used, max);

  const id = nextId('downloads');
  const reservation = {
    id,
    request_id: requestId,
    resource_id: Number(data.resource_id),
    file_id: data.file_id === null || data.file_id === undefined ? null : Number(data.file_id),
    user_id: Number(data.user_id),
    ip_address: data.ip_address || null,
    user_agent: data.user_agent || null,
    status: 'reserved',
    reserved_until: new Date(now + DOWNLOAD_RESERVATION_TTL_MS).toISOString(),
    created_at: new Date(now).toISOString(),
    quota_period: data.period || 'month',
    quota_mode: data.mode || 'global',
  };
  state.downloads.push(reservation);
  saveData(state);
  return { id, requestId, created: true };
}

export async function downloadFinalize(requestId) {
  const reservation = state.downloads.find((download) => download.request_id === String(requestId));
  if (!reservation || reservation.status === 'completed') return false;
  reservation.status = 'completed';
  reservation.completed_at = new Date().toISOString();
  reservation.reserved_until = null;
  saveData(state);
  return true;
}

// Finalize the reservation and its material counter together. This keeps a
// successful delivery from becoming a quota record without a matching admin
// counter when one of the two writes fails.
export async function downloadComplete(requestId, resourceId) {
  const reservation = state.downloads.find((download) => download.request_id === String(requestId));
  if (!reservation || reservation.status !== 'reserved') return false;
  const resource = state.resources.find((item) => Number(item.id) === Number(resourceId));
  if (!resource) throw new Error('Resource not found while completing download.');
  reservation.status = 'completed';
  reservation.completed_at = new Date().toISOString();
  reservation.reserved_until = null;
  resource.download_count = (resource.download_count || 0) + 1;
  saveData(state);
  return true;
}

export async function downloadRelease(requestId) {
  const before = state.downloads.length;
  state.downloads = state.downloads.filter((download) => !(download.request_id === String(requestId) && download.status === 'reserved'));
  if (state.downloads.length !== before) saveData(state);
  return state.downloads.length !== before;
}

export async function downloadIntentCreate(data) {
  const id = nextId('downloadIntents');
  const di = { id, ...data, created_at: new Date().toISOString() };
  state.downloadIntents.push(di);
  saveData(state);
  return di;
}

function downloadView(download) {
  const resource = state.resources.find((item) => Number(item.id) === Number(download.resource_id));
  const file = state.files.find((item) => Number(item.id) === Number(download.file_id));
  const user = state.users.find((item) => Number(item.id) === Number(download.user_id));
  return {
    created_at: download.created_at,
    resource_title: resource?.title || null,
    resource_id: resource?.id ?? download.resource_id,
    file_id: download.file_id ?? null,
    file_label: file?.label || file?.original_name || null,
    user_name: user?.name || null,
    user_email: user?.email || null,
  };
}

export async function downloadIntentRecent(limit = 20) {
  return [...state.downloadIntents]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map((intent) => downloadView(intent));
}

export async function downloadsByUser(userId) {
  return state.downloads.filter((d) => d.user_id === Number(userId) && isCompletedDownload(d));
}

export async function downloadCountByUser(userId, options = {}) {
  return quotaUsage(userId, options);
}

export async function downloadCount() {
  return { total: state.downloads.filter(isCompletedDownload).length };
}

export async function downloadRecent(limit = 10) {
  return state.downloads
    .filter(isCompletedDownload)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit)
    .map(downloadView);
}

export async function downloadReport(limit = 100) {
  const completed = state.downloads.filter(isCompletedDownload);
  const perFile = new Map();
  const perUser = new Map();
  for (const download of completed) {
    const fileKey = `${download.resource_id}:${download.file_id || ''}`;
    const view = downloadView(download);
    const file = perFile.get(fileKey) || {
      resource_id: download.resource_id,
      resource_title: view.resource_title,
      file_id: download.file_id,
      file_label: view.file_label,
      count: 0,
    };
    file.count += 1;
    perFile.set(fileKey, file);
    const userKey = String(download.user_id);
    const user = perUser.get(userKey) || {
      user_id: download.user_id,
      user_name: view.user_name,
      user_email: view.user_email,
      total: 0,
      files: [],
    };
    user.total += 1;
    const existingFile = user.files.find((item) => item.resource_title === view.resource_title && item.file_label === view.file_label);
    if (existingFile) existingFile.count += 1;
    else user.files.push({ resource_title: view.resource_title, file_label: view.file_label, count: 1 });
    perUser.set(userKey, user);
  }
  return {
    perFile: [...perFile.values()].sort((a, b) => b.count - a.count),
    perUser: [...perUser.values()].sort((a, b) => b.total - a.total),
    recent: await downloadRecent(limit),
    recentIntents: await downloadIntentRecent(Math.min(limit, 30)),
    total: completed.length,
  };
}

// --- Favorites ---
export async function favoriteListByUser(userId) {
  return state.favorites.filter((f) => f.user_id === Number(userId));
}

export async function favoriteIdsByUser(userId) {
  return state.favorites.filter((f) => f.user_id === Number(userId)).map((f) => f.resource_id);
}

export async function favoriteAdd(userId, resourceId) {
  const exists = state.favorites.some((f) => f.user_id === Number(userId) && f.resource_id === Number(resourceId));
  if (!exists) {
    state.favorites.push({ user_id: Number(userId), resource_id: Number(resourceId), created_at: new Date().toISOString() });
    saveData(state);
  }
}

export async function favoriteRemove(userId, resourceId) {
  state.favorites = state.favorites.filter((f) => !(f.user_id === Number(userId) && f.resource_id === Number(resourceId)));
  saveData(state);
}

export async function favoriteFolderListByUser(userId) {
  return state.favoriteFolders.filter((ff) => ff.user_id === Number(userId));
}

export async function favoriteFolderCreate(userId, name) {
  const id = nextId('favoriteFolders');
  const ff = { id, user_id: Number(userId), name, created_at: new Date().toISOString() };
  state.favoriteFolders.push(ff);
  saveData(state);
  return ff;
}

export async function favoriteFolderEnsureDefault(userId) {
  let ff = state.favoriteFolders.find((f) => f.user_id === Number(userId));
  if (!ff) {
    ff = await favoriteFolderCreate(userId, 'Favoritos');
  }
  return ff;
}

// --- Plans & Subscriptions ---
export async function planFindPremium() {
  return state.plans.find((plan) => plan.slug === 'premium') || null;
}

export async function planFindBySlug(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  return state.plans.find((plan) => String(plan.slug || '').toLowerCase() === normalized) || null;
}

export async function planCreateFromConfig(data = {}) {
  const slug = String(data.slug || '').trim().toLowerCase();
  if (!slug) throw new Error('Plan slug is required.');
  const existing = await planFindBySlug(slug);
  if (existing) return { insertId: existing.id };
  const id = nextId('plans');
  state.plans.push({
    id,
    name: String(data.name || slug).slice(0, 150),
    slug,
    description: data.description || null,
    price: Number(data.price) || 0,
    interval_type: data.interval_type || 'monthly',
    is_active: 1,
    created_at: new Date().toISOString(),
  });
  saveData(state);
  return { insertId: id };
}

export async function planCreatePremium() {
  const existing = await planFindPremium();
  if (existing) return { insertId: existing.id };
  const id = nextId('plans');
  state.plans.push({
    id,
    name: 'Premium',
    slug: 'premium',
    description: 'Assinatura',
    price: 0,
    interval_type: 'monthly',
    is_active: 1,
    created_at: new Date().toISOString(),
  });
  saveData(state);
  return { insertId: id };
}

export async function subscriptionHasActive(userId) {
  const now = Date.now();
  return state.subscriptions.some((s) => Number(s.user_id) === Number(userId)
    && s.status === 'active'
    && (!s.ends_at || new Date(s.ends_at).getTime() > now));
}

export async function subscriptionGetStatus(userId) {
  const active = state.subscriptions
    .filter((subscription) => Number(subscription.user_id) === Number(userId)
      && subscription.status === 'active'
      && (!subscription.ends_at || new Date(subscription.ends_at).getTime() > Date.now()))
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  if (!active) return { active: false };
  const plan = state.plans.find((item) => Number(item.id) === Number(active.plan_id)) || {};
  return {
    active: true,
    planName: plan.name,
    price: plan.price,
    intervalType: plan.interval_type,
    endsAt: active.ends_at,
  };
}

export async function subscriptionCancelActive(userId) {
  state.subscriptions.forEach((s) => {
    if (s.user_id === Number(userId)) s.status = 'cancelled';
  });
  saveData(state);
}

export async function subscriptionActivate(userId, planId, months = 1, tier = 'standard') {
  const ends = new Date();
  ends.setMonth(ends.getMonth() + Math.max(1, Number(months) || 1));
  const sub = {
    id: Date.now(),
    user_id: Number(userId),
    plan_id: planId,
    tier: tier === 'school' ? 'school' : 'standard',
    status: 'active',
    starts_at: new Date().toISOString(),
    ends_at: ends.toISOString(),
    created_at: new Date().toISOString(),
  };
  state.subscriptions.push(sub);
  saveData(state);
  return sub;
}

export async function subscriptionActiveTier(userId) {
  const active = state.subscriptions
    .filter((s) => Number(s.user_id) === Number(userId)
      && s.status === 'active'
      && (!s.ends_at || new Date(s.ends_at).getTime() > Date.now()))
    .sort((a, b) => Number(b.id) - Number(a.id))[0];
  return active?.tier || null;
}

export async function subscriptionListNeedingReminder(daysBefore = 7) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const start = now + (Number(daysBefore) - 1) * dayMs;
  const end = now + (Number(daysBefore) + 1) * dayMs;
  return state.subscriptions.filter((subscription) => {
    const expires = new Date(subscription.ends_at || 0).getTime();
    return subscription.status === 'active'
      && expires >= start
      && expires <= end
      && !subscription.renewal_reminder_sent_at;
  });
}

export async function subscriptionMarkReminderSent(subscriptionId) {
  const subscription = state.subscriptions.find((item) => Number(item.id) === Number(subscriptionId));
  if (!subscription) return false;
  subscription.renewal_reminder_sent_at = new Date().toISOString();
  saveData(state);
  return true;
}

// --- Stats & Contacts ---
export async function pageViewCreate(data) {
  state.pageViews.push({
    path: data.path,
    page_title: data.page_title ?? data.pageTitle ?? null,
    referrer: data.referrer || null,
    user_agent: data.user_agent ?? data.userAgent ?? null,
    session_id: data.session_id ?? data.sessionId ?? null,
    utm_source: data.utm_source || null,
    utm_medium: data.utm_medium || null,
    utm_campaign: data.utm_campaign || null,
    traffic_source: data.traffic_source || null,
    referrer_host: data.referrer_host || null,
    created_at: new Date().toISOString(),
  });
  saveData(state);
}

export async function pageViewStats() {
  const all = state.pageViews.map((row) => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at || 0),
  }));
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const chartStart = new Date(now);
  chartStart.setDate(chartStart.getDate() - 13);
  chartStart.setHours(0, 0, 0, 0);
  const aggregate = (rows) => ({
    pageViews: rows.length,
    visitors: new Set(rows.map((row) => row.session_id).filter(Boolean)).size,
  });
  const today = all.filter((row) => row.created_at >= todayStart);
  const week = all.filter((row) => row.created_at >= weekStart);
  const month = all.filter((row) => row.created_at >= monthStart);
  const topPageMap = new Map();
  month.forEach((row) => topPageMap.set(row.path, (topPageMap.get(row.path) || 0) + 1));
  const topPages = [...topPageMap.entries()]
    .map(([path, views]) => ({ path, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 8);
  const recentVisits = [...all]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 12)
    .map((row) => ({
      path: row.path,
      page_title: row.page_title,
      referrer: row.referrer,
      created_at: row.created_at,
    }));
  const dayMap = new Map();
  all.filter((row) => row.created_at >= chartStart).forEach((row) => {
    const day = row.created_at.toISOString().slice(0, 10);
    const current = dayMap.get(day) || { views: 0, sessions: new Set() };
    current.views += 1;
    if (row.session_id) current.sessions.add(row.session_id);
    dayMap.set(day, current);
  });
  const dailyChart = [...dayMap.entries()]
    .map(([day, value]) => ({ day, views: value.views, visitors: value.sessions.size }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const sourceMap = new Map();
  month.forEach((row) => {
    const source = sourceForRow(row);
    sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
  });
  const topTrafficSources = [...sourceMap.entries()]
    .map(([source, visits]) => ({ source, visits }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);
  return {
    today: aggregate(today),
    week: aggregate(week),
    month: aggregate(month),
    total: aggregate(all),
    topPages,
    recentVisits,
    dailyChart,
    topTrafficSources,
  };
}

export async function interactionEventCreate(data) {
  if (!Array.isArray(state.interactionEvents)) state.interactionEvents = [];
  const eventKey = data.event_key || data.client_event_id || null;
  if (eventKey) {
    const existing = state.interactionEvents.find((event) => event.event_key === eventKey);
    if (existing) return existing;
  }
  const event = {
    id: nextId('interactionEvents'),
    ...data,
    event_key: eventKey,
    created_at: new Date().toISOString(),
  };
  state.interactionEvents.push(event);
  saveData(state);
  return event;
}

export async function interactionEventStats(limit = 30) {
  const events = Array.isArray(state.interactionEvents) ? state.interactionEvents : [];
  const recent = [...events]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
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
    recent,
    perFile: [...byFile.values()].sort((a, b) =>
      (b.previews + b.page_clicks + b.download_clicks) - (a.previews + a.page_clicks + a.download_clicks)
    ),
    totals: events.reduce((acc, event) => {
      acc[event.event_name] = (acc[event.event_name] || 0) + 1;
      return acc;
    }, {}),
  };
}

export async function contactMessageCreate(data) {
  const currentIds = state.contactMessages.map((item) => Number(item.id) || 0);
  const id = Math.max(0, ...currentIds) + 1;
  state.contactMessages.push({
    id,
    name: data.name,
    email: data.email,
    message: data.message,
    status: data.status === 'read' ? 'read' : 'unread',
    read_at: data.status === 'read' ? new Date().toISOString() : null,
    notification_status: data.notification_status || 'not_configured',
    created_at: new Date().toISOString(),
  });
  saveData(state);
  return { insertId: id };
}

export async function contactMessageList() {
  let changed = false;
  let nextMessageId = Math.max(0, ...state.contactMessages.map((item) => Number(item.id) || 0)) + 1;
  const rows = state.contactMessages.map((item) => {
    if (!item.id) {
      item.id = nextMessageId;
      nextMessageId += 1;
      changed = true;
    }
    if (!item.status) {
      item.status = 'unread';
      changed = true;
    }
    if (!item.notification_status) {
      item.notification_status = 'not_configured';
      changed = true;
    }
    return { ...item };
  });
  if (changed) saveData(state);
  return rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export async function contactMessageUpdate(id, changes = {}) {
  const item = state.contactMessages.find((row) => Number(row.id) === Number(id));
  if (!item) return null;
  if (changes.status === 'read' || changes.status === 'unread') {
    item.status = changes.status;
    item.read_at = changes.status === 'read' ? new Date().toISOString() : null;
  }
  if (['not_configured', 'sent', 'failed'].includes(changes.notification_status)) {
    item.notification_status = changes.notification_status;
  }
  saveData(state);
  return { ...item };
}

export async function contactMessageDelete(id) {
  const before = state.contactMessages.length;
  state.contactMessages = state.contactMessages.filter((row) => Number(row.id) !== Number(id));
  if (state.contactMessages.length !== before) saveData(state);
  return state.contactMessages.length !== before;
}

export async function userSignupSourceStats() {
  const sourceMap = new Map();
  state.users.forEach((user) => {
    const source = sourceForRow({
      traffic_source: user.signup_source,
      referrer: user.signup_referrer,
      utm_source: user.signup_utm_source,
      utm_medium: user.signup_utm_medium,
    });
    sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
  });
  return [...sourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

export async function resourceTopByDownloads(limit = 5) {
  return [...state.resources]
    .sort((a, b) => Number(b.download_count || 0) - Number(a.download_count || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit) || 5)))
    .map((resource) => ({
      id: resource.id,
      title: resource.title,
      download_count: resource.download_count,
      view_count: resource.view_count,
    }));
}

const MEMORY_UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');

function memoryStoragePath(storagePath) {
  const normalized = String(storagePath || '').replace(/^[/\\]+/, '');
  if (!normalized || normalized.includes('..')) return null;
  const fullPath = path.resolve(MEMORY_UPLOAD_DIR, normalized);
  const root = path.resolve(MEMORY_UPLOAD_DIR);
  return fullPath === root || fullPath.startsWith(`${root}${path.sep}`) ? fullPath : null;
}

export async function storageUpload(buffer, destPath) {
  const fullPath = memoryStoragePath(destPath);
  if (!fullPath) throw new Error('Invalid storage path.');
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return `/uploads/${String(destPath).replace(/^[\\/]+/, '')}`;
}

export async function storageDownloadStream(storagePath) {
  const fullPath = memoryStoragePath(storagePath);
  if (!fullPath || !fs.existsSync(fullPath)) return null;
  return fs.createReadStream(fullPath);
}

export async function storageDelete(storagePath) {
  const fullPath = memoryStoragePath(storagePath);
  if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export async function storageCopy(sourcePath, destinationPath) {
  const source = memoryStoragePath(sourcePath);
  const destination = memoryStoragePath(destinationPath);
  if (!source || !destination || !fs.existsSync(source)) throw new Error('Staged upload not found.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return `/uploads/${String(destinationPath).replace(/^[\\/]+/, '')}`;
}

export async function storageStat(storagePath) {
  const fullPath = memoryStoragePath(storagePath);
  if (!fullPath || !fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  return { size: stat.size };
}

export async function localPathToStorage(p) {
  return p?.replace(/^[/\\]?uploads[/\\]/, '').replaceAll('\\', '/') || null;
}

export async function setCounter() {}

export async function importDoc() {}

export async function stripeWebhookEventClaim(eventId) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('Stripe event id is required.');
  const existing = (state.stripeWebhookEvents || []).find((event) => event.event_id === id);
  if (existing) {
    if (existing.status === 'completed') return false;
    const createdAt = new Date(existing.created_at || 0).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt < 15 * 60 * 1000) return false;
    existing.created_at = new Date().toISOString();
    saveData(state);
    return true;
  }
  state.stripeWebhookEvents.push({
    event_id: id,
    status: 'processing',
    created_at: new Date().toISOString(),
  });
  saveData(state);
  return true;
}

export async function stripeWebhookEventComplete(eventId) {
  const event = (state.stripeWebhookEvents || []).find((item) => item.event_id === String(eventId));
  if (!event) return false;
  event.status = 'completed';
  event.completed_at = new Date().toISOString();
  saveData(state);
  return true;
}

export async function stripeWebhookEventRelease(eventId) {
  const before = (state.stripeWebhookEvents || []).length;
  state.stripeWebhookEvents = (state.stripeWebhookEvents || []).filter((item) => item.event_id !== String(eventId));
  if (state.stripeWebhookEvents.length !== before) saveData(state);
  return state.stripeWebhookEvents.length !== before;
}

export const COL = {};
