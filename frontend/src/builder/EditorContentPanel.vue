<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useBuilderStore } from './store';

const builder = useBuilderStore();
const section = ref('topics');
const query = ref('');
const visibility = ref('visible');
const topicForm = ref(null);
const selectedEntity = ref(null);
const entityForm = ref(null);
const formInitial = ref(null);
const coverFile = ref(null);
const coverPreview = ref('');
const pendingCoverName = ref('');
const fileError = ref('');
const topicError = ref('');
const dragOverMaterialId = ref(null);
const confirmDialog = ref(null);
const ACTION_OPTIONS = [
  { key: 'preview', label: 'Preview' },
  { key: 'download', label: 'Download' },
  { key: 'pinterest', label: 'Pinterest' },
  { key: 'bookmark', label: 'Bookmark' },
  { key: 'classroom', label: 'Google Classroom' },
  { key: 'answers', label: 'Answer key' },
];

function defaultActionVisibility(value = null) {
  const source = value && typeof value === 'object' ? value : {};
  return ACTION_OPTIONS.reduce((result, option) => {
    result[option.key] = source[option.key] !== false;
    return result;
  }, {});
}

const topics = computed(() => (builder.contentDraft.quickTopics || []).slice().sort((a, b) => a.sortOrder - b.sortOrder));
const categories = computed(() => (builder.contentDraft.categories || []).slice().sort((a, b) => a.sort_order - b.sort_order));
const materials = computed(() => (builder.contentDraft.materials || []).slice().sort((a, b) => a.sort_order - b.sort_order));

const normalizedQuery = computed(() => query.value.trim().toLowerCase());
const matches = (...values) => !normalizedQuery.value || values.some((value) => String(value || '').toLowerCase().includes(normalizedQuery.value));

const visibleTopics = computed(() => topics.value.filter((item) => item.visible));
const categoryById = computed(() => new Map(categories.value.map((item) => [String(item.id), item])));
function categoryEffectivelyVisible(item) {
  const visited = new Set();
  let current = item;
  while (current) {
    const id = String(current.id);
    if (visited.has(id) || current.is_archived || current.nav_visible === false || current.nav_visible === 0 || current.nav_visible === '0') return false;
    visited.add(id);
    current = current.parent_id ? categoryById.value.get(String(current.parent_id)) : null;
  }
  return true;
}
const visibleCategories = computed(() => categories.value.filter((item) => categoryEffectivelyVisible(item)));
const topicIconOptions = [
  { value: 'bi bi-folder2', label: 'Folder' },
  { value: 'bi bi-book', label: 'Book' },
  { value: 'bi bi-stars', label: 'Stars' },
  { value: 'bi bi-palette', label: 'Coloring' },
  { value: 'bi bi-translate', label: 'Language' },
  { value: 'bi bi-collection', label: 'Collection' },
];
const removedCategories = computed(() => categories.value.filter((item) => !categoryEffectivelyVisible(item)));
const visibleMaterials = computed(() => materials.value.filter((item) => !item.is_archived && (!item.category_id || categoryEffectivelyVisible(categoryById.value.get(String(item.category_id))))));
const removedMaterials = computed(() => materials.value.filter((item) => item.is_archived || (item.category_id && !categoryEffectivelyVisible(categoryById.value.get(String(item.category_id))))));

function materialCategoryName(item) {
  if (!item?.category_id) return 'Uncategorized';
  return categoryById.value.get(String(item.category_id))?.name || item.category_name || 'Uncategorized';
}

function hiddenParentFor(item) {
  if (!item?.category_id) return null;
  let current = categoryById.value.get(String(item.category_id));
  const visited = new Set();
  while (current?.parent_id) {
    const id = String(current.id);
    if (visited.has(id)) return null;
    visited.add(id);
    const parent = categoryById.value.get(String(current.parent_id));
    if (!parent) return null;
    if (parent.is_archived || !categoryEffectivelyVisible(parent)) return parent;
    current = parent;
  }
  return null;
}

const filteredTopics = computed(() => filterItems(topics.value, (item) => item.visible, item => matches(item.label, item.target, item.targetType)));
const filteredCategories = computed(() => filterItems(categories.value, categoryEffectivelyVisible, item => matches(item.name, item.description)));
const filteredMaterials = computed(() => filterItems(materials.value, (item) => visibleMaterials.value.includes(item), item => matches(item.title, item.description, item.category_name, item.keywords)));

function filterItems(items, isVisible, matchesQuery) {
  return items.filter((item) => {
    const visibilityMatch = visibility.value === 'all' || (visibility.value === 'visible' ? isVisible(item) : !isVisible(item));
    return visibilityMatch && matchesQuery(item);
  });
}

function topicDefaults(index = topics.value.length) {
  return {
    id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: 'New topic',
    targetType: 'search',
    target: '/library',
    icon: 'bi bi-folder2',
    visible: true,
    sortOrder: index,
  };
}

function editTopic(topic) {
  let target = topic.target;
  if (topic.targetType === 'category') {
    const slugMatch = String(target || '').match(/\/library\/category\/([^/?#]+)/);
    const category = visibleCategories.value.find((item) => String(item.id) === String(target) || item.slug === target || item.slug === slugMatch?.[1]);
    if (category) target = String(category.id);
  }
  topicForm.value = { ...topic, target, isNew: false };
  formInitial.value = JSON.stringify(topicForm.value);
  topicError.value = '';
  selectedEntity.value = null;
  entityForm.value = null;
}

function addTopic() {
  if (builder.contentLoading || !builder.contentLoaded) return;
  topicForm.value = { ...topicDefaults(), target: '', isNew: true };
  formInitial.value = JSON.stringify(topicForm.value);
  topicError.value = '';
  selectedEntity.value = null;
  entityForm.value = null;
  visibility.value = 'visible';
}

function saveTopic() {
  if (!topicForm.value?.label?.trim()) return;
  topicError.value = '';
  if (topicForm.value.targetType === 'category' && !topicForm.value.target) {
    topicError.value = 'Choose a category for this topic.';
    return;
  }
  if (topicForm.value.targetType === 'url' && topicForm.value.target && !/^\/(?!\/)|^https?:\/\//i.test(topicForm.value.target.trim())) {
    topicError.value = 'Use a site path such as /library or a full http(s) link.';
    return;
  }
  const { isNew, ...rawTopic } = topicForm.value;
  const topic = { ...rawTopic, label: topicForm.value.label.trim(), sortOrder: Number(topicForm.value.sortOrder) || topics.value.length };
  const next = isNew
    ? [...topics.value, topic]
    : topics.value.map((item) => item.id === topic.id ? topic : item);
  builder.setQuickTopics(next);
  topicForm.value = null;
  topicError.value = '';
}

function duplicateTopic(topic) {
  const copy = { ...topic, id: `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: `${topic.label} copy`, sortOrder: topics.value.length };
  builder.setQuickTopics([...topics.value, copy]);
}

function moveTopic(topic, direction) {
  const list = [...visibleTopics.value].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = list.findIndex((item) => item.id === topic.id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  builder.setQuickTopics(list.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })));
}

function requestHideTopic(topic) {
  confirmDialog.value = { kind: 'topic', item: topic, title: 'Hide this topic?', message: 'It will disappear from the public topic list. You can restore it later.' };
}

function restoreTopic(topic) {
  builder.setQuickTopics(topics.value.map((item) => item.id === topic.id ? { ...item, visible: true } : item));
}

function editEntity(entity, item) {
  selectedEntity.value = { entity, id: item.id, isNew: false };
  entityForm.value = { ...item, ...(entity === 'material' ? { action_visibility: defaultActionVisibility(item.action_visibility) } : {}) };
  formInitial.value = JSON.stringify(entityForm.value);
  topicForm.value = null;
  if (coverPreview.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
  coverPreview.value = '';
  const pendingCover = entity === 'material'
    ? builder.contentUploads.find((upload) => upload.kind === 'cover' && String(upload.id) === String(item.id))
    : null;
  pendingCoverName.value = pendingCover?.fileName || '';
  coverFile.value = pendingCover?.file || null;
  fileError.value = '';
}

watch(coverFile, (file, previous) => {
  // Keep the object URL visible after Save so the administrator can see the
  // queued replacement before Publish. It is released when switching/removing
  // the material or when the component unmounts.
  if (coverPreview.value && coverPreview.value.startsWith('blob:') && !(previous && !file && pendingCoverName.value)) {
    URL.revokeObjectURL(coverPreview.value);
    coverPreview.value = '';
  }
  if (file) coverPreview.value = URL.createObjectURL(file);
});

function removeCover() {
  if (!entityForm.value || selectedEntity.value?.entity !== 'material') return;
  const pendingCover = builder.contentUploads.find((upload) => upload.kind === 'cover' && String(upload.id) === String(selectedEntity.value.id));
  if (pendingCover) builder.removeContentUpload(pendingCover.uploadId);
  if (selectedEntity.value.isNew) {
    entityForm.value.cover_image = '';
    entityForm.value.cover_hidden = false;
    coverFile.value = null;
    pendingCoverName.value = '';
    if (coverPreview.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
    coverPreview.value = '';
    return;
  }
  const hasCover = Boolean(entityForm.value.cover_image);
  builder.updateContentItem('material', selectedEntity.value.id, hasCover
    ? { cover_hidden: true }
    : { cover_image: '', cover_hidden: false });
  entityForm.value.cover_hidden = hasCover;
  coverFile.value = null;
  pendingCoverName.value = '';
  if (coverPreview.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
  coverPreview.value = '';
}

function restoreCover() {
  if (!entityForm.value || selectedEntity.value?.entity !== 'material') return;
  const pendingCover = builder.contentUploads.find((upload) => upload.kind === 'cover' && String(upload.id) === String(selectedEntity.value.id));
  if (pendingCover) builder.removeContentUpload(pendingCover.uploadId);
  if (selectedEntity.value.isNew) {
    entityForm.value.cover_hidden = false;
    return;
  }
  const published = builder.publishedContent.materials.find((item) => String(item.id) === String(selectedEntity.value.id));
  const cover = published?.cover_image || '';
  builder.updateContentItem('material', selectedEntity.value.id, { cover_image: cover, cover_hidden: false });
  entityForm.value.cover_image = cover;
  entityForm.value.cover_hidden = false;
  pendingCoverName.value = '';
  if (coverPreview.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
  coverPreview.value = '';
}

function handleCanvasSelection(event) {
  const detail = event.detail || {};
  if (detail.entity === 'topic') {
    const topic = topics.value.find((item) => String(item.id) === String(detail.id));
    if (topic) { section.value = 'topics'; editTopic(topic); }
  } else if (detail.entity === 'category') {
    const category = categories.value.find((item) => String(item.id) === String(detail.id));
    if (category) { section.value = 'categories'; editEntity('category', category); }
  } else if (detail.entity === 'material') {
    const material = materials.value.find((item) => String(item.id) === String(detail.id));
    if (material) { section.value = 'materials'; editEntity('material', material); }
  }
  if (detail.field) {
    nextTick(() => document.querySelector(`[data-editor-form-field="${detail.entity}:${detail.field}"]`)?.focus());
  }
}

function addCategory() {
  if (builder.contentLoading || !builder.contentLoaded) return;
  selectedEntity.value = { entity: 'category', id: null, isNew: true };
  entityForm.value = { name: '', description: '', parent_id: null, sort_order: categories.value.length, nav_visible: true, is_archived: false };
  formInitial.value = JSON.stringify(entityForm.value);
  topicForm.value = null;
  section.value = 'categories';
  visibility.value = 'visible';
}

function addMaterial() {
  if (builder.contentLoading || !builder.contentLoaded) return;
  selectedEntity.value = { entity: 'material', id: null, isNew: true };
  entityForm.value = { title: '', description: '', content_description: '', category_id: null, age_range: '', grade_level: '', material_type: '', keywords: '', display_mode: 'default', is_published: false, is_archived: false, sort_order: materials.value.length, files: [], cover_image: '', cover_hidden: false, action_visibility: defaultActionVisibility() };
  formInitial.value = JSON.stringify(entityForm.value);
  topicForm.value = null;
  section.value = 'materials';
  visibility.value = 'visible';
}

function saveEntity() {
  if (!selectedEntity.value || !entityForm.value) return;
  const entity = selectedEntity.value.entity;
  const data = entity === 'category'
    ? {
        name: String(entityForm.value.name || '').trim(),
        description: entityForm.value.description || '',
        parent_id: entityForm.value.parent_id || null,
        nav_visible: Boolean(entityForm.value.nav_visible),
        sort_order: Number(entityForm.value.sort_order) || 0,
      }
    : {
        title: String(entityForm.value.title || '').trim(),
        description: entityForm.value.description || '',
        content_description: entityForm.value.content_description || '',
        category_id: entityForm.value.category_id || null,
        age_range: entityForm.value.age_range || '',
        grade_level: entityForm.value.grade_level || '',
        material_type: entityForm.value.material_type || '',
        keywords: entityForm.value.keywords || '',
        display_mode: entityForm.value.display_mode || 'default',
        cover_hidden: Boolean(entityForm.value.cover_hidden),
        is_published: Boolean(entityForm.value.is_published),
        sort_order: Number(entityForm.value.sort_order) || 0,
        action_visibility: defaultActionVisibility(entityForm.value.action_visibility),
      };
  if (!data.name && entity === 'category') { fileError.value = 'Add a category name first.'; return; }
  if (!data.title && entity === 'material') { fileError.value = 'Add a material title first.'; return; }
  let itemId = selectedEntity.value.id;
  if (selectedEntity.value.isNew) {
    itemId = builder.createContentItem(entity, data);
    if (!itemId) { fileError.value = `Could not create this ${entity}.`; return; }
    selectedEntity.value = { entity, id: itemId, isNew: false };
  } else {
    const operationId = builder.updateContentItem(entity, itemId, data);
    if (!operationId) { fileError.value = `This ${entity} is no longer in the draft. Reload Content and try again.`; return; }
  }
  if (entity === 'material' && coverFile.value) {
    pendingCoverName.value = coverFile.value.name || 'New cover image';
    builder.queueContentUpload('material', itemId, 'cover', coverFile.value, { primary: true });
  }
  entityForm.value = { ...entityForm.value, ...data, id: itemId };
  formInitial.value = JSON.stringify(entityForm.value);
  coverFile.value = null;
  fileError.value = '';
}

function requestHideEntity(entity, item) {
  confirmDialog.value = { kind: entity, item, title: `Hide this ${entity}?`, message: 'It will disappear from public pages. You can restore it from Removed.' };
}

function restoreEntity(entity, item) {
  if (entity === 'category' && !item.is_archived && (item.nav_visible === false || item.nav_visible === 0 || item.nav_visible === '0')) {
    builder.updateContentItem('category', item.id, { nav_visible: true });
    return;
  }
  builder.restoreContentItem(entity, item.id);
}

function duplicateEntity(entity, item) {
  const id = builder.duplicateContentItem(entity, item.id);
  if (id) editEntity(entity, builder.contentItem(entity, id));
}

function moveEntity(entity, item, direction) {
  builder.moveContentItem(entity, item.id, direction);
}

function isFirst(entity, item) {
  const list = (entity === 'category'
    ? visibleCategories.value.filter((candidate) => (candidate.parent_id || null) === (item.parent_id || null))
    : visibleMaterials.value).slice().sort((a, b) => a.sort_order - b.sort_order);
  return list[0]?.id === item.id;
}

function isLast(entity, item) {
  const list = (entity === 'category'
    ? visibleCategories.value.filter((candidate) => (candidate.parent_id || null) === (item.parent_id || null))
    : visibleMaterials.value).slice().sort((a, b) => a.sort_order - b.sort_order);
  return list[list.length - 1]?.id === item.id;
}

function formatBytes(size) {
  const value = Number(size) || 0;
  if (!value) return 'Size not available';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function fileLabel(file) {
  return file.label || file.original_name || file.file_name || 'Untitled file';
}

function fileIsPending(file, materialId) {
  return builder.contentUploads.some((upload) => upload.kind === 'file' && String(upload.materialId) === String(materialId) && String(upload.id) === String(file.id));
}

function pendingUploadForFile(file, materialId) {
  return builder.contentUploads.find((upload) => upload.kind === 'file' && String(upload.materialId) === String(materialId) && String(upload.id) === String(file.id));
}

function validateFile(file) {
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
  const extensionAllowed = /\.(pdf|docx|ppt|pptx)$/i.test(file.name || '');
  if (!allowed.includes(file.type) && !extensionAllowed) return 'Use a PDF, DOCX, PPT or PPTX file.';
  if (file.size > 50 * 1024 * 1024) return 'Each file must be 50 MB or smaller.';
  return '';
}

function addMaterialFiles(materialId, files) {
  fileError.value = '';
  const errors = [];
  const selected = Array.from(files || []);
  const current = builder.contentItem('material', materialId)?.files || [];
  const availableSlots = Math.max(0, 100 - current.length);
  if (selected.length > availableSlots) errors.push(`A material can have at most 100 files. Select ${availableSlots} fewer file${availableSlots === 1 ? '' : 's'}.`);
  selected.slice(0, availableSlots).forEach((file) => {
    const error = validateFile(file);
    if (error) errors.push(`${file.name}: ${error}`);
    else builder.queueContentUpload('material', materialId, 'file', file);
  });
  if (errors.length) fileError.value = errors.join(' ');
}

function handleFileInput(event, materialId) {
  addMaterialFiles(materialId, event.target.files);
  event.target.value = '';
}

function handleFileDrop(event, materialId) {
  dragOverMaterialId.value = null;
  addMaterialFiles(materialId, event.dataTransfer?.files);
}

function handleDragOver(event, materialId) {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  dragOverMaterialId.value = materialId;
}

function requestHideFile(material, file) {
  confirmDialog.value = { kind: 'file', materialId: material.id, item: file, title: 'Hide this file?', message: 'It will stay saved but visitors will not see it. You can restore it later.' };
}

function confirmHide() {
  const action = confirmDialog.value;
  if (!action) return;
  if (action.kind === 'close') {
    confirmDialog.value = null;
    closeFormNow();
    return;
  }
  if (action.kind === 'topic') {
    builder.setQuickTopics(topics.value.map((item) => item.id === action.item.id ? { ...item, visible: false } : item));
    // Do not leave the hidden topic open in the editor. Its form is a local
    // copy and saving it again could silently make the topic visible.
    if (String(topicForm.value?.id) === String(action.item.id)) {
      topicForm.value = null;
      formInitial.value = null;
      topicError.value = '';
    }
  } else if (action.kind === 'category' || action.kind === 'material') {
    builder.archiveContentItem(action.kind, action.item.id);
  } else if (action.kind === 'file') {
    builder.archiveContentFile(action.materialId, action.item.id);
  }
  confirmDialog.value = null;
}

function restoreFile(material, file) {
  builder.restoreContentFile(material.id, file.id);
}

function removePendingFile(material, file) {
  const upload = pendingUploadForFile(file, material.id);
  if (upload) builder.removeContentUpload(upload.uploadId);
}

function moveFile(material, file, direction) {
  builder.moveContentFile(material.id, file.id, direction);
}

function updateFileLabel(material, file, event) {
  const next = event.target.value.trim();
  if (next !== (file.label || '')) builder.updateContentFile(material.id, file.id, { label: next });
}

function visibleFiles(material) {
  const source = (material.files || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  return source.filter((file) => visibility.value === 'all' || (visibility.value === 'visible' ? !file.is_archived : file.is_archived));
}

function filesForEditor(material) {
  // Once a material is open, always show its hidden files as well. This keeps
  // Restore available after the form is closed and reopened from Visible.
  if (selectedEntity.value?.entity === 'material' && String(selectedEntity.value.id) === String(material?.id)) {
    return (material?.files || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  }
  return visibleFiles(material);
}

function descendantCategoryIds(categoryId) {
  const descendants = new Set([String(categoryId)]);
  let changed = true;
  while (changed) {
    changed = false;
    categories.value.forEach((candidate) => {
      if (candidate.parent_id && descendants.has(String(candidate.parent_id)) && !descendants.has(String(candidate.id))) {
        descendants.add(String(candidate.id));
        changed = true;
      }
    });
  }
  return descendants;
}

const validParentCategories = computed(() => {
  const currentId = entityForm.value?.id || selectedEntity.value?.id;
  const invalid = currentId === null || currentId === undefined ? new Set() : descendantCategoryIds(currentId);
  return categories.value.filter((candidate) => categoryEffectivelyVisible(candidate) && !invalid.has(String(candidate.id)));
});

watch(() => builder.contentDraft, () => {
  // Publish replaces temporary IDs with server IDs. Keep the open inspector
  // attached to the corresponding item instead of silently turning Save into
  // a no-op on the old client ID.
  if (!selectedEntity.value || selectedEntity.value.isNew) return;
  const current = builder.contentItem(selectedEntity.value.entity, selectedEntity.value.id);
  if (current) return;
  const label = selectedEntity.value.entity === 'category' ? entityForm.value?.name : entityForm.value?.title;
  const collection = selectedEntity.value.entity === 'category' ? builder.contentDraft.categories : builder.contentDraft.materials;
  const replacement = collection.find((item) => String(selectedEntity.value.entity === 'category' ? item.name : item.title).trim() === String(label || '').trim());
  if (replacement) {
    selectedEntity.value = { ...selectedEntity.value, id: replacement.id, isNew: false };
    entityForm.value = {
      ...replacement,
      ...(selectedEntity.value.entity === 'material'
        ? { action_visibility: defaultActionVisibility(replacement.action_visibility) }
        : {}),
    };
  }
}, { deep: true });

const formDirty = computed(() => {
  if (!formInitial.value) return false;
  const current = topicForm.value || entityForm.value;
  return JSON.stringify(current || null) !== formInitial.value || Boolean(coverFile.value);
});

function closeFormNow() {
  selectedEntity.value = null;
  entityForm.value = null;
  topicForm.value = null;
  formInitial.value = null;
  fileError.value = '';
  topicError.value = '';
  coverFile.value = null;
  pendingCoverName.value = '';
  if (coverPreview.value?.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
  coverPreview.value = '';
}

function confirmClose() {
  if (formDirty.value) {
    confirmDialog.value = { kind: 'close', title: 'Discard these changes?', message: 'Your edits are still only in this form. Choose Save first, or discard them now.' };
    return;
  }
  closeFormNow();
}

onMounted(() => window.addEventListener('editor:content-select', handleCanvasSelection));
onUnmounted(() => {
  window.removeEventListener('editor:content-select', handleCanvasSelection);
  if (coverPreview.value.startsWith('blob:')) URL.revokeObjectURL(coverPreview.value);
});
</script>

<template>
  <div class="editor-content-panel" :class="{ 'is-loading': builder.contentLoading }">
    <div v-if="builder.contentLoading" class="editor-content-loading" role="status"><i class="bi bi-arrow-repeat"></i>Loading your published content…</div>
    <div class="editor-panel-heading">
      <div><span class="editor-kicker">Manage site content</span><h2>Content</h2></div>
      <span class="editor-content-draft-note" :class="{ dirty: builder.contentDirty }">{{ builder.contentDirty ? 'Draft' : 'Published' }}</span>
    </div>
    <p class="editor-panel-intro">Click an item to edit it. Hide keeps it safe so you can restore it later.</p>

    <label class="editor-content-search"><i class="bi bi-search"></i><input v-model="query" type="search" placeholder="Search content" aria-label="Search content" /><button v-if="query" type="button" aria-label="Clear search" @click="query = ''"><i class="bi bi-x-lg"></i></button></label>

    <div class="editor-content-tabs" role="tablist" aria-label="Content types">
      <button type="button" :class="{ active: section === 'topics' }" @click="section = 'topics'"><i class="bi bi-tags"></i><span>Topics</span><small>{{ visibleTopics.length }}</small></button>
      <button type="button" :class="{ active: section === 'categories' }" @click="section = 'categories'"><i class="bi bi-folder2"></i><span>Categories</span><small>{{ visibleCategories.length }}</small></button>
      <button type="button" :class="{ active: section === 'materials' }" @click="section = 'materials'"><i class="bi bi-file-earmark-text"></i><span>Materials</span><small>{{ visibleMaterials.length }}</small></button>
    </div>

    <div class="editor-content-toolbar">
      <div class="editor-visibility-switcher" role="group" aria-label="Content visibility">
        <button type="button" :class="{ active: visibility === 'visible' }" @click="visibility = 'visible'">Visible</button>
        <button type="button" :class="{ active: visibility === 'removed' }" @click="visibility = 'removed'">Removed</button>
        <button type="button" :class="{ active: visibility === 'all' }" @click="visibility = 'all'">All</button>
      </div>
      <button v-if="section === 'topics'" type="button" class="editor-content-add" @click="addTopic"><i class="bi bi-plus-lg"></i>Add topic</button>
      <button v-else-if="section === 'categories'" type="button" class="editor-content-add" @click="addCategory"><i class="bi bi-plus-lg"></i>New category</button>
      <button v-else type="button" class="editor-content-add" @click="addMaterial"><i class="bi bi-plus-lg"></i>New material</button>
    </div>

    <section v-if="section === 'topics'" class="editor-content-section">
      <div v-if="!filteredTopics.length" class="editor-content-empty"><i class="bi bi-search"></i><strong>{{ normalizedQuery ? 'No matching topics' : visibility === 'removed' ? 'No removed topics' : 'No topics yet' }}</strong><span>{{ normalizedQuery ? 'Try a different search.' : 'Add a topic to make it easy for visitors to browse.' }}</span></div>
      <div v-for="topic in filteredTopics" :key="topic.id" class="editor-content-row" :class="{ removed: !topic.visible, selected: topicForm?.id === topic.id }">
        <span class="editor-content-row-icon"><i :class="topic.icon"></i></span>
        <button type="button" class="editor-content-row-main" @click="editTopic(topic)"><strong>{{ topic.label }}</strong><small>{{ topic.targetType }} · {{ topic.target }}</small></button>
        <div class="editor-content-row-actions">
          <button v-if="topic.visible" type="button" class="editor-action-button" :disabled="topic.id === visibleTopics[0]?.id" @click="moveTopic(topic, 'up')">Move up</button>
          <button v-if="topic.visible" type="button" class="editor-action-button" :disabled="topic.id === visibleTopics[visibleTopics.length - 1]?.id" @click="moveTopic(topic, 'down')">Move down</button>
          <button v-if="topic.visible" type="button" class="editor-action-button" @click="duplicateTopic(topic)">Duplicate</button>
          <button v-if="topic.visible" type="button" class="editor-action-button danger" @click="requestHideTopic(topic)">Hide</button>
          <button v-else type="button" class="editor-action-button restore" @click="restoreTopic(topic)">Restore</button>
        </div>
      </div>
      <div v-if="topicForm" class="editor-content-form">
        <div class="editor-form-heading"><div><span class="editor-kicker">Topic</span><h3>Edit topic</h3></div><button type="button" aria-label="Close topic editor" @click="confirmClose"><i class="bi bi-x-lg"></i></button></div>
        <label>Name<input v-model="topicForm.label" class="editor-input" data-editor-form-field="topic:label" /></label>
        <label>Destination type<select v-model="topicForm.targetType" class="editor-input"><option value="category">Category</option><option value="search">Search</option><option value="url">Link</option></select></label>
        <label v-if="topicForm.targetType === 'category'">Category<select v-model="topicForm.target" class="editor-input"><option value="">Choose a category</option><option v-for="category in visibleCategories" :key="category.id" :value="String(category.id)">{{ category.name }}</option></select></label>
        <label v-else-if="topicForm.targetType === 'search'">Search words<input v-model="topicForm.target" class="editor-input" placeholder="/library?q=torah" /></label>
        <label v-else>Link<input v-model="topicForm.target" class="editor-input" placeholder="/library or https://example.com" /></label>
        <label>Icon<select v-model="topicForm.icon" class="editor-input"><option v-for="icon in topicIconOptions" :key="icon.value" :value="icon.value">{{ icon.label }}</option></select></label>
        <p v-if="topicError" class="editor-file-error"><i class="bi bi-exclamation-triangle"></i>{{ topicError }}</p>
        <div class="editor-content-form-actions"><button type="button" class="editor-secondary-action" @click="confirmClose">Cancel</button><button type="button" class="editor-primary-action" @click="saveTopic">Save topic</button></div>
      </div>
    </section>

    <section v-else-if="section === 'categories'" class="editor-content-section">
      <div v-if="!filteredCategories.length" class="editor-content-empty"><i class="bi bi-folder2"></i><strong>{{ normalizedQuery ? 'No matching categories' : visibility === 'removed' ? 'No removed categories' : 'No categories yet' }}</strong><span>Create a category to organize materials.</span></div>
      <div v-for="item in filteredCategories" :key="item.id" class="editor-content-row" :class="{ removed: !categoryEffectivelyVisible(item), selected: selectedEntity?.entity === 'category' && selectedEntity?.id === item.id }">
        <span class="editor-content-row-icon"><i class="bi bi-folder2"></i></span>
        <button type="button" class="editor-content-row-main" @click="editEntity('category', item)"><strong>{{ item.name }}</strong><small>{{ item.parent_id ? 'Subtopic' : 'Top-level topic' }} · {{ item.resource_count || 0 }} materials</small></button>
        <div class="editor-content-row-actions">
          <template v-if="categoryEffectivelyVisible(item)">
            <button type="button" class="editor-action-button" :disabled="isFirst('category', item)" @click="moveEntity('category', item, 'up')">Move up</button>
            <button type="button" class="editor-action-button" :disabled="isLast('category', item)" @click="moveEntity('category', item, 'down')">Move down</button>
            <button type="button" class="editor-action-button" @click="duplicateEntity('category', item)">Duplicate</button>
            <button type="button" class="editor-action-button danger" @click="requestHideEntity('category', item)">Hide</button>
          </template>
          <button v-else-if="item.is_archived" type="button" class="editor-action-button restore" @click="restoreEntity('category', item)">Restore</button>
          <button v-else-if="hiddenParentFor(item)" type="button" class="editor-action-button restore" :title="`Restore parent: ${hiddenParentFor(item).name}`" @click="restoreEntity('category', hiddenParentFor(item))">Restore parent</button>
        </div>
      </div>
    </section>

    <section v-else class="editor-content-section">
      <div v-if="!filteredMaterials.length" class="editor-content-empty"><i class="bi bi-file-earmark-text"></i><strong>{{ normalizedQuery ? 'No matching materials' : visibility === 'removed' ? 'No removed materials' : 'No materials yet' }}</strong><span>Add a material to make a resource available to visitors.</span></div>
      <div v-for="item in filteredMaterials" :key="item.id" class="editor-content-row" :class="{ removed: !visibleMaterials.includes(item), selected: selectedEntity?.entity === 'material' && selectedEntity?.id === item.id }">
        <span class="editor-content-row-icon"><i class="bi bi-file-earmark-text"></i></span>
        <button type="button" class="editor-content-row-main" @click="editEntity('material', item)"><strong>{{ item.title }}</strong><small>{{ materialCategoryName(item) }} · {{ item.is_published ? 'Published' : 'Draft' }} · {{ (item.files || []).filter((file) => !file.is_archived).length }} files</small></button>
        <div class="editor-content-row-actions">
          <template v-if="visibleMaterials.includes(item)">
            <button type="button" class="editor-action-button" :disabled="isFirst('material', item)" @click="moveEntity('material', item, 'up')">Move up</button>
            <button type="button" class="editor-action-button" :disabled="isLast('material', item)" @click="moveEntity('material', item, 'down')">Move down</button>
            <button type="button" class="editor-action-button" @click="duplicateEntity('material', item)">Duplicate</button>
            <button type="button" class="editor-action-button danger" @click="requestHideEntity('material', item)">Hide</button>
          </template>
          <button v-else-if="item.is_archived" type="button" class="editor-action-button restore" @click="restoreEntity('material', item)">Restore</button>
          <button v-else-if="hiddenParentFor(item)" type="button" class="editor-action-button restore" :title="`Restore parent: ${hiddenParentFor(item).name}`" @click="restoreEntity('category', hiddenParentFor(item))">Restore parent</button>
        </div>
      </div>
    </section>

    <section v-if="entityForm" class="editor-content-form">
      <div class="editor-form-heading"><div><span class="editor-kicker">{{ selectedEntity.entity === 'category' ? 'Category' : 'Material' }}</span><h3>{{ selectedEntity.entity === 'category' ? 'Edit category' : 'Edit material' }}</h3></div><button type="button" aria-label="Close item editor" @click="confirmClose"><i class="bi bi-x-lg"></i></button></div>
      <template v-if="selectedEntity.entity === 'category'">
        <label>Name<input v-model="entityForm.name" class="editor-input" data-editor-form-field="category:name" /></label>
        <label>Description<textarea v-model="entityForm.description" class="editor-input" rows="3" data-editor-form-field="category:description"></textarea></label>
        <label>Parent topic<select v-model="entityForm.parent_id" class="editor-input"><option :value="null">No parent</option><option v-for="parent in validParentCategories" :key="parent.id" :value="parent.id">{{ parent.name }}</option></select></label>
        <label class="editor-checkbox-row"><input v-model="entityForm.nav_visible" type="checkbox" />Show in navigation, sidebars, filters, and topic lists</label>
      </template>
      <template v-else>
        <label>Title<input v-model="entityForm.title" class="editor-input" data-editor-form-field="material:title" /></label>
        <label>Short description<textarea v-model="entityForm.description" class="editor-input" rows="3" data-editor-form-field="material:description"></textarea></label>
        <label>Full description<textarea v-model="entityForm.content_description" class="editor-input" rows="4" data-editor-form-field="material:content_description"></textarea></label>
        <label>Category<select v-model="entityForm.category_id" class="editor-input"><option :value="null">Uncategorized</option><option v-for="category in visibleCategories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
        <div class="editor-content-form-grid"><label>Age range<input v-model="entityForm.age_range" class="editor-input" data-editor-form-field="material:age_range" /></label><label>Grade<input v-model="entityForm.grade_level" class="editor-input" data-editor-form-field="material:grade_level" /></label></div>
        <div class="editor-content-form-grid"><label>Type<input v-model="entityForm.material_type" class="editor-input" data-editor-form-field="material:material_type" /></label><label>Display<select v-model="entityForm.display_mode" class="editor-input"><option value="default">File list</option><option value="grid">Grid</option><option value="gallery">Gallery</option></select></label></div>
        <label>Keywords<input v-model="entityForm.keywords" class="editor-input" placeholder="torah, holiday, printable" /></label>
        <label class="editor-checkbox-row"><input v-model="entityForm.is_published" type="checkbox" />Published for visitors</label>
        <fieldset class="editor-action-visibility">
          <legend>Visitor actions</legend>
          <p>Choose which buttons visitors can see for this material.</p>
          <label v-for="action in ACTION_OPTIONS" :key="action.key" class="editor-checkbox-row">
            <input v-model="entityForm.action_visibility[action.key]" type="checkbox" />{{ action.label }}
          </label>
        </fieldset>

        <div v-if="selectedEntity.isNew" class="editor-file-hint"><i class="bi bi-info-circle"></i>Save this material first. Then you can add files and manage them here.</div>
        <div v-if="!selectedEntity.isNew" class="editor-file-section">
          <div class="editor-file-section-heading"><div><strong>Cover image</strong><small>Use one image as the material cover.</small></div><span v-if="builder.contentUploads.some((upload) => upload.kind === 'cover' && String(upload.id) === String(selectedEntity.id))" class="editor-file-status">Pending</span></div>
          <div v-if="(coverPreview || entityForm.cover_image) && !entityForm.cover_hidden" class="editor-cover-preview"><img :src="coverPreview || entityForm.cover_image" alt="Cover preview" /><span>{{ pendingCoverName || coverFile ? 'New cover preview' : 'Current cover' }}</span></div>
          <p v-if="pendingCoverName" class="editor-file-pending"><i class="bi bi-clock"></i>{{ pendingCoverName }} will replace the cover when you Publish.</p>
          <label class="editor-upload-drop compact"><i class="bi bi-image"></i><span>{{ coverFile ? coverFile.name : pendingCoverName || 'Choose a new cover image' }}</span><input type="file" accept="image/jpeg,image/png,image/webp" @change="coverFile = $event.target.files?.[0] || null" /></label>
          <div class="editor-cover-actions"><button v-if="entityForm.cover_image && !entityForm.cover_hidden" type="button" class="editor-action-button danger" @click="removeCover"><i class="bi bi-eye-slash"></i>Hide cover</button><button v-else-if="entityForm.cover_hidden || builder.publishedContent.materials.some((item) => String(item.id) === String(selectedEntity.id) && item.cover_image)" type="button" class="editor-action-button restore" @click="restoreCover"><i class="bi bi-eye"></i>Restore cover</button></div>
        </div>

        <div v-if="!selectedEntity.isNew" class="editor-file-section">
          <div class="editor-file-section-heading"><div><strong>Files</strong><small>Add several PDFs or presentations at once.</small></div><span>{{ filesForEditor(builder.contentItem('material', selectedEntity.id) || entityForm).filter((file) => !file.is_archived).length }} visible</span></div>
          <label class="editor-upload-drop" :class="{ over: dragOverMaterialId === selectedEntity.id }" @dragover="handleDragOver($event, selectedEntity.id)" @dragleave="dragOverMaterialId = null" @drop.prevent="handleFileDrop($event, selectedEntity.id)"><i class="bi bi-cloud-arrow-up"></i><strong>Drop files here</strong><span>or choose PDF, DOCX, PPT or PPTX</span><input type="file" multiple accept="application/pdf,.pdf,.docx,.ppt,.pptx" @change="handleFileInput($event, selectedEntity.id)" /></label>
          <div v-if="fileError" class="editor-file-error"><i class="bi bi-exclamation-triangle"></i>{{ fileError }}</div>
          <div v-if="filesForEditor(builder.contentItem('material', selectedEntity.id) || entityForm).length" class="editor-files-list">
            <div v-for="file in filesForEditor(builder.contentItem('material', selectedEntity.id) || entityForm)" :key="file.id" class="editor-file-row" :class="{ removed: file.is_archived, pending: fileIsPending(file, selectedEntity.id) }">
              <span class="editor-file-icon"><i :class="file.file_type === 'pdf' ? 'bi bi-filetype-pdf' : 'bi bi-file-earmark-slides'"></i></span>
              <div class="editor-file-info"><input class="editor-file-label" :value="fileLabel(file)" aria-label="File label" @change="updateFileLabel(builder.contentItem('material', selectedEntity.id) || entityForm, file, $event)" /><small>{{ file.file_type?.toUpperCase() || 'FILE' }} · {{ formatBytes(file.file_size) }}<span v-if="fileIsPending(file, selectedEntity.id)"> · Not published</span></small></div>
              <div class="editor-file-actions"><button type="button" title="Move file up" aria-label="Move file up" :disabled="file.is_archived" @click="moveFile(builder.contentItem('material', selectedEntity.id) || entityForm, file, 'up')"><i class="bi bi-arrow-up"></i><span>Up</span></button><button type="button" title="Move file down" aria-label="Move file down" :disabled="file.is_archived" @click="moveFile(builder.contentItem('material', selectedEntity.id) || entityForm, file, 'down')"><i class="bi bi-arrow-down"></i><span>Down</span></button><button v-if="!file.is_archived" type="button" class="danger" title="Hide file" aria-label="Hide file" @click="requestHideFile(builder.contentItem('material', selectedEntity.id) || entityForm, file)"><i class="bi bi-eye-slash"></i><span>Hide</span></button><button v-if="file.is_archived" type="button" class="restore" title="Restore file" aria-label="Restore file" @click="restoreFile(builder.contentItem('material', selectedEntity.id) || entityForm, file)"><i class="bi bi-eye"></i><span>Restore</span></button><button v-if="fileIsPending(file, selectedEntity.id)" type="button" class="danger" title="Remove pending upload" aria-label="Remove pending upload" @click="removePendingFile(builder.contentItem('material', selectedEntity.id) || entityForm, file)"><i class="bi bi-x-lg"></i><span>Remove</span></button></div>
            </div>
          </div>
          <div v-else class="editor-file-empty">No files yet. Add one or more files above.</div>
        </div>
      </template>
      <div class="editor-content-form-actions"><button type="button" class="editor-secondary-action" @click="confirmClose">Close</button><button type="button" class="editor-primary-action" @click="saveEntity">Save item</button></div>
    </section>

    <div v-if="confirmDialog" class="editor-confirm-backdrop" role="presentation" tabindex="-1" @keydown.esc="confirmDialog = null" @click.self="confirmDialog = null">
      <div class="editor-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-confirm-title"><div class="editor-confirm-icon"><i :class="confirmDialog.kind === 'close' ? 'bi bi-pencil' : 'bi bi-eye-slash'"></i></div><h3 id="editor-confirm-title">{{ confirmDialog.title }}</h3><p>{{ confirmDialog.message }}</p><div class="editor-content-form-actions"><button type="button" class="editor-secondary-action" autofocus @click="confirmDialog = null">Cancel</button><button type="button" class="editor-danger-action" @click="confirmHide">{{ confirmDialog.kind === 'close' ? 'Discard' : 'Hide' }}</button></div></div>
    </div>
  </div>
</template>

<style scoped>
.editor-content-panel { position: relative; flex: 1; min-height: 0; overflow-y: auto; padding: 20px 18px 34px; color: #234b67; font-family: Nunito, system-ui, sans-serif; }
.editor-content-panel.is-loading > *:not(.editor-content-loading) { pointer-events: none; opacity: .55; }
.editor-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.editor-content-loading { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 8px 10px; border: 1px solid #cde9eb; border-radius: 7px; background: #f0fbfb; color: #237f86; font-size: .68rem; font-weight: 800; }
.editor-content-loading i { animation: editor-spin .8s linear infinite; }
@keyframes editor-spin { to { transform: rotate(360deg); } }
.editor-content-draft-note { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 999px; background: #edf5f7; color: #6d8795; font-size: .63rem; font-weight: 900; text-transform: uppercase; letter-spacing: .07em; }
.editor-content-draft-note.dirty { background: #fff4df; color: #a86612; }
.editor-content-search { display: flex; align-items: center; gap: 7px; min-height: 36px; margin: 13px 0 10px; padding: 0 9px; border: 1px solid #d4e4eb; border-radius: 8px; background: #fff; color: #7893a3; }
.editor-content-search:focus-within { border-color: #3bafb8; box-shadow: 0 0 0 3px rgba(59, 175, 184, .12); }
.editor-content-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: #294f66; font: inherit; font-size: .76rem; }
.editor-content-search button { width: 24px; height: 24px; border: 0; border-radius: 5px; background: transparent; color: #7893a3; cursor: pointer; }
.editor-content-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 0 0 10px; }
.editor-content-tabs button { display: flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; min-height: 38px; border: 1px solid #dce8f0; border-radius: 8px; background: #fff; color: #6e8799; cursor: pointer; font: inherit; font-size: .68rem; font-weight: 800; }
.editor-content-tabs button.active { border-color: #9bd5d7; background: #eafafa; color: #237f86; }
.editor-content-tabs small { display: inline-grid; place-items: center; min-width: 19px; height: 19px; padding: 0 4px; border-radius: 999px; background: #edf5f7; color: #6e8799; font-size: .58rem; }
.editor-content-tabs button.active small { background: #c8eded; color: #237f86; }
.editor-content-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.editor-visibility-switcher { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid #dce8f0; border-radius: 8px; background: #f7fafc; }
.editor-visibility-switcher button { min-height: 27px; padding: 4px 7px; border: 0; border-radius: 6px; background: transparent; color: #7690a3; cursor: pointer; font: inherit; font-size: .64rem; font-weight: 800; }
.editor-visibility-switcher button.active { background: #dff5f5; color: #237f86; }
.editor-content-add, .editor-primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 31px; padding: 6px 9px; border: 1px solid #9bd5d7; border-radius: 7px; background: #eafafa; color: #237f86; cursor: pointer; font: inherit; font-size: .68rem; font-weight: 900; }
.editor-content-section { display: grid; gap: 7px; }
.editor-content-row { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; min-width: 0; padding: 8px; border: 1px solid #e1ebef; border-radius: 8px; background: #fff; }
.editor-content-row.selected { border-color: #8dced0; background: #f1fbfb; }
.editor-content-row.removed { opacity: .65; background: #f6f8f9; }
.editor-content-row-icon { flex: 0 0 auto; width: 29px; height: 29px; display: grid; place-items: center; border-radius: 7px; background: #eef6fa; color: #3bafb8; }
.editor-content-row-main { flex: 1 1 120px; min-width: 0; display: grid; gap: 2px; padding: 0; border: 0; background: transparent; color: #315770; text-align: left; cursor: pointer; }
.editor-content-row-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .73rem; }
.editor-content-row-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #8aa0af; font-size: .61rem; }
.editor-content-row-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; flex: 1 1 100%; padding-left: 36px; }
.editor-action-button { min-height: 25px; padding: 4px 6px; border: 1px solid #d4e4eb; border-radius: 5px; background: #fff; color: #6a8798; cursor: pointer; font: inherit; font-size: .59rem; font-weight: 800; }
.editor-action-button:hover:not(:disabled) { border-color: #7fc8ca; background: #f0fbfb; color: #237f86; }
.editor-action-button:disabled { opacity: .35; cursor: not-allowed; }
.editor-action-button.danger { border-color: #efc5c3; background: #fff8f7; color: #b3413e; }
.editor-action-button.restore { border-color: #b6dfc1; background: #f3fcf4; color: #39804b; }
.editor-content-empty { display: grid; justify-items: center; gap: 5px; padding: 24px 12px; border: 1px dashed #c8d8df; border-radius: 8px; color: #7893a3; font-size: .7rem; line-height: 1.45; text-align: center; }
.editor-content-empty i { color: #3bafb8; font-size: 1.45rem; }
.editor-content-empty strong { color: #45687c; font-size: .76rem; }
.editor-content-form { display: grid; gap: 10px; margin-top: 14px; padding: 13px; border: 1px solid #cde9eb; border-radius: 10px; background: #f6fcfc; }
.editor-form-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-bottom: 4px; border-bottom: 1px solid #dcecef; }
.editor-form-heading h3 { margin: 2px 0 0; color: #315770; font-size: .82rem; }
.editor-form-heading button { width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: #7893a3; cursor: pointer; }
.editor-content-form label { display: grid; gap: 4px; color: #557285; font-size: .68rem; font-weight: 800; }
.editor-content-form textarea { resize: vertical; }
.editor-content-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.editor-content-form-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 7px; margin-top: 3px; }
.editor-secondary-action, .editor-danger-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 33px; padding: 7px 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; color: #557285; cursor: pointer; font: inherit; font-size: .7rem; font-weight: 800; }
.editor-secondary-action:hover { border-color: #7fc8ca; background: #f0fbfb; color: #237f86; }
.editor-danger-action { border-color: #efc5c3; background: #fff8f7; color: #b3413e; }
.editor-danger-action:hover { border-color: #e49b98; background: #fff0ef; }
.editor-checkbox-row { display: flex !important; align-items: center; gap: 8px; min-height: 34px; padding: 8px 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; color: #557285; font-size: .7rem !important; }
.editor-checkbox-row input { accent-color: #3bafb8; }
.editor-action-visibility { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 0; padding: 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; }
.editor-action-visibility legend { float: none; width: 100%; margin: 0; color: #557285; font-size: .7rem; font-weight: 900; }
.editor-action-visibility p { grid-column: 1 / -1; margin: -2px 0 2px; color: #8aa0af; font-size: .61rem; font-weight: 600; }
.editor-action-visibility .editor-checkbox-row { min-height: 30px; padding: 5px 6px; font-size: .64rem !important; }
.editor-file-section { display: grid; gap: 8px; padding-top: 4px; }
.editor-file-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; color: #557285; font-size: .7rem; }
.editor-file-section-heading strong, .editor-file-section-heading small { display: block; }
.editor-file-section-heading small { margin-top: 2px; color: #8aa0af; font-size: .62rem; font-weight: 600; }
.editor-file-section-heading > span { color: #7893a3; font-size: .62rem; font-weight: 800; white-space: nowrap; }
.editor-file-status { color: #a86612 !important; }
.editor-file-pending { display: flex; align-items: center; gap: 6px; margin: 0; color: #a86612; font-size: .68rem; line-height: 1.4; }
.editor-file-pending i { color: #d88936; }
.editor-cover-preview { display: flex; align-items: center; gap: 8px; color: #6d8795; font-size: .64rem; font-weight: 800; }
.editor-cover-preview img { width: 44px; height: 36px; object-fit: cover; border-radius: 5px; border: 1px solid #dce8f0; background: #fff; }
.editor-cover-actions { display: flex; gap: 6px; }
.editor-upload-drop { position: relative; display: grid; justify-items: center; gap: 3px; min-height: 72px; padding: 10px; border: 1px dashed #a9cfd5; border-radius: 8px; background: #fff; color: #6d8795; cursor: pointer; text-align: center; }
.editor-upload-drop:hover, .editor-upload-drop.over { border-color: #3bafb8; background: #eefafa; color: #237f86; }
.editor-upload-drop i { color: #3bafb8; font-size: 1.25rem; }
.editor-upload-drop strong { font-size: .7rem; }
.editor-upload-drop span { font-size: .61rem; }
.editor-upload-drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.editor-upload-drop.compact { display: flex; justify-content: flex-start; min-height: 38px; padding: 7px 9px; text-align: left; }
.editor-upload-drop.compact i { font-size: .95rem; }
.editor-files-list { display: grid; gap: 5px; }
.editor-file-row { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px; border: 1px solid #dce8f0; border-radius: 7px; background: #fff; }
.editor-file-row.pending { border-color: #f1d49f; background: #fffaf0; }
.editor-file-row.removed { opacity: .65; background: #f6f8f9; }
.editor-file-icon { flex: 0 0 auto; width: 25px; height: 25px; display: grid; place-items: center; border-radius: 5px; background: #eef6fa; color: #3bafb8; }
.editor-file-info { flex: 1; min-width: 0; display: grid; gap: 2px; }
.editor-file-label { width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: #315770; font: inherit; font-size: .67rem; font-weight: 800; text-overflow: ellipsis; }
.editor-file-info small { color: #8aa0af; font-size: .57rem; }
.editor-file-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; flex: 0 0 auto; max-width: 48%; }
.editor-file-actions button { display: inline-flex; align-items: center; gap: 3px; min-height: 25px; padding: 3px 5px; border: 0; border-radius: 4px; background: transparent; color: #74909f; cursor: pointer; font: inherit; font-size: .58rem; font-weight: 800; }
.editor-file-actions button:hover:not(:disabled) { background: #eafafa; color: #237f86; }
.editor-file-actions button.danger:hover { background: #fff0ef; color: #b3413e; }
.editor-file-actions button.restore:hover { background: #f3fcf4; color: #39804b; }
.editor-file-actions button:disabled { opacity: .3; cursor: not-allowed; }
.editor-file-empty, .editor-file-error { padding: 8px; border-radius: 6px; font-size: .63rem; }
.editor-file-hint { display: flex; align-items: flex-start; gap: 7px; padding: 9px; border: 1px solid #d7e7ee; border-radius: 7px; background: #fff; color: #6d8795; font-size: .66rem; line-height: 1.4; }
.editor-file-hint i { color: #3bafb8; }
.editor-file-empty { border: 1px dashed #c8d8df; color: #7893a3; text-align: center; }
.editor-file-error { display: flex; gap: 5px; border: 1px solid #efc5c3; background: #fff3f2; color: #b3413e; line-height: 1.35; }
.editor-confirm-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 18px; background: rgba(23, 63, 95, .3); }
.editor-confirm-dialog { width: min(330px, 100%); padding: 20px; border: 1px solid #dce8f0; border-radius: 12px; background: #fff; box-shadow: 0 18px 48px rgba(24, 70, 95, .25); color: #557285; text-align: center; }
.editor-confirm-icon { width: 38px; height: 38px; display: grid; place-items: center; margin: 0 auto 8px; border-radius: 50%; background: #fff0ef; color: #b3413e; }
.editor-confirm-dialog h3 { margin: 0; color: #173f5f; font-size: .95rem; }
.editor-confirm-dialog p { margin: 8px 0 13px; font-size: .72rem; line-height: 1.45; }
@media (max-width: 760px) { .editor-content-panel { padding: 16px 14px 24px; } .editor-content-row-actions { padding-left: 0; } .editor-content-form-grid { grid-template-columns: 1fr; } }
</style>
