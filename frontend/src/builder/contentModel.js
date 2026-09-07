import { APPEARANCE_DEFAULTS } from '../utils/theme.js';

export const DEFAULT_QUICK_TOPICS = Object.freeze([
  { id: 'aleph-bet', label: 'Aleph-Bet', targetType: 'search', target: '/library?q=hebrew', icon: 'bi bi-translate', visible: true, sortOrder: 0 },
  { id: 'parashah', label: 'Parashah', targetType: 'search', target: '/library?q=parashah', icon: 'bi bi-book', visible: true, sortOrder: 1 },
  { id: 'chanukah', label: 'Chanukah', targetType: 'search', target: '/library?q=chanukah', icon: 'bi bi-stars', visible: true, sortOrder: 2 },
  { id: 'coloring', label: 'Coloring', targetType: 'search', target: '/library?q=coloring', icon: 'bi bi-palette', visible: true, sortOrder: 3 },
  { id: 'torah', label: 'Torah', targetType: 'search', target: '/library?q=torah', icon: 'bi bi-journal-bookmark', visible: true, sortOrder: 4 },
  { id: 'view-all', label: 'View all', targetType: 'url', target: '/library', icon: 'bi bi-collection', visible: true, sortOrder: 5 },
]);

export function cloneContent(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false;
    if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) return true;
  }
  return value === true || value === 1 || (fallback && value !== false && value !== 0);
}

export function normalizeMaterialFile(file, index = 0) {
  const source = file || {};
  return {
    ...source,
    id: source.id ?? source.clientId ?? `file-${index + 1}`,
    clientId: source.clientId || undefined,
    original_name: String(source.original_name || source.name || 'Untitled file'),
    file_name: source.file_name || '',
    label: source.label || '',
    sort_order: Number.isFinite(Number(source.sort_order)) ? Number(source.sort_order) : index,
    file_type: source.file_type || source.type || 'other',
    mime_type: source.mime_type || source.type || '',
    file_size: Number(source.file_size || source.size || 0),
    is_primary: asBoolean(source.is_primary),
    is_archived: asBoolean(source.is_archived),
  };
}

export function normalizeQuickTopics(value) {
  const source = Array.isArray(value) ? value : DEFAULT_QUICK_TOPICS;
  return source
    .map((item, index) => ({
      id: String(item?.id || `topic-${index + 1}`),
      label: String(item?.label || '').trim(),
      targetType: ['category', 'search', 'url'].includes(item?.targetType) ? item.targetType : 'url',
      target: String(item?.target || '/library').trim() || '/library',
      icon: String(item?.icon || 'bi bi-folder2'),
      visible: asBoolean(item?.visible, true),
      sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : index,
    }))
    .filter((item) => item.label)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function defaultContentSnapshot(settings = {}) {
  let quickTopics = DEFAULT_QUICK_TOPICS;
  try {
    const parsed = JSON.parse(settings.home_quick_topics || APPEARANCE_DEFAULTS.home_quick_topics || '[]');
    if (Array.isArray(parsed)) quickTopics = parsed;
  } catch {
    // Keep the built-in topics when settings are malformed.
  }
  return { quickTopics: normalizeQuickTopics(quickTopics), categories: [], materials: [] };
}

export function normalizeContentSnapshot(snapshot, settings = {}) {
  const fallback = defaultContentSnapshot(settings);
  return {
    quickTopics: normalizeQuickTopics(snapshot?.quickTopics || fallback.quickTopics),
    categories: Array.isArray(snapshot?.categories) ? snapshot.categories.map((item) => ({
      ...item,
      id: item.id,
      parent_id: item.parent_id || null,
      nav_visible: asBoolean(item.nav_visible, true),
      is_archived: asBoolean(item.is_archived),
      sort_order: Number(item.sort_order) || 0,
    })) : [],
    materials: Array.isArray(snapshot?.materials) ? snapshot.materials.map((item) => ({
      ...item,
      id: item.id,
      category_id: item.category_id || null,
      action_visibility: normalizeActionVisibility(item.action_visibility),
      cover_hidden: asBoolean(item.cover_hidden),
      is_published: asBoolean(item.is_published, true),
      is_archived: asBoolean(item.is_archived),
      sort_order: Number(item.sort_order) || 0,
      files: Array.isArray(item.files) ? item.files.map(normalizeMaterialFile).sort((a, b) => a.sort_order - b.sort_order) : [],
    })) : [],
  };
}

export function normalizeActionVisibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = ['preview', 'download', 'worksheet', 'pinterest', 'bookmark', 'classroom', 'answers'];
  const normalized = {};
  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(value, key)) normalized[key === 'worksheet' ? 'download' : key] = asBoolean(value[key], true);
  });
  return Object.keys(normalized).length ? normalized : null;
}

export function categoryVisibleInDraft(category, categories = []) {
  if (!category) return false;
  const byId = new Map((categories || []).map((item) => [String(item.id), item]));
  const visited = new Set();
  let current = category;
  while (current) {
    const id = String(current.id);
    if (visited.has(id) || current.is_archived) return false;
    visited.add(id);
    current = current.parent_id ? byId.get(String(current.parent_id)) : null;
  }
  return true;
}

export function materialVisibleInDraft(material, categories = []) {
  if (!material || material.is_archived || material.is_published === false || material.is_published === 0 || material.is_published === '0') return false;
  if (!material.category_id) return true;
  const category = (categories || []).find((item) => String(item.id) === String(material.category_id));
  if (!category) return true;
  return categoryVisibleInDraft(category, categories);
}

function findFile(snapshot, materialId, fileId) {
  const materials = Array.isArray(snapshot?.materials) ? snapshot.materials : [];
  for (const material of materials) {
    if (materialId !== undefined && materialId !== null && String(material.id) !== String(materialId)) continue;
    const files = Array.isArray(material.files) ? material.files : [];
    const index = files.findIndex((file) => String(file.id) === String(fileId) || String(file.clientId) === String(fileId));
    if (index >= 0) return { material, files, file: files[index], index };
  }
  return null;
}

export function applyContentOperation(snapshot, operation) {
  const next = cloneContent(snapshot);
  if (operation.entity === 'file') {
    const materialId = operation.materialId ?? operation.data?.material_id;
    if (operation.action === 'add') {
      const material = next.materials?.find((item) => String(item.id) === String(materialId) || String(item.clientId) === String(materialId));
      if (!material) return next;
      if (!Array.isArray(material.files)) material.files = [];
      const file = normalizeMaterialFile({
        ...(operation.data || {}),
        id: operation.id || operation.clientId,
        clientId: operation.clientId,
        is_archived: false,
        sort_order: operation.data?.sort_order ?? material.files.length,
      }, material.files.length);
      material.files.push(file);
      return next;
    }
    if (operation.action === 'reorder') {
      const material = next.materials?.find((item) => String(item.id) === String(materialId) || String(item.clientId) === String(materialId));
      const updates = Array.isArray(operation.data?.items) ? operation.data.items : [];
      if (material?.files) {
        material.files = material.files.map((file) => {
          const update = updates.find((item) => String(item.id) === String(file.id) || String(item.id) === String(file.clientId));
          return update ? { ...file, sort_order: Number(update.sort_order) || 0 } : file;
        }).sort((a, b) => a.sort_order - b.sort_order);
      }
      return next;
    }
    const found = findFile(next, materialId, operation.id || operation.clientId);
    if (!found) return next;
    if (operation.action === 'archive' || operation.action === 'restore') {
      found.file.is_archived = operation.action === 'archive';
    } else if (operation.action === 'update') {
      Object.assign(found.file, operation.data || {});
    }
    return next;
  }
  const collection = operation.entity === 'category' ? 'categories' : 'materials';
  if (!next[collection]) next[collection] = [];
  const items = next[collection];
  const id = operation.id || operation.clientId;
  const index = items.findIndex((item) => String(item.id) === String(id));
  if (operation.action === 'create') {
    items.push({ id: operation.clientId || `draft-${Date.now()}`, ...(operation.data || {}) });
  } else if (operation.action === 'archive' || operation.action === 'restore') {
    if (index >= 0) items[index].is_archived = operation.action === 'archive';
  } else if (operation.action === 'update' && index >= 0) {
    items[index] = { ...items[index], ...(operation.data || {}) };
  } else if (operation.action === 'reorder') {
    (operation.data?.items || []).forEach((item) => {
      const target = items.find((candidate) => String(candidate.id) === String(item.id));
      if (target) target.sort_order = Number(item.sort_order) || 0;
    });
  }
  return next;
}
