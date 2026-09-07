import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import api from '@/api';
import { useAuthStore, useSettingsStore } from '@/stores';
import {
  parseLayout,
  emptyLayout,
  clone,
  uid,
  makeSection,
  makeColumn,
  findBlock,
  publishedKey,
  normalizeBlockPlacement,
  normalizeLayout,
} from './layout';
import { defaultPropsFor } from './registry';
import {
  applyContentOperation,
  cloneContent,
  defaultContentSnapshot,
  normalizeContentSnapshot,
  normalizeMaterialFile,
  normalizeQuickTopics,
} from './contentModel';
import {
  contentTextBinding,
  contentTextPatch,
  contentTextValue,
} from './contentTextBindings';
import {
  SITE_DOCUMENT_DRAFT_KEY,
  SITE_DOCUMENT_KEY,
  SITE_DOCUMENT_PAGE_ZONES,
  cloneSiteDocument,
  createSiteDocumentBlock,
  createSiteDocumentSection,
  emptySiteDocument,
  migrateLegacySiteDocument,
  normalizeSiteDocument,
  parseSiteDocument,
  pageIdForRouteSlug,
} from './siteDocument';

const MAX_HISTORY = 50;

// Client-side draft storage. Drafts NEVER touch the backend, so unpublished
// content can never leak through the public GET /settings. Only "Publish"
// writes to the server. Trade-off: drafts are per-browser (fine for an admin).
function draftStorageKey(slug) {
  return `builder_draft_${slug}`;
}

const CONTENT_DRAFT_KEY = 'builder_content_draft';

function clearLocalDraftStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('builder_draft_') || key === 'jer_builder_drafts' || key === CONTENT_DRAFT_KEY || key === SITE_DOCUMENT_DRAFT_KEY) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* localStorage can be unavailable in privacy-restricted browsers. */
  }
}

function readLocalContentDraft() {
  try {
    const raw = localStorage.getItem(CONTENT_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readLocalDraft(slug) {
  try {
    const raw = localStorage.getItem(draftStorageKey(slug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readLocalSiteDocumentDraft() {
  try {
    const raw = localStorage.getItem(SITE_DOCUMENT_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createBlock(type, props = {}) {
  return {
    id: uid('b'),
    type,
    props: { ...defaultPropsFor(type), ...props },
    layout: normalizeBlockPlacement(),
  };
}

export const useBuilderStore = defineStore('builder', () => {
  const auth = useAuthStore();
  const settings = useSettingsStore();

  const editMode = ref(false);
  const useCanvas = ref(false); // false = inline text editing; true = block-layout canvas
  const slug = ref('home');
  const layout = ref(emptyLayout());
  const siteDocument = ref(emptySiteDocument());
  const publishedSiteDocument = ref(emptySiteDocument());
  const siteDocumentLoaded = ref(false);
  const pendingSettings = ref({}); // buffered inline text/image edits (key -> value)
  const contentDraft = ref(defaultContentSnapshot());
  const publishedContent = ref(defaultContentSnapshot());
  const pendingContent = ref({ quickTopics: null, operations: [] });
  const contentUploads = ref([]);
  const pendingMediaUploads = ref([]);
  const contentLoaded = ref(false);
  const contentLoading = ref(false);
  const contentRevision = ref(null);
  const selectedId = ref(null);
  const selectedSectionId = ref(null);
  const selectedSetting = ref(null);
  const selectedContentText = ref(null);
  const selectedDocumentItem = ref(null);
  const dirty = ref(false);
  const saving = ref(false);
  const operationNotice = ref(null);
  const history = ref([]);
  const future = ref([]);
  const settingHistory = ref([]);
  const settingFuture = ref([]);
  const actionHistory = ref([]);
  const actionFuture = ref([]);
  const contentHistory = ref([]);
  const contentFuture = ref([]);
  const documentHistory = ref([]);
  const documentFuture = ref([]);
  const draggedPayload = ref(null);
  const publishedBaseline = ref({ layout: emptyLayout(), useCanvas: false });
  let activeHistorySnapshot = null;
  let activeDocumentHistorySnapshot = null;
  let activeInlineSettingSnapshot = null;
  let activeInlineContentSnapshot = null;
  let activeInlineContentBinding = null;

  const canEdit = computed(() => auth.isAdmin);
  const canUndo = computed(() => actionHistory.value.length > 0);
  const canRedo = computed(() => actionFuture.value.length > 0);
  const contentDirty = computed(() => pendingContent.value.operations.length > 0 || pendingContent.value.quickTopics !== null || contentUploads.value.length > 0);
  const siteDocumentDirty = computed(() => (
    JSON.stringify(normalizeSiteDocument(siteDocument.value))
      !== JSON.stringify(normalizeSiteDocument(publishedSiteDocument.value))
  ));

  // Authentication can expire while the editor is open (including from a
  // route that does not render PublicLayout). Close the editor as soon as the
  // admin capability disappears so an unpublished draft cannot remain visible
  // in the public SPA while pending media cleanup is still running.
  watch(() => auth.isAdmin, (allowed, wasAllowed) => {
    if (!allowed && (wasAllowed || editMode.value)) {
      // Drafts are browser-local and must not become visible to a different
      // account using the same browser after logout or token expiry.
      resetToDefaults();
    }
  });

  const selectedBlock = computed(() => {
    if (!selectedId.value) return null;
    const found = findBlock(layout.value, selectedId.value);
    return found ? found.block : null;
  });

  const selectedSection = computed(() => {
    if (!selectedSectionId.value) return null;
    return layout.value.sections.find((section) => section.id === selectedSectionId.value) || null;
  });

  const selectedDocumentBlock = computed(() => {
    const item = selectedDocumentItem.value;
    if (item?.kind !== 'block') return null;
    return findDocumentBlock(siteDocument.value, item.pageId, item.zone, item.id)?.block || null;
  });

  const selectedDocumentSection = computed(() => {
    const item = selectedDocumentItem.value;
    if (item?.kind !== 'section') return null;
    return findDocumentSection(siteDocument.value, item.pageId, item.zone, item.id)?.section || null;
  });

  function publishedLayout(pageSlug) {
    return parseLayout((settings.settings || {})[publishedKey(pageSlug || slug.value)]);
  }

  function captureStructure() {
    return { layout: clone(layout.value), useCanvas: useCanvas.value };
  }

  function restoreStructure(snapshotValue) {
    const snapshot = snapshotValue?.layout ? snapshotValue : { layout: snapshotValue, useCanvas: true };
    layout.value = normalizeLayout(snapshot.layout || emptyLayout());
    useCanvas.value = !!snapshot.useCanvas;
  }

  function structuresEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function setPublishedBaseline(published) {
    const safeLayout = normalizeLayout(published || emptyLayout());
    publishedBaseline.value = {
      layout: clone(safeLayout),
      useCanvas: safeLayout.sections.length > 0,
    };
    return safeLayout;
  }

  function settingsEquivalent(left, right) {
    const leftEmpty = left === undefined || left === '';
    const rightEmpty = right === undefined || right === '';
    return (leftEmpty && rightEmpty) || Object.is(left, right);
  }

  function cleanPendingSettings(values) {
    return Object.fromEntries(
      Object.entries(values || {}).filter(([key, value]) => !settingsEquivalent(settings.settings?.[key], value))
    );
  }

  function layoutHasChanges() {
    if (useCanvas.value !== publishedBaseline.value.useCanvas) return true;
    if (!useCanvas.value) return false;
    return !structuresEqual(normalizeLayout(layout.value), publishedBaseline.value.layout);
  }

  function recomputeDirty() {
    dirty.value = Object.keys(pendingSettings.value).length > 0 || layoutHasChanges() || contentDirty.value || siteDocumentDirty.value;
    return dirty.value;
  }

  // Resolve a setting value: buffered edit wins, then live settings, then default.
  function settingValue(key, fallback = '') {
    if (Object.prototype.hasOwnProperty.call(pendingSettings.value, key)) {
      const pending = pendingSettings.value[key];
      // An explicit empty draft value is intentional: it lets an administrator
      // clear a label or paragraph instead of silently restoring the default.
      return pending === undefined ? fallback : pending;
    }
    const live = settings.settings?.[key];
    return live === undefined || live === null ? fallback : live;
  }

  function clearRedo() {
    future.value = [];
    settingFuture.value = [];
    contentFuture.value = [];
    documentFuture.value = [];
    actionFuture.value = [];
  }

  function recordAction(kind) {
    actionHistory.value.push(kind);
    if (actionHistory.value.length > MAX_HISTORY) actionHistory.value.shift();
    clearRedo();
  }

  function snapshotSettings() {
    settingHistory.value.push({ ...pendingSettings.value });
    if (settingHistory.value.length > MAX_HISTORY) settingHistory.value.shift();
    recordAction('setting');
  }

  function snapshotContent() {
    contentHistory.value.push({
      draft: cloneContent(contentDraft.value),
      pending: cloneContent(pendingContent.value),
      uploads: contentUploads.value.map((upload) => ({ ...upload })),
    });
    if (contentHistory.value.length > MAX_HISTORY) contentHistory.value.shift();
    recordAction('content');
  }

  function snapshotSiteDocument() {
    documentHistory.value.push(cloneSiteDocument(siteDocument.value));
    if (documentHistory.value.length > MAX_HISTORY) documentHistory.value.shift();
    recordAction('document');
  }

  function beginInlineSettingEdit() {
    if (!activeInlineSettingSnapshot) activeInlineSettingSnapshot = { ...pendingSettings.value };
  }

  function commitInlineSettingEdit() {
    if (!activeInlineSettingSnapshot) return false;
    const before = activeInlineSettingSnapshot;
    activeInlineSettingSnapshot = null;
    if (JSON.stringify(before) === JSON.stringify(pendingSettings.value)) return false;
    settingHistory.value.push(before);
    if (settingHistory.value.length > MAX_HISTORY) settingHistory.value.shift();
    recordAction('setting');
    return true;
  }

  function persistContentDraft() {
    if (!canEdit.value || !editMode.value) return false;
    try {
      localStorage.setItem(CONTENT_DRAFT_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        draft: contentDraft.value,
        pending: pendingContent.value,
        // Browser File objects cannot be serialized. Keep only completed
        // staging references so a reload can resume Publish without asking
        // the administrator to select the same file again.
        uploads: contentUploads.value.map((upload) => ({
          uploadId: upload.uploadId,
          entity: upload.entity,
          id: upload.id,
          materialId: upload.materialId,
          kind: upload.kind,
          fileName: upload.fileName,
          fileSize: upload.fileSize,
          mimeType: upload.mimeType,
          label: upload.label,
          primary: upload.primary,
          opId: upload.opId,
          clientId: upload.clientId,
          stagedPath: upload.stagedPath,
          name: upload.name,
          size: upload.size,
        })).filter((upload) => upload.uploadId),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function restoreContentSnapshot(snapshot) {
    contentDraft.value = normalizeContentSnapshot(snapshot?.draft, settings.settings);
    pendingContent.value = snapshot?.pending || { quickTopics: null, operations: [] };
    contentUploads.value = Array.isArray(snapshot?.uploads) ? snapshot.uploads.map((upload) => ({ ...upload })) : [];
  }

  function setSetting(key, value, options = {}) {
    const hasPending = Object.prototype.hasOwnProperty.call(pendingSettings.value, key);
    const current = hasPending ? pendingSettings.value[key] : settings.settings?.[key];
    if (settingsEquivalent(current, value)) return false;
    if (options.record !== false) snapshotSettings();
    const next = { ...pendingSettings.value };
    if (settingsEquivalent(settings.settings?.[key], value)) delete next[key];
    else next[key] = value;
    pendingSettings.value = next;
    recomputeDirty();
    persistLocalDraft();
    void cleanupUnusedPendingMediaUploads();
    return true;
  }

  function resetSetting(key) {
    return setSetting(key, '');
  }

  function selectSetting(meta) {
    if (!meta?.key) return;
    selectedSetting.value = { ...meta };
    selectedContentText.value = null;
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedDocumentItem.value = null;
  }

  function clearSelection() {
    selectedSetting.value = null;
    selectedContentText.value = null;
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedDocumentItem.value = null;
  }

  function trackPendingMediaUpload(url) {
    if (!url || pendingMediaUploads.value.includes(url)) return;
    pendingMediaUploads.value = [...pendingMediaUploads.value, url];
  }

  function currentMediaReferences() {
    const sources = [pendingSettings.value, layout.value, siteDocument.value, contentDraft.value, contentUploads.value];
    return new Set(pendingMediaUploads.value.filter((url) => (
      sources.some((source) => JSON.stringify(source).includes(String(url)))
    )));
  }

  async function cleanupPendingMediaUploads(keepUrls = currentMediaReferences()) {
    const keep = new Set(keepUrls || []);
    const uploads = pendingMediaUploads.value.filter((url) => !keep.has(url));
    pendingMediaUploads.value = pendingMediaUploads.value.filter((url) => keep.has(url));
    const results = await Promise.allSettled(uploads.map((url) => api.delete('/settings/upload', { data: { url } })));
    results.forEach((result, index) => {
      if (result.status === 'rejected' && !pendingMediaUploads.value.includes(uploads[index])) {
        pendingMediaUploads.value.push(uploads[index]);
      }
    });
  }

  async function cleanupUnusedPendingMediaUploads() {
    return cleanupPendingMediaUploads(currentMediaReferences());
  }

  async function loadContent() {
    if (!canEdit.value) return false;
    contentLoading.value = true;
    try {
      const { data } = await api.get('/editor/content');
      contentRevision.value = data?.revision ?? null;
      const baseline = normalizeContentSnapshot(data, settings.settings);
      publishedContent.value = cloneContent(baseline);
      const local = readLocalContentDraft();
      if (local?.draft && local?.pending) {
        const persistedOperations = Array.isArray(local.pending.operations) ? local.pending.operations : [];
        const persistedUploads = Array.isArray(local.uploads)
          ? local.uploads.filter((upload) => upload?.uploadId)
          : [];
        const persistedUploadIds = new Set(persistedUploads.map((upload) => String(upload.clientId || upload.id)).filter(Boolean));
        const persistedUploadOps = new Set(persistedUploads.map((upload) => String(upload.opId)).filter(Boolean));
        const droppedAdds = persistedOperations.filter((operation) => (
          operation.entity === 'file'
          && operation.action === 'add'
          && !persistedUploadIds.has(String(operation.clientId || operation.id))
        ));
        const droppedClientIds = new Set(droppedAdds.map((operation) => String(operation.clientId || operation.id)).filter(Boolean));
        const referencesDroppedFile = (operation) => {
          if (operation.entity !== 'file') return false;
          const ids = [operation.id, operation.clientId, operation.data?.id, operation.data?.clientId, operation.materialId, operation.data?.material_id]
            .filter((value) => value !== undefined && value !== null)
            .map(String);
          if (ids.some((value) => droppedClientIds.has(value))) return true;
          return (operation.data?.items || []).some((item) => droppedClientIds.has(String(item?.id)));
        };
        const hasDroppedUploads = droppedAdds.length > 0;
        // A persisted update/archive/reorder that points at a browser File is
        // just as unrecoverable as the add itself. Drop the whole chain so a
        // later Publish cannot fail with a phantom file id.
        const recoverableOperations = persistedOperations.filter((operation) => (
          !(operation.entity === 'file' && operation.action === 'add') && !referencesDroppedFile(operation)
        ));
        const persistedDraft = normalizeContentSnapshot(local.draft, settings.settings);
        persistedDraft.materials = persistedDraft.materials.map((material) => ({
          ...material,
          // A browser File cannot be serialized. Remove any temporary file
          // rows left by a previous tab instead of showing a broken upload.
          files: (material.files || []).filter((file) => (
            !file.clientId || persistedUploadIds.has(String(file.clientId))
          )),
        }));
        contentDraft.value = persistedDraft;
        pendingContent.value = {
          quickTopics: local.pending.quickTopics === undefined ? null : local.pending.quickTopics,
          // Binary File objects cannot be restored from localStorage. Keep the
          // metadata operations, but discard phantom add operations that no
          // longer have a queued upload in this browser session.
          operations: recoverableOperations,
        };
        // A completed staged upload is safe to reuse after reload. It has no
        // File object, so the UI can still edit its label/visibility while
        // Publish sends only the server-owned staging reference.
        contentUploads.value = persistedUploads.map((upload) => ({
          ...upload,
          file: null,
          progress: upload.stagedPath ? 100 : Number(upload.progress) || 0,
          resumeAvailable: !upload.stagedPath,
        }));
        const missingUploadOps = persistedOperations.filter((operation) => (
          (operation.entity === 'file' && operation.action === 'add' && !persistedUploadIds.has(String(operation.clientId || operation.id)))
          || (operation.entity === 'material' && operation.action === 'update' && operation.data && Object.keys(operation.data).length === 0
            && operation.opId && !persistedUploadOps.has(String(operation.opId)))
        ));
        if (hasDroppedUploads || missingUploadOps.length) {
          operationNotice.value = { type: 'error', text: 'Pending file uploads were cleared when the browser closed. Please add them again.' };
        }
      } else {
        contentDraft.value = cloneContent(baseline);
        pendingContent.value = { quickTopics: null, operations: [] };
        contentUploads.value = [];
      }
      contentLoaded.value = true;
      contentHistory.value = [];
      contentFuture.value = [];
      if (!Array.isArray(local?.uploads)) contentUploads.value = [];
      pendingMediaUploads.value = [];
      recomputeDirty();
      // Refresh active session progress after a reload. The binary still has
      // to be selected again by the browser, but the server-owned session and
      // already received chunks remain available for a true resume.
      if (contentUploads.value.some((upload) => upload.uploadId && !upload.stagedPath)) {
        void Promise.all(contentUploads.value.map(async (upload) => {
          if (!upload.uploadId || upload.stagedPath) return;
          try {
            const { data: status } = await api.get(`/editor/uploads/${upload.uploadId}`);
            upload.progress = Math.round((Number(status.receivedBytes || 0) / Math.max(1, Number(status.size || upload.size || 1))) * 100);
            upload.receivedBytes = Number(status.receivedBytes || 0);
            upload.status = status.status;
          } catch {
            upload.resumeAvailable = false;
          }
        }).then(() => persistContentDraft()));
      }
      return true;
    } catch {
      // Keep an existing local draft intact when the server is unavailable.
      // Replacing it with defaults here used to make Publish appear successful
      // while silently deleting the browser draft.
      if (!contentLoaded.value) {
        const fallback = defaultContentSnapshot(settings.settings);
        publishedContent.value = cloneContent(fallback);
        if (!readLocalContentDraft()?.draft) contentDraft.value = cloneContent(fallback);
      }
      contentLoaded.value = false;
      operationNotice.value = { type: 'error', text: 'Content could not be loaded. Content publishing is disabled until it is loaded again.' };
      recomputeDirty();
      return false;
    } finally {
      contentLoading.value = false;
    }
  }

  function setQuickTopics(topics) {
    const next = normalizeQuickTopics(topics);
    if (JSON.stringify(next) === JSON.stringify(contentDraft.value.quickTopics)) return false;
    snapshotContent();
    contentDraft.value = { ...contentDraft.value, quickTopics: next };
    pendingContent.value = { ...pendingContent.value, quickTopics: next };
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function contentItem(entity, id) {
    if (entity === 'topic') {
      return contentDraft.value.quickTopics.find((item) => String(item.id) === String(id)) || null;
    }
    if (entity === 'file') return contentFile(null, id);
    const collection = entity === 'category' ? contentDraft.value.categories : contentDraft.value.materials;
    return collection.find((item) => String(item.id) === String(id)) || null;
  }

  function contentItemFromSnapshot(snapshot, entity, id) {
    const draft = snapshot?.draft;
    if (!draft) return null;
    if (entity === 'topic') {
      return (draft.quickTopics || []).find((item) => String(item.id) === String(id)) || null;
    }
    const collection = entity === 'category' ? draft.categories : draft.materials;
    return (collection || []).find((item) => String(item.id) === String(id)) || null;
  }

  function selectContentText(binding) {
    if (!contentTextBinding(binding?.entity, binding?.field) || !contentItem(binding.entity, binding.id)) return false;
    selectedContentText.value = {
      entity: binding.entity,
      id: binding.id,
      field: binding.field,
      instanceId: binding.instanceId || null,
    };
    selectedSetting.value = null;
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedDocumentItem.value = null;
    return true;
  }

  function beginInlineContentEdit(binding) {
    if (!selectContentText(binding)) return false;
    const sameBinding = activeInlineContentBinding
      && activeInlineContentBinding.entity === binding.entity
      && String(activeInlineContentBinding.id) === String(binding.id)
      && activeInlineContentBinding.field === binding.field
      && activeInlineContentBinding.instanceId === (binding.instanceId || null);
    if (activeInlineContentSnapshot && sameBinding) return true;
    if (activeInlineContentSnapshot) commitInlineContentEdit();
    activeInlineContentSnapshot = {
      draft: cloneContent(contentDraft.value),
      pending: cloneContent(pendingContent.value),
      uploads: contentUploads.value.map((upload) => ({ ...upload })),
    };
    activeInlineContentBinding = { ...selectedContentText.value };
    return true;
  }

  function setInlineContentText(binding, value) {
    const active = activeInlineContentBinding;
    if (!active || active.entity !== binding?.entity || String(active.id) !== String(binding?.id) || active.field !== binding?.field) return false;
    const item = contentItem(binding.entity, binding.id);
    const patch = contentTextPatch(item, binding.entity, binding.field, value);
    if (!item || !patch) return false;
    if (binding.entity === 'topic') {
      contentDraft.value = {
        ...contentDraft.value,
        quickTopics: contentDraft.value.quickTopics.map((topic) => (
          String(topic.id) === String(binding.id) ? { ...topic, ...patch } : topic
        )),
      };
      return true;
    }
    contentDraft.value = applyContentOperation(contentDraft.value, {
      entity: binding.entity,
      action: 'update',
      id: binding.id,
      data: patch,
    });
    return true;
  }

  function commitInlineContentEdit() {
    const before = activeInlineContentSnapshot;
    const binding = activeInlineContentBinding;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
    if (!before || !binding) return { committed: false, error: '' };
    const previous = contentItemFromSnapshot(before, binding.entity, binding.id);
    const current = contentItem(binding.entity, binding.id);
    if (!previous || !current) {
      restoreContentSnapshot(before);
      recomputeDirty();
      return { committed: false, error: 'This content item is no longer available.' };
    }
    const beforeValue = contentTextValue(previous, binding.entity, binding.field);
    const afterValue = contentTextValue(current, binding.entity, binding.field);
    if (beforeValue === afterValue) return { committed: false, error: '' };
    const definition = contentTextBinding(binding.entity, binding.field);
    if (definition?.required && !afterValue.trim()) {
      restoreContentSnapshot(before);
      recomputeDirty();
      const label = binding.entity === 'category'
        ? 'A category name'
        : binding.entity === 'topic'
          ? 'A topic label'
          : 'A material title';
      return { committed: false, error: `${label} cannot be empty.` };
    }
    const patch = contentTextPatch(previous, binding.entity, binding.field, afterValue);
    if (!patch) {
      restoreContentSnapshot(before);
      recomputeDirty();
      return { committed: false, error: 'This text cannot be edited here.' };
    }
    if (binding.entity === 'topic') {
      pendingContent.value = {
        ...pendingContent.value,
        quickTopics: cloneContent(contentDraft.value.quickTopics),
      };
    } else {
      const operation = {
        opId: uid('op'),
        entity: binding.entity,
        action: 'update',
        id: binding.id,
        data: patch,
      };
      pendingContent.value = {
        ...pendingContent.value,
        operations: [...pendingContent.value.operations, operation],
      };
    }
    contentHistory.value.push(before);
    if (contentHistory.value.length > MAX_HISTORY) contentHistory.value.shift();
    recordAction('content');
    recomputeDirty();
    persistContentDraft();
    return { committed: true, error: '' };
  }

  function cancelInlineContentEdit() {
    if (!activeInlineContentSnapshot) return false;
    const before = activeInlineContentSnapshot;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
    restoreContentSnapshot(before);
    recomputeDirty();
    return true;
  }

  function contentFile(materialId, fileId) {
    const materials = materialId === undefined || materialId === null
      ? contentDraft.value.materials
      : contentDraft.value.materials.filter((item) => String(item.id) === String(materialId));
    for (const material of materials) {
      const file = (material.files || []).find((candidate) => (
        String(candidate.id) === String(fileId) || String(candidate.clientId) === String(fileId)
      ));
      if (file) return { ...file, materialId: material.id };
    }
    return null;
  }

  function updateContentItem(entity, id, data) {
    const item = contentItem(entity, id);
    if (!item) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity, action: 'update', id, data: { ...data } };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
    recomputeDirty();
    persistContentDraft();
    return operation.opId;
  }

  function createContentItem(entity, data = {}) {
    const clientId = uid(entity === 'category' ? 'cat' : 'mat');
    const operation = { opId: uid('op'), entity, action: 'create', clientId, data: { ...data } };
    snapshotContent();
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
    recomputeDirty();
    persistContentDraft();
    return clientId;
  }

  function archiveContentItem(entity, id) {
    if (!contentItem(entity, id)) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity, action: 'archive', id };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function restoreContentItem(entity, id) {
    if (!contentItem(entity, id)) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity, action: 'restore', id };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function addPendingOperation(operation) {
    pendingContent.value = {
      ...pendingContent.value,
      operations: [...pendingContent.value.operations, operation],
    };
  }

  function updatePendingOperations(filter, transform = null) {
    const operations = pendingContent.value.operations
      .filter((operation) => !filter(operation))
      .map((operation) => (transform ? transform(operation) : operation));
    pendingContent.value = { ...pendingContent.value, operations };
  }

  function duplicateContentItem(entity, id) {
    const source = contentItem(entity, id);
    if (!source) return null;
    const copy = { ...cloneContent(source) };
    delete copy.id;
    copy.title = copy.title ? `${copy.title} copy` : undefined;
    copy.name = copy.name ? `${copy.name} copy` : undefined;
    // Existing file rows are copied by the publish endpoint using their
    // storage references. Temporary browser uploads are intentionally not
    // copied because their File blobs belong to the original draft row.
    if (entity === 'material') {
      if (copy.cover_image) copy.source_cover_image = copy.cover_image;
      copy.files = (copy.files || [])
        .filter((file) => file && !file.clientId)
        .map((file) => {
          const clientId = uid('filecopy');
          return {
            ...file,
            // The server resolves this temporary id to the newly cloned file,
            // so edits made before Publish apply to the duplicate, not the source.
            id: clientId,
            clientId,
            sourceFileId: file.id,
          };
        });
    }
    return createContentItem(entity, copy);
  }

  function moveContentItem(entity, id, direction) {
    const collection = entity === 'category' ? 'categories' : 'materials';
    const source = contentItem(entity, id);
    const siblingParent = entity === 'category' ? (source?.parent_id || null) : null;
    const items = [...contentDraft.value[collection]].filter((item) => (
      !item.is_archived && (entity !== 'category' || (item.parent_id || null) === siblingParent)
    ));
    const index = items.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return false;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return false;
    const [moved] = items.splice(index, 1);
    items.splice(targetIndex, 0, moved);
    const sortOrders = items.map((item, itemIndex) => ({ id: item.id, sort_order: itemIndex }));
    snapshotContent();
    const operation = { opId: uid('op'), entity, action: 'reorder', data: { items: sortOrders } };
    contentDraft.value = {
      ...contentDraft.value,
      [collection]: contentDraft.value[collection].map((item) => {
        const next = sortOrders.find((candidate) => String(candidate.id) === String(item.id));
        return next ? { ...item, sort_order: next.sort_order } : item;
      }),
    };
    pendingContent.value = { ...pendingContent.value, operations: [...pendingContent.value.operations, operation] };
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function queueContentUpload(entity, id, kind, file, options = {}) {
    if (!file || !entity || id === undefined || id === null) return false;
    snapshotContent();
    const isMaterialFile = kind === 'file';
    const previousUpload = contentUploads.value.find((item) => (
      item.entity === (isMaterialFile ? 'file' : entity)
      && String(isMaterialFile ? item.materialId : item.id) === String(id)
      && item.kind === kind
      && item.uploadId
      && !item.stagedPath
      && !item.file
      && String(item.fileName || item.name) === String(file.name || '')
      && Number(item.fileSize || item.size) === Number(file.size || 0)
    ));
    const uploadId = previousUpload?.uploadId || uid('upload');
    const clientId = options.clientId || previousUpload?.clientId || uid('file');
    const opId = options.opId || previousUpload?.opId || uid('op');
    const inferredType = options.fileType || (() => {
      const name = String(file.name || '').toLowerCase();
      if (name.endsWith('.pdf')) return 'pdf';
      if (name.endsWith('.docx')) return 'docx';
      if (name.endsWith('.ppt')) return 'ppt';
      if (name.endsWith('.pptx')) return 'pptx';
      return 'other';
    })();
    const upload = {
      uploadId,
      entity: isMaterialFile ? 'file' : entity,
      id: isMaterialFile ? clientId : id,
      materialId: isMaterialFile ? id : undefined,
      kind,
      file,
      fileName: file.name || 'Selected file',
      fileSize: Number(file.size) || 0,
      mimeType: file.type || '',
      label: options.label || '',
      primary: Boolean(options.primary),
      opId: isMaterialFile || kind === 'cover' ? opId : undefined,
      clientId: isMaterialFile ? clientId : undefined,
      receivedBytes: previousUpload?.receivedBytes || 0,
      resumeAvailable: Boolean(previousUpload),
    };
    if (kind === 'cover') {
      const previous = contentUploads.value.find((item) => item.entity === entity && String(item.id) === String(id) && item.kind === kind);
      if (previous?.opId) updatePendingOperations((operation) => String(operation.opId) === String(previous.opId));
    }
    const next = kind === 'cover'
      ? contentUploads.value.filter((item) => !(item.entity === entity && String(item.id) === String(id) && item.kind === kind))
      : previousUpload
        ? contentUploads.value.filter((item) => String(item.uploadId) !== String(previousUpload.uploadId))
        : [...contentUploads.value];
    next.push(upload);
    contentUploads.value = next;
    if (isMaterialFile) {
      const operation = {
        opId,
        entity: 'file',
        action: 'add',
        clientId,
        materialId: id,
        data: {
          material_id: id,
          original_name: file.name || 'Selected file',
          label: options.label || '',
          file_type: inferredType,
          mime_type: file.type || '',
          file_size: Number(file.size) || 0,
          sort_order: options.sortOrder ?? ((contentItem('material', id)?.files || []).length),
        },
      };
      contentDraft.value = applyContentOperation(contentDraft.value, operation);
      addPendingOperation(operation);
    } else if (kind === 'cover') {
      // Bind the cover upload to its own material update operation. Later
      // edits/reorders must not steal the manifest entry from this upload.
      const operation = {
        opId,
        entity: 'material',
        action: 'update',
        id,
        data: {},
      };
      addPendingOperation(operation);
    }
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function removeContentUpload(uploadId) {
    const upload = contentUploads.value.find((item) => String(item.uploadId) === String(uploadId));
    if (!upload) return false;
    snapshotContent();
    void cancelEditorUpload(upload);
    contentUploads.value = contentUploads.value.filter((item) => String(item.uploadId) !== String(uploadId));
    if (upload.kind === 'file') {
      const material = contentDraft.value.materials.find((item) => String(item.id) === String(upload.materialId));
      if (material) material.files = (material.files || []).filter((file) => (
        String(file.id) !== String(upload.id) && String(file.clientId) !== String(upload.clientId)
      ));
      const uploadClientId = upload.clientId || upload.id;
      updatePendingOperations((operation) => (
        String(operation.opId) === String(upload.opId)
        || String(operation.clientId) === String(uploadClientId)
        || String(operation.id) === String(uploadClientId)
        || String(operation.data?.id) === String(uploadClientId)
        || JSON.stringify(operation).includes(String(uploadClientId))
      ));
    } else if (upload.opId) {
      updatePendingOperations((operation) => String(operation.opId) === String(upload.opId));
    }
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function updateContentFile(materialId, fileId, data) {
    const file = contentFile(materialId, fileId);
    if (!file) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity: 'file', action: 'update', id: fileId, materialId, data: { ...data } };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    addPendingOperation(operation);
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function archiveContentFile(materialId, fileId) {
    const file = contentFile(materialId, fileId);
    if (!file) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity: 'file', action: 'archive', id: fileId, materialId };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    addPendingOperation(operation);
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function restoreContentFile(materialId, fileId) {
    const file = contentFile(materialId, fileId);
    if (!file) return false;
    snapshotContent();
    const operation = { opId: uid('op'), entity: 'file', action: 'restore', id: fileId, materialId };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    addPendingOperation(operation);
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  function moveContentFile(materialId, fileId, direction) {
    const material = contentDraft.value.materials.find((item) => String(item.id) === String(materialId));
    if (!material) return false;
    const files = (material.files || []).filter((file) => !file.is_archived).sort((a, b) => a.sort_order - b.sort_order);
    const index = files.findIndex((file) => String(file.id) === String(fileId) || String(file.clientId) === String(fileId));
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= files.length) return false;
    [files[index], files[targetIndex]] = [files[targetIndex], files[index]];
    snapshotContent();
    const items = files.map((file, sortOrder) => ({ id: file.id, sort_order: sortOrder }));
    const operation = { opId: uid('op'), entity: 'file', action: 'reorder', materialId, data: { material_id: materialId, items } };
    contentDraft.value = applyContentOperation(contentDraft.value, operation);
    addPendingOperation(operation);
    recomputeDirty();
    persistContentDraft();
    return true;
  }

  // Load a page for viewing or editing.
  function loadPage(pageSlug) {
    slug.value = pageSlug;
    const published = setPublishedBaseline(publishedLayout(pageSlug));
    loadSiteDocument();

    if (editMode.value) {
      const draft = readLocalDraft(pageSlug);
      if (draft) {
        layout.value = parseLayout(draft.layout) || published || emptyLayout();
        pendingSettings.value = cleanPendingSettings(draft.pendingSettings);
        useCanvas.value = !!draft.useCanvas;
        recomputeDirty();
      } else {
        layout.value = published || emptyLayout();
        pendingSettings.value = {};
        useCanvas.value = publishedBaseline.value.useCanvas;
        dirty.value = false;
      }
    } else {
      layout.value = published || emptyLayout();
      pendingSettings.value = {};
      useCanvas.value = publishedBaseline.value.useCanvas;
      dirty.value = false;
    }
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    history.value = [];
    future.value = [];
    settingHistory.value = [];
    settingFuture.value = [];
    actionHistory.value = [];
    actionFuture.value = [];
    contentHistory.value = [];
    contentFuture.value = [];
    documentHistory.value = [];
    documentFuture.value = [];
    activeHistorySnapshot = null;
    activeDocumentHistorySnapshot = null;
    activeInlineSettingSnapshot = null;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
  }

  // Change live preview pages without losing site-wide pending settings.
  function switchPage(pageSlug) {
    if (!pageSlug || pageSlug === slug.value) return;
    // Keep only site-wide settings when changing the preview page. A page
    // layout key belongs to the page where it was edited and must not leak
    // into another page's draft or Publish payload.
    const sharedPendingSettings = Object.fromEntries(
      Object.entries(pendingSettings.value).filter(([key]) => !key.startsWith('page_') && !key.endsWith('_layout_published'))
    );
    persistLocalDraft();
    persistSiteDocumentDraft();
    slug.value = pageSlug;
    const published = setPublishedBaseline(publishedLayout(pageSlug));
    const draft = readLocalDraft(pageSlug);
    layout.value = parseLayout(draft?.layout) || published || emptyLayout();
    useCanvas.value = draft ? !!draft.useCanvas : publishedBaseline.value.useCanvas;
    pendingSettings.value = cleanPendingSettings({
      ...(draft?.pendingSettings || {}),
      ...sharedPendingSettings,
    });
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    selectedDocumentItem.value = null;
    history.value = [];
    future.value = [];
    settingHistory.value = [];
    settingFuture.value = [];
    actionHistory.value = [];
    actionFuture.value = [];
    documentHistory.value = [];
    documentFuture.value = [];
    activeHistorySnapshot = null;
    activeDocumentHistorySnapshot = null;
    activeInlineSettingSnapshot = null;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
    recomputeDirty();
  }

  function enable() {
    if (!canEdit.value) return;
    editMode.value = true;
    loadPage(slug.value);
    // The Content panel is disabled until the async snapshot arrives.  Do
    // not let a fast click mutate the default draft while the request is in
    // flight and then have the response overwrite that edit.
    void loadContent();
  }

  async function disable() {
    await cleanupPendingMediaUploads();
    editMode.value = false;
    clearSelection();
    // Draft data is editor-only. Keep the published baseline for the next
    // session, but do not let an unpublished draft leak into public views in
    // this SPA session after the editor is closed.
    contentDraft.value = cloneContent(publishedContent.value);
    pendingContent.value = { quickTopics: null, operations: [] };
    contentUploads.value = [];
    pendingSettings.value = {};
    siteDocument.value = cloneSiteDocument(publishedSiteDocument.value);
    selectedDocumentItem.value = null;
    dirty.value = false;
  }

  // Enable the safe custom-content region embedded in the Home page.
  function startBlockLayout() {
    mutate(() => {
      useCanvas.value = true;
    });
  }

  // ---- SiteDocument v2 -------------------------------------------------
  // V2 content is stored independently from the legacy Home canvas. This
  // gives every page a safe visual extension zone without allowing an editor
  // action to move or remove a functional Vue component.
  function resolveDocumentPageId(pageId) {
    return SITE_DOCUMENT_PAGE_ZONES[pageId] ? pageId : pageIdForRouteSlug(slug.value);
  }

  function defaultDocumentZone(pageId) {
    const resolved = resolveDocumentPageId(pageId);
    return SITE_DOCUMENT_PAGE_ZONES[resolved]?.[0] || 'after-hero';
  }

  function documentSlotRef(document, pageId, zone) {
    const resolved = resolveDocumentPageId(pageId);
    if (!SITE_DOCUMENT_PAGE_ZONES[resolved]?.includes(zone)) return null;
    return document?.pages?.[resolved]?.slots?.[zone] || null;
  }

  function documentSlot(pageId, zone = defaultDocumentZone(pageId)) {
    return documentSlotRef(siteDocument.value, pageId, zone) || emptyLayout();
  }

  function findDocumentSection(document, pageId, zone, sectionId) {
    const slot = documentSlotRef(document, pageId, zone);
    if (!slot) return null;
    const index = slot.sections.findIndex((section) => section.id === sectionId);
    return index < 0 ? null : { slot, section: slot.sections[index], index };
  }

  function findDocumentBlock(document, pageId, zone, blockId) {
    const slot = documentSlotRef(document, pageId, zone);
    if (!slot) return null;
    for (const section of slot.sections) {
      for (const column of section.columns) {
        const index = column.blocks.findIndex((block) => block.id === blockId);
        if (index >= 0) return { slot, section, column, block: column.blocks[index], index };
      }
    }
    return null;
  }

  function persistSiteDocumentDraft() {
    if (!canEdit.value || !editMode.value) return false;
    try {
      localStorage.setItem(SITE_DOCUMENT_DRAFT_KEY, JSON.stringify({
        version: 2,
        savedAt: new Date().toISOString(),
        document: normalizeSiteDocument(siteDocument.value),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function loadSiteDocument(force = false) {
    if (!force && editMode.value && siteDocumentLoaded.value && siteDocumentDirty.value) return false;
    const stored = settings.settings?.[SITE_DOCUMENT_KEY];
    // No v2 record yet: retain the old Home canvas as a non-destructive
    // fallback and start all other zones empty. The pure parser accepts both
    // the serialized setting and an object, which keeps a malformed setting
    // from ever breaking the editor shell.
    const resolvedPublished = parseSiteDocument(stored)
      || normalizeSiteDocument(migrateLegacySiteDocument(settings.settings));
    publishedSiteDocument.value = cloneSiteDocument(resolvedPublished);
    const local = editMode.value ? readLocalSiteDocumentDraft() : null;
    siteDocument.value = local?.document
      ? normalizeSiteDocument(local.document)
      : cloneSiteDocument(resolvedPublished);
    siteDocumentLoaded.value = true;
    return true;
  }

  function mutateSiteDocument(mutator, { history = true } = {}) {
    const before = cloneSiteDocument(siteDocument.value);
    const next = cloneSiteDocument(siteDocument.value);
    mutator(next);
    const normalized = normalizeSiteDocument(next);
    if (JSON.stringify(before) === JSON.stringify(normalized)) return false;
    if (history) {
      documentHistory.value.push(before);
      if (documentHistory.value.length > MAX_HISTORY) documentHistory.value.shift();
      recordAction('document');
    }
    siteDocument.value = normalized;
    recomputeDirty();
    persistSiteDocumentDraft();
    void cleanupUnusedPendingMediaUploads();
    return true;
  }

  function beginDocumentHistory() {
    if (!activeDocumentHistorySnapshot) activeDocumentHistorySnapshot = cloneSiteDocument(siteDocument.value);
  }

  function commitDocumentHistory() {
    if (!activeDocumentHistorySnapshot) return false;
    const before = activeDocumentHistorySnapshot;
    activeDocumentHistorySnapshot = null;
    if (JSON.stringify(before) === JSON.stringify(siteDocument.value)) return false;
    documentHistory.value.push(before);
    if (documentHistory.value.length > MAX_HISTORY) documentHistory.value.shift();
    recordAction('document');
    return true;
  }

  function selectDocumentBlock(pageId, zone, blockId) {
    if (!findDocumentBlock(siteDocument.value, pageId, zone, blockId)) return false;
    selectedDocumentItem.value = { kind: 'block', pageId: resolveDocumentPageId(pageId), zone, id: blockId };
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    return true;
  }

  function selectDocumentSection(pageId, zone, sectionId) {
    if (!findDocumentSection(siteDocument.value, pageId, zone, sectionId)) return false;
    selectedDocumentItem.value = { kind: 'section', pageId: resolveDocumentPageId(pageId), zone, id: sectionId };
    selectedId.value = null;
    selectedSectionId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    return true;
  }

  function addDocumentSection(pageId, zone = defaultDocumentZone(pageId), atIndex = null) {
    const resolved = resolveDocumentPageId(pageId);
    let sectionId = null;
    const changed = mutateSiteDocument((document) => {
      const slot = documentSlotRef(document, resolved, zone);
      if (!slot) return;
      const section = createSiteDocumentSection();
      sectionId = section.id;
      if (atIndex === null || atIndex >= slot.sections.length) slot.sections.push(section);
      else slot.sections.splice(Math.max(0, atIndex), 0, section);
    });
    if (changed && sectionId) selectDocumentSection(resolved, zone, sectionId);
    return changed;
  }

  function addDocumentBlock(pageId, zone = defaultDocumentZone(pageId), type, options = {}) {
    const resolved = resolveDocumentPageId(pageId);
    const block = createSiteDocumentBlock(type);
    if (!block) return false;
    let targetSectionId = null;
    const changed = mutateSiteDocument((document) => {
      const slot = documentSlotRef(document, resolved, zone);
      if (!slot) return;
      if (!slot.sections.length) slot.sections.push(createSiteDocumentSection());
      const section = slot.sections.find((item) => item.id === options.sectionId) || slot.sections[slot.sections.length - 1];
      const column = section.columns.find((item) => item.id === options.columnId) || section.columns[0];
      targetSectionId = section.id;
      const index = Number.isInteger(options.index) ? options.index : null;
      if (index === null || index >= column.blocks.length) column.blocks.push(block);
      else column.blocks.splice(Math.max(0, index), 0, block);
    });
    if (changed) selectDocumentBlock(resolved, zone, block.id);
    return changed;
  }

  function updateDocumentBlock(pageId, zone, blockId, props) {
    return mutateSiteDocument((document) => {
      const found = findDocumentBlock(document, pageId, zone, blockId);
      if (found) found.block.props = { ...(found.block.props || {}), ...(props || {}) };
    }, { history: !activeDocumentHistorySnapshot });
  }

  function setDocumentBlockProps(pageId, zone, blockId, props) {
    return updateDocumentBlock(pageId, zone, blockId, props);
  }

  function setDocumentBlockHidden(pageId, zone, blockId, hidden = true) {
    return updateDocumentBlock(pageId, zone, blockId, { hidden: Boolean(hidden) });
  }

  function removeDocumentBlock(pageId, zone, blockId) {
    const changed = mutateSiteDocument((document) => {
      const found = findDocumentBlock(document, pageId, zone, blockId);
      if (found) found.column.blocks.splice(found.index, 1);
    });
    if (changed && selectedDocumentItem.value?.id === blockId) selectedDocumentItem.value = null;
    return changed;
  }

  function duplicateDocumentBlock(pageId, zone, blockId) {
    let nextId = null;
    const changed = mutateSiteDocument((document) => {
      const found = findDocumentBlock(document, pageId, zone, blockId);
      if (!found) return;
      const next = clone(found.block);
      next.id = uid('docb');
      nextId = next.id;
      found.column.blocks.splice(found.index + 1, 0, next);
    });
    if (changed && nextId) selectDocumentBlock(pageId, zone, nextId);
    return changed;
  }

  function moveDocumentBlockBy(pageId, zone, blockId, direction) {
    return mutateSiteDocument((document) => {
      const found = findDocumentBlock(document, pageId, zone, blockId);
      if (!found) return;
      const ordered = found.section.columns.flatMap((column) => column.blocks.map((block, index) => ({ block, column, index })));
      const currentIndex = ordered.findIndex((entry) => entry.block.id === blockId);
      const target = ordered[direction === 'up' ? currentIndex - 1 : currentIndex + 1];
      if (!target) return;
      const [moved] = found.column.blocks.splice(found.index, 1);
      const insertAt = target.column === found.column || direction === 'up' ? target.index : target.index + 1;
      target.column.blocks.splice(Math.min(Math.max(0, insertAt), target.column.blocks.length), 0, moved);
    });
  }

  function moveDocumentBlock(pageId, zone, blockId, targetColumnId, targetIndex = null) {
    return mutateSiteDocument((document) => {
      const found = findDocumentBlock(document, pageId, zone, blockId);
      const slot = documentSlotRef(document, pageId, zone);
      if (!found || !slot) return;
      const target = slot.sections
        .flatMap((section) => section.columns)
        .find((column) => column.id === targetColumnId);
      if (!target) return;
      const [moved] = found.column.blocks.splice(found.index, 1);
      let index = Number.isInteger(targetIndex) ? targetIndex : target.blocks.length;
      if (target === found.column && found.index < index) index -= 1;
      target.blocks.splice(Math.min(Math.max(0, index), target.blocks.length), 0, moved);
    });
  }

  function updateDocumentSectionProps(pageId, zone, sectionId, props) {
    return mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (found) found.section.props = { ...(found.section.props || {}), ...(props || {}) };
    });
  }

  function setDocumentSectionColumns(pageId, zone, sectionId, spans) {
    return mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (!found) return;
      const safeSpans = Array.isArray(spans) && spans.length ? spans.slice(0, 4) : [12];
      const existing = found.section.columns;
      const nextColumns = safeSpans.map((span, index) => existing[index] || makeColumn(span, []));
      nextColumns.forEach((column, index) => { column.span = Number(safeSpans[index]) || 12; });
      const overflow = existing.slice(nextColumns.length).flatMap((column) => column.blocks || []);
      nextColumns[nextColumns.length - 1].blocks.push(...overflow);
      found.section.columns = nextColumns;
    });
  }

  function moveDocumentSection(pageId, zone, sectionId, direction) {
    return mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (!found) return;
      const targetIndex = direction === 'up' ? found.index - 1 : found.index + 1;
      if (targetIndex < 0 || targetIndex >= found.slot.sections.length) return;
      const [section] = found.slot.sections.splice(found.index, 1);
      found.slot.sections.splice(targetIndex, 0, section);
    });
  }

  function moveDocumentSectionTo(pageId, zone, sectionId, targetIndex) {
    return mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (!found || !Number.isInteger(targetIndex)) return;
      const boundedTarget = Math.min(Math.max(0, targetIndex), found.slot.sections.length - 1);
      if (boundedTarget === found.index) return;
      const [section] = found.slot.sections.splice(found.index, 1);
      found.slot.sections.splice(Math.min(Math.max(0, boundedTarget), found.slot.sections.length), 0, section);
    });
  }

  function duplicateDocumentSection(pageId, zone, sectionId) {
    let nextId = null;
    const changed = mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (!found) return;
      const next = clone(found.section);
      next.id = uid('docs');
      nextId = next.id;
      next.columns.forEach((column) => {
        column.id = uid('docc');
        column.blocks.forEach((block) => { block.id = uid('docb'); });
      });
      found.slot.sections.splice(found.index + 1, 0, next);
    });
    if (changed && nextId) selectDocumentSection(pageId, zone, nextId);
    return changed;
  }

  function removeDocumentSection(pageId, zone, sectionId) {
    const changed = mutateSiteDocument((document) => {
      const found = findDocumentSection(document, pageId, zone, sectionId);
      if (found) found.slot.sections.splice(found.index, 1);
    });
    if (changed && selectedDocumentItem.value?.id === sectionId) selectedDocumentItem.value = null;
    return changed;
  }

  // ---- block tree operations ----
  function pushHistory(snapshotValue) {
    history.value.push(snapshotValue);
    if (history.value.length > MAX_HISTORY) history.value.shift();
    recordAction('layout');
  }

  function beginHistory() {
    if (!activeHistorySnapshot) activeHistorySnapshot = captureStructure();
  }

  function undo() {
    const kind = actionHistory.value.pop();
    if (kind === 'setting' && settingHistory.value.length) {
      settingFuture.value.push({ ...pendingSettings.value });
      if (settingFuture.value.length > MAX_HISTORY) settingFuture.value.shift();
      pendingSettings.value = settingHistory.value.pop();
      actionFuture.value.push('setting');
      if (actionFuture.value.length > MAX_HISTORY) actionFuture.value.shift();
      recomputeDirty();
      persistLocalDraft();
      return;
    }
    if (kind === 'content' && contentHistory.value.length) {
      contentFuture.value.push({ draft: cloneContent(contentDraft.value), pending: cloneContent(pendingContent.value), uploads: contentUploads.value.map((upload) => ({ ...upload })) });
      if (contentFuture.value.length > MAX_HISTORY) contentFuture.value.shift();
      const previous = contentHistory.value.pop();
      restoreContentSnapshot(previous);
      actionFuture.value.push('content');
      if (actionFuture.value.length > MAX_HISTORY) actionFuture.value.shift();
      recomputeDirty();
      persistContentDraft();
      return;
    }
    if (kind === 'document' && documentHistory.value.length) {
      documentFuture.value.push(cloneSiteDocument(siteDocument.value));
      if (documentFuture.value.length > MAX_HISTORY) documentFuture.value.shift();
      siteDocument.value = documentHistory.value.pop();
      selectedDocumentItem.value = null;
      actionFuture.value.push('document');
      if (actionFuture.value.length > MAX_HISTORY) actionFuture.value.shift();
      recomputeDirty();
      persistSiteDocumentDraft();
      return;
    }
    if (kind === 'layout' && history.value.length) {
      const selectedBefore = selectedId.value;
      future.value.push(captureStructure());
      if (future.value.length > MAX_HISTORY) future.value.shift();
      restoreStructure(history.value.pop());
      actionFuture.value.push('layout');
      if (actionFuture.value.length > MAX_HISTORY) actionFuture.value.shift();
      recomputeDirty();
      selectedId.value = findBlock(layout.value, selectedBefore) ? selectedBefore : null;
      activeHistorySnapshot = null;
      persistLocalDraft();
      return;
    }
  }

  function redo() {
    const kind = actionFuture.value.pop();
    if (kind === 'setting' && settingFuture.value.length) {
      settingHistory.value.push({ ...pendingSettings.value });
      if (settingHistory.value.length > MAX_HISTORY) settingHistory.value.shift();
      pendingSettings.value = settingFuture.value.pop();
      actionHistory.value.push('setting');
      if (actionHistory.value.length > MAX_HISTORY) actionHistory.value.shift();
      recomputeDirty();
      persistLocalDraft();
      return;
    }
    if (kind === 'content' && contentFuture.value.length) {
      contentHistory.value.push({ draft: cloneContent(contentDraft.value), pending: cloneContent(pendingContent.value), uploads: contentUploads.value.map((upload) => ({ ...upload })) });
      if (contentHistory.value.length > MAX_HISTORY) contentHistory.value.shift();
      const next = contentFuture.value.pop();
      restoreContentSnapshot(next);
      actionHistory.value.push('content');
      if (actionHistory.value.length > MAX_HISTORY) actionHistory.value.shift();
      recomputeDirty();
      persistContentDraft();
      return;
    }
    if (kind === 'document' && documentFuture.value.length) {
      documentHistory.value.push(cloneSiteDocument(siteDocument.value));
      if (documentHistory.value.length > MAX_HISTORY) documentHistory.value.shift();
      siteDocument.value = documentFuture.value.pop();
      selectedDocumentItem.value = null;
      actionHistory.value.push('document');
      if (actionHistory.value.length > MAX_HISTORY) actionHistory.value.shift();
      recomputeDirty();
      persistSiteDocumentDraft();
      return;
    }
    if (kind === 'layout' && future.value.length) {
      const selectedBefore = selectedId.value;
      history.value.push(captureStructure());
      if (history.value.length > MAX_HISTORY) history.value.shift();
      restoreStructure(future.value.pop());
      actionHistory.value.push('layout');
      if (actionHistory.value.length > MAX_HISTORY) actionHistory.value.shift();
      recomputeDirty();
      selectedId.value = findBlock(layout.value, selectedBefore) ? selectedBefore : null;
      activeHistorySnapshot = null;
      persistLocalDraft();
      return;
    }
  }

  function mutate(fn) {
    const before = captureStructure();
    try {
      fn();
    } catch (error) {
      restoreStructure(before);
      throw error;
    }
    if (structuresEqual(before, captureStructure())) return false;
    pushHistory(before);
    activeHistorySnapshot = null;
    recomputeDirty();
    persistLocalDraft();
    return true;
  }

  function select(id) {
    selectedId.value = id;
    selectedSectionId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    selectedDocumentItem.value = null;
  }

  function selectSection(sectionId) {
    if (!layout.value.sections.some((section) => section.id === sectionId)) return;
    selectedSectionId.value = sectionId;
    selectedId.value = null;
    selectedSetting.value = null;
    selectedContentText.value = null;
    selectedDocumentItem.value = null;
  }

  function addSection() {
    mutate(() => {
      useCanvas.value = true;
      layout.value.sections.push(makeSection());
    });
    selectedSectionId.value = layout.value.sections[layout.value.sections.length - 1]?.id || null;
    selectedId.value = null;
  }

  function removeSection(sectionId) {
    mutate(() => {
      layout.value.sections = layout.value.sections.filter((s) => s.id !== sectionId);
      if (selectedSectionId.value === sectionId) selectedSectionId.value = null;
    });
  }

  function moveSection(sectionId, direction) {
    mutate(() => {
      const idx = layout.value.sections.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= layout.value.sections.length) return;
      const [moved] = layout.value.sections.splice(idx, 1);
      layout.value.sections.splice(targetIdx, 0, moved);
    });
  }

  function duplicateSection(sectionId) {
    let duplicatedId = null;
    mutate(() => {
      const idx = layout.value.sections.findIndex((s) => s.id === sectionId);
      if (idx === -1) return;
      const cloneSec = clone(layout.value.sections[idx]);
      cloneSec.id = uid('s');
      duplicatedId = cloneSec.id;
      cloneSec.columns.forEach((c) => {
        c.id = uid('c');
        c.blocks.forEach((b) => {
          b.id = uid('b');
        });
      });
      layout.value.sections.splice(idx + 1, 0, cloneSec);
    });
    if (duplicatedId) {
      selectedSectionId.value = duplicatedId;
      selectedId.value = null;
    }
  }

  function addSectionPreset(presetType) {
    mutate(() => {
      useCanvas.value = true;
      if (presetType === 'hero') {
        layout.value.sections.push(
          makeSection([
            makeColumn(12, [
              createBlock('heading', { text: 'Welcome to Our Platform', level: 1, align: 'center' }),
              createBlock('paragraph', { text: 'Explore the best digital and printable educational materials.', align: 'center' }),
              createBlock('button', { text: 'Explore Resources', link: '/library', align: 'center', variant: 'primary' }),
            ]),
          ], { paddingY: 80, bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' })
        );
      } else if (presetType === 'features') {
        layout.value.sections.push(
          makeSection([
            makeColumn(12, [
              createBlock('features'),
            ]),
          ], { paddingY: 64, bg: '#f8fafc' })
        );
      } else if (presetType === 'cta') {
        layout.value.sections.push(
          makeSection([
            makeColumn(12, [
              createBlock('cta'),
            ]),
          ], { paddingY: 48 })
        );
      } else if (presetType === 'video') {
        layout.value.sections.push(
          makeSection([
            makeColumn(12, [
              createBlock('heading', { text: 'Learn About the Project in Video', level: 2, align: 'center' }),
              createBlock('spacer', { height: 16 }),
              createBlock('video'),
            ]),
          ], { paddingY: 64 })
        );
      } else if (presetType === 'image-text' || presetType === 'text-image') {
        const imageColumn = makeColumn(6, [
          createBlock('image'),
        ]);
        const textColumn = makeColumn(6, [
          createBlock('heading', { text: 'Tell your story', level: 2 }),
          createBlock('paragraph', { text: 'Add text that explains this image or introduces the next part of the page.' }),
          createBlock('button', { text: 'Learn more', link: '/library' }),
        ]);
        layout.value.sections.push(
          makeSection(presetType === 'image-text' ? [imageColumn, textColumn] : [textColumn, imageColumn])
        );
      } else {
        layout.value.sections.push(makeSection());
      }
    });
    selectedSectionId.value = layout.value.sections[layout.value.sections.length - 1]?.id || null;
    selectedId.value = null;
  }

  function setSectionColumns(sectionId, spans) {
    mutate(() => {
      const section = layout.value.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const existing = section.columns;
      const safeSpans = Array.isArray(spans) && spans.length ? spans : [12];
      const nextColumns = safeSpans.map((span, i) => existing[i] || makeColumn(span, []));
      nextColumns.forEach((column, i) => (column.span = safeSpans[i]));
      const overflowBlocks = existing.slice(nextColumns.length).flatMap((column) => column.blocks || []);
      const targetColumn = nextColumns[nextColumns.length - 1];
      targetColumn.blocks.push(...overflowBlocks);
      section.columns = nextColumns;
    });
  }

  function updateSectionProps(sectionId, props) {
    mutate(() => {
      const section = layout.value.sections.find((s) => s.id === sectionId);
      if (section) section.props = { ...section.props, ...props };
    });
  }

  function addBlock(columnId, type, atIndex = null) {
    mutate(() => {
      const column = findColumn(columnId);
      if (!column) return;
      useCanvas.value = true;
      const block = createBlock(type);
      if (atIndex === null || atIndex >= column.blocks.length) column.blocks.push(block);
      else column.blocks.splice(atIndex, 0, block);
      selectedId.value = block.id;
      selectedSetting.value = null;
    });
  }

  // Click-to-add (reliable alternative to drag): append a block to the custom
  // content region, creating a section/column if the region is empty.
  function quickAddBlock(type) {
    mutate(() => {
      useCanvas.value = true;
      if (!layout.value.sections.length) {
        layout.value.sections.push(makeSection([makeColumn(12, [])]));
      }
      const lastSection = layout.value.sections[layout.value.sections.length - 1];
      const column = lastSection.columns[0];
      const block = createBlock(type);
      column.blocks.push(block);
      selectedId.value = block.id;
      selectedSetting.value = null;
    });
  }

  // Inline text edits fire often; coalesce without spamming history.
  function updateBlock(blockId, props) {
    const found = findBlock(layout.value, blockId);
    if (!found) return;
    found.block.props = { ...found.block.props, ...props };
    recomputeDirty();
    persistLocalDraft();
    void cleanupUnusedPendingMediaUploads();
  }

  function setBlockProps(blockId, props) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (found) found.block.props = { ...(found.block.props || {}), ...props };
    });
    void cleanupUnusedPendingMediaUploads();
  }

  function setBlockHidden(blockId, hidden = true) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (found) found.block.props = { ...(found.block.props || {}), hidden: Boolean(hidden) };
    });
  }

  function updateBlockLayout(blockId, props) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (!found) return;
      found.block.layout = normalizeBlockPlacement({ ...(found.block.layout || {}), ...props });
      selectedId.value = blockId;
    });
  }

  // Apply the visual choices shown in the simple inspector as one undoable
  // change. Keeping the content alignment and grid placement together stops
  // a "center" action from producing two confusing Undo steps.
  function setBlockPresentation(blockId, { props = {}, layout: nextLayout = {} } = {}) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (!found) return;
      if (props && Object.keys(props).length) {
        found.block.props = { ...(found.block.props || {}), ...props };
      }
      if (nextLayout && Object.keys(nextLayout).length) {
        found.block.layout = normalizeBlockPlacement({ ...(found.block.layout || {}), ...nextLayout });
      }
      selectedId.value = blockId;
    });
    void cleanupUnusedPendingMediaUploads();
  }

  function commitHistory() {
    if (!activeHistorySnapshot) return false;
    const before = activeHistorySnapshot;
    activeHistorySnapshot = null;
    if (structuresEqual(before, captureStructure())) {
      recomputeDirty();
      return false;
    }
    pushHistory(before);
    return true;
  }

  function removeBlock(blockId) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (found) found.column.blocks.splice(found.index, 1);
      if (selectedId.value === blockId) selectedId.value = null;
    });
  }

  function moveBlock(blockId, targetColumnId, targetIndex) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      const target = findColumn(targetColumnId);
      if (!found || !target) return;
      const [moved] = found.column.blocks.splice(found.index, 1);
      let idx = targetIndex;
      if (found.column === target && found.index < targetIndex) idx -= 1;
      if (idx === null || idx > target.blocks.length) idx = target.blocks.length;
      target.blocks.splice(Math.max(0, idx), 0, moved);
    });
  }

  function moveBlockBy(blockId, direction) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (!found) return;

      // Treat columns as one page-order sequence for the arrow controls. A
      // block at the edge of a column can therefore still move up/down into
      // the adjacent column instead of making the button appear broken.
      const ordered = found.section.columns.flatMap((column) => (
        column.blocks.map((block, index) => ({ block, column, index }))
      ));
      const currentIndex = ordered.findIndex((item) => item.block.id === blockId);
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const target = ordered[targetIndex];
      if (currentIndex < 0 || !target) return;

      const [moved] = found.column.blocks.splice(found.index, 1);
      if (target.column === found.column) {
        const nextIndex = direction === 'up' ? target.index : target.index;
        found.column.blocks.splice(nextIndex, 0, moved);
      } else {
        const insertIndex = direction === 'up' ? target.index : target.index + 1;
        target.column.blocks.splice(Math.min(insertIndex, target.column.blocks.length), 0, moved);
      }
      selectedId.value = blockId;
    });
  }

  function findColumn(columnId) {
    for (const section of layout.value.sections) {
      const col = section.columns.find((c) => c.id === columnId);
      if (col) return col;
    }
    return null;
  }

  // ---- persistence ----
  function currentDraft() {
    return {
      version: 3,
      savedAt: new Date().toISOString(),
      layout: normalizeLayout(layout.value),
      pendingSettings: { ...pendingSettings.value },
      useCanvas: useCanvas.value,
    };
  }

  function persistLocalDraft() {
    if (!canEdit.value || !editMode.value) return false;
    try {
      localStorage.setItem(draftStorageKey(slug.value), JSON.stringify(currentDraft()));
      return true;
    } catch {
      return false;
    }
  }

  function saveDraft() {
    if (!canEdit.value) return;
    if (persistLocalDraft()) {
      operationNotice.value = { type: 'success', text: 'Draft saved in this browser.' };
    } else {
      operationNotice.value = {
        type: 'error',
        text: 'The browser could not save this draft. You can still publish the changes.',
      };
      /* storage full / unavailable — keep dirty so user can still publish */
    }
  }

  function editorApiUrl(pathname) {
    const base = api.defaults?.baseURL || '/api';
    try { return new URL(`${base}${pathname}`, window.location.origin).toString(); } catch { return `${base}${pathname}`; }
  }

  async function stageEditorUpload(upload) {
    const file = upload?.file;
    if (!file) throw new Error('The selected file is no longer available. Please choose it again.');
    const kind = upload.kind === 'cover' ? 'cover' : 'file';
    const max = kind === 'cover' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max) throw new Error(`${file.name || 'File'} is larger than the ${kind === 'cover' ? '10 MB' : '50 MB'} limit.`);
    let started = null;
    try {
      if (upload.uploadId && upload.resumeAvailable) {
        try {
          const { data: existing } = await api.get(`/editor/uploads/${upload.uploadId}`);
          if (Number(existing.size) === Number(file.size)
            && String(existing.name) === String(file.name)
            && existing.status !== 'complete') {
            started = {
              ...existing,
              uploadId: upload.uploadId,
              chunkSize: Number(existing.chunkSize) || 8 * 1024 * 1024,
            };
            upload.receivedBytes = Number(existing.receivedBytes) || 0;
          }
        } catch { /* start a fresh session when the old one expired */ }
      }
      if (!started) {
        ({ data: started } = await api.post('/editor/uploads/start', {
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          kind,
        }));
        upload.receivedBytes = 0;
      }
      const chunkSize = Number(started.chunkSize) || 8 * 1024 * 1024;
      const token = localStorage.getItem('token');
      const uploadChunk = async (url, chunk, headers = {}, includeAuth = true) => {
        const authHeader = includeAuth && token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(url, {
          method: 'PUT',
          headers: { ...authHeader, ...headers },
          body: chunk,
        });
        if (![200, 201, 202, 308].includes(response.status)) {
          let message = 'Upload failed.';
          try { message = (await response.json()).error || message; } catch { /* non-JSON response */ }
          throw new Error(message);
        }
      };
      const receivedBytes = Math.min(file.size, Number(upload.receivedBytes) || 0);
      for (let start = receivedBytes, index = Math.floor(receivedBytes / chunkSize); start < file.size; start += chunkSize, index += 1) {
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        if (started.sessionUrl) {
          await uploadChunk(started.sessionUrl, chunk, {
            'Content-Type': file.type || 'application/octet-stream',
            'Content-Length': String(end - start),
            'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
          }, false);
        } else {
          await uploadChunk(editorApiUrl(`/editor/uploads/${started.uploadId}/chunk`), chunk, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(end - start),
            'Content-Range': `bytes ${start}-${end - 1}/${file.size}`,
            'X-Chunk-Index': String(index),
          });
        }
        upload.progress = Math.round((end / file.size) * 100);
        upload.receivedBytes = end;
        upload.resumeAvailable = true;
        persistContentDraft();
      }
      const { data: completed } = await api.post(`/editor/uploads/${started.uploadId}/complete`, {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind,
      });
      upload.progress = 100;
      return completed;
    } catch (error) {
      if (started?.uploadId) {
        try { await api.delete(`/editor/uploads/${started.uploadId}`); } catch { /* best effort cleanup */ }
      }
      throw error;
    }
  }

  async function cancelEditorUpload(upload) {
    if (!upload?.uploadId) return;
    try { await api.delete(`/editor/uploads/${upload.uploadId}`); } catch { /* best effort cleanup */ }
  }

  // Publish live settings and the embedded custom-content layout together.
  async function publish() {
    if (!canEdit.value) return;
    if (contentLoading.value) {
      operationNotice.value = { type: 'error', text: 'Content is still loading. Please wait a moment and try again.' };
      return false;
    }
    if (contentDirty.value && !contentLoaded.value) {
      operationNotice.value = { type: 'error', text: 'Content could not be loaded. Reload Content before publishing.' };
      return false;
    }
    saving.value = true;
    operationNotice.value = null;
    try {
      const payload = { ...pendingSettings.value };
      const hasSiteDocumentChanges = siteDocumentDirty.value;
      if (hasSiteDocumentChanges) {
        const safeDocument = normalizeSiteDocument(siteDocument.value);
        payload[SITE_DOCUMENT_KEY] = JSON.stringify(safeDocument);
        siteDocument.value = safeDocument;
      }
      if (useCanvas.value) {
        const safeLayout = normalizeLayout(layout.value);
        payload[publishedKey(slug.value)] = JSON.stringify(safeLayout);
        layout.value = safeLayout;
      }
      const hasContentChanges = contentLoaded.value && contentDirty.value;
      const operations = [...pendingContent.value.operations];
      const manifest = [];
      const files = [];
      for (const upload of contentUploads.value) {
        if (!upload.stagedPath) {
          const completed = await stageEditorUpload(upload);
          Object.assign(upload, completed);
          persistContentDraft();
        }
        let operation = upload.opId
          ? operations.find((candidate) => String(candidate.opId) === String(upload.opId))
          : null;
        if (!operation) operation = [...operations].reverse().find((candidate) => (
          candidate.entity === upload.entity
          && (String(candidate.id) === String(upload.id) || String(candidate.clientId) === String(upload.id))
        ));
        if (!operation) {
          operation = { opId: uid('op'), entity: upload.entity, action: 'update', id: upload.id, data: {} };
          operations.push(operation);
        }
        const index = manifest.length;
        // Staged uploads are already in Storage; the Publish request carries
        // only a validated reference, so it remains well below the Function
        // request-size limit even for a 50 MB PDF.
        manifest.push({
          opId: operation.opId,
          kind: upload.kind,
          materialId: upload.materialId || (upload.kind === 'file' ? upload.id : undefined),
          index,
          label: upload.label,
          primary: upload.primary,
          uploadId: upload.uploadId,
          stagedPath: upload.stagedPath,
          originalName: upload.name || upload.fileName,
          mimeType: upload.mimeType || upload.file?.type || '',
          size: upload.size || upload.fileSize || upload.file?.size || 0,
        });
      }
      const contentPayload = hasContentChanges ? {
        quickTopics: contentDraft.value.quickTopics,
        operations,
        baseRevision: contentRevision.value,
      } : null;
      if (Object.keys(payload).length || hasContentChanges) {
        const form = new FormData();
        form.append('settings', JSON.stringify(payload));
        if (contentPayload) form.append('content', JSON.stringify(contentPayload));
        if (contentRevision.value !== null && contentRevision.value !== undefined) {
          form.append('base_revision', String(contentRevision.value));
        }
        form.append('file_manifest', JSON.stringify(manifest));
        // Legacy multipart files remain supported for older drafts, but new
        // uploads use the staged manifest above and append no binary payload.
        files.forEach((file) => form.append('files', file));
        const { data } = await api.post('/editor/publish', form);
        if (data?.revision !== undefined) contentRevision.value = data.revision;
        settings.settings = {
          ...settings.settings,
          ...(data?.publishedSettings || payload),
          ...(contentPayload ? { home_quick_topics: JSON.stringify(contentDraft.value.quickTopics) } : {}),
        };
        if (data?.categories || data?.materials) {
          const published = normalizeContentSnapshot(data, settings.settings);
          publishedContent.value = cloneContent(published);
          contentDraft.value = cloneContent(published);
        }
        // Publish resolves provisional category/material/file IDs on the
        // server. Keep the open Content form and any queued operations in
        // sync with those real IDs instead of leaving a stale client ID.
        if (data?.idMap && Object.keys(data.idMap).length) {
          const idMap = new Map(Object.entries(data.idMap).map(([from, to]) => [String(from), to]));
          const resolveMapped = (value) => idMap.get(String(value)) ?? value;
          const mapFile = (file) => ({
            ...file,
            id: resolveMapped(file.id),
            clientId: file.clientId ? resolveMapped(file.clientId) : file.clientId,
            resource_id: file.resource_id ? resolveMapped(file.resource_id) : file.resource_id,
          });
          const mapItem = (item) => ({
            ...item,
            id: resolveMapped(item.id),
            parent_id: item.parent_id ? resolveMapped(item.parent_id) : item.parent_id,
            category_id: item.category_id ? resolveMapped(item.category_id) : item.category_id,
            files: Array.isArray(item.files) ? item.files.map(mapFile) : item.files,
          });
          contentDraft.value = {
            ...contentDraft.value,
            categories: contentDraft.value.categories.map(mapItem),
            materials: contentDraft.value.materials.map(mapItem),
          };
          publishedContent.value = {
            ...publishedContent.value,
            categories: publishedContent.value.categories.map(mapItem),
            materials: publishedContent.value.materials.map(mapItem),
          };
          pendingContent.value = {
            ...pendingContent.value,
            operations: pendingContent.value.operations.map((operation) => ({
              ...operation,
              id: resolveMapped(operation.id),
              clientId: operation.clientId ? resolveMapped(operation.clientId) : operation.clientId,
              materialId: operation.materialId ? resolveMapped(operation.materialId) : operation.materialId,
              data: operation.data ? {
                ...operation.data,
                id: resolveMapped(operation.data.id),
                material_id: operation.data.material_id ? resolveMapped(operation.data.material_id) : operation.data.material_id,
                resource_id: operation.data.resource_id ? resolveMapped(operation.data.resource_id) : operation.data.resource_id,
                category_id: operation.data.category_id ? resolveMapped(operation.data.category_id) : operation.data.category_id,
                items: Array.isArray(operation.data.items)
                  ? operation.data.items.map((item) => ({ ...item, id: resolveMapped(item.id) }))
                  : operation.data.items,
              } : operation.data,
            })),
          };
          contentUploads.value = contentUploads.value.map((upload) => ({
            ...upload,
            id: resolveMapped(upload.id),
            materialId: upload.materialId ? resolveMapped(upload.materialId) : upload.materialId,
            clientId: upload.clientId ? resolveMapped(upload.clientId) : upload.clientId,
          }));
        }
      }
      const committedMedia = currentMediaReferences();
      setPublishedBaseline(publishedLayout(slug.value));
      publishedSiteDocument.value = cloneSiteDocument(siteDocument.value);
      pendingSettings.value = {};
      pendingContent.value = { quickTopics: null, operations: [] };
      contentUploads.value = [];
      await cleanupPendingMediaUploads(committedMedia);
      pendingMediaUploads.value = pendingMediaUploads.value.filter((url) => committedMedia.has(url));
      dirty.value = false;
      settingHistory.value = [];
      settingFuture.value = [];
      history.value = [];
      future.value = [];
      actionHistory.value = [];
      actionFuture.value = [];
      contentHistory.value = [];
      contentFuture.value = [];
      documentHistory.value = [];
      documentFuture.value = [];
      activeHistorySnapshot = null;
      activeDocumentHistorySnapshot = null;
      activeInlineSettingSnapshot = null;
      activeInlineContentSnapshot = null;
      activeInlineContentBinding = null;
      localStorage.removeItem(draftStorageKey(slug.value));
      localStorage.removeItem(CONTENT_DRAFT_KEY);
      localStorage.removeItem(SITE_DOCUMENT_DRAFT_KEY);
      operationNotice.value = { type: 'success', text: 'Changes published successfully.' };
      return true;
    } catch (error) {
      // Keep completed staging sessions after a validation/conflict failure.
      // The administrator can fix the form and retry without selecting every
      // PDF again; Discard explicitly cancels these sessions.
      operationNotice.value = {
        type: 'error',
        text: error?.response?.data?.error || 'Could not publish changes. Your local edits were kept.',
      };
      return false;
    } finally {
      saving.value = false;
    }
  }

  // Remove the published block layout for this page → page returns to its
  // default (functional/hand-coded) content. Escape hatch from canvas mode.
  async function revertPublishedLayout() {
    if (!canEdit.value) return false;
    saving.value = true;
    operationNotice.value = null;
    try {
      const payload = { [publishedKey(slug.value)]: '' };
      await api.put('/settings', { settings: payload });
      settings.settings = { ...settings.settings, [publishedKey(slug.value)]: '' };
      setPublishedBaseline(emptyLayout());
      layout.value = emptyLayout();
      useCanvas.value = false;
      history.value = [];
      future.value = [];
      settingHistory.value = [];
      settingFuture.value = [];
      actionHistory.value = [];
      actionFuture.value = [];
      activeHistorySnapshot = null;
      selectedId.value = null;
      recomputeDirty();
      if (dirty.value) persistLocalDraft();
      else localStorage.removeItem(draftStorageKey(slug.value));
      operationNotice.value = { type: 'success', text: 'Custom layout removed.' };
      return true;
    } catch (error) {
      operationNotice.value = {
        type: 'error',
        text: error?.response?.data?.error || 'Could not remove the custom layout. Your draft was kept.',
      };
      return false;
    } finally {
      saving.value = false;
    }
  }

  // Discard buffered edits and reload the published version.
  async function discard() {
    // Discard is explicitly a reload of the latest published state. This
    // avoids restoring a stale snapshot captured by another editor session.
    try {
      if (canEdit.value) {
        const [contentResponse, settingsResponse] = await Promise.all([
          api.get('/editor/content'),
          api.get('/settings'),
        ]);
        const data = contentResponse.data;
        settings.settings = settingsResponse.data?.settings || settings.settings;
        contentRevision.value = data?.revision ?? contentRevision.value;
        const latest = normalizeContentSnapshot(data, settings.settings);
        publishedContent.value = cloneContent(latest);
        contentDraft.value = cloneContent(latest);
        loadSiteDocument(true);
      } else {
        contentDraft.value = cloneContent(publishedContent.value);
      }
    } catch {
      contentDraft.value = cloneContent(publishedContent.value);
      operationNotice.value = { type: 'error', text: 'The latest published content could not be loaded. Your draft was kept.' };
      return false;
    }
    localStorage.removeItem(draftStorageKey(slug.value));
    localStorage.removeItem(CONTENT_DRAFT_KEY);
    localStorage.removeItem(SITE_DOCUMENT_DRAFT_KEY);
    pendingSettings.value = {};
    contentDraft.value = cloneContent(publishedContent.value);
    pendingContent.value = { quickTopics: null, operations: [] };
    await Promise.all(contentUploads.value.map((upload) => cancelEditorUpload(upload)));
    contentUploads.value = [];
    await cleanupPendingMediaUploads(new Set());
    layout.value = setPublishedBaseline(publishedLayout(slug.value));
    useCanvas.value = !!(layout.value.sections.length);
    siteDocument.value = cloneSiteDocument(publishedSiteDocument.value);
    history.value = [];
    future.value = [];
    settingHistory.value = [];
    settingFuture.value = [];
    actionHistory.value = [];
    actionFuture.value = [];
    contentHistory.value = [];
    contentFuture.value = [];
    activeHistorySnapshot = null;
    documentHistory.value = [];
    documentFuture.value = [];
    activeDocumentHistorySnapshot = null;
    activeInlineSettingSnapshot = null;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
    clearSelection();
    dirty.value = false;
    operationNotice.value = { type: 'success', text: 'Draft discarded. Showing the latest published content.' };
    return true;
  }

  // Clear all local browser draft buffers and return page to original state.
  function resetToDefaults() {
    clearLocalDraftStorage();
    pendingSettings.value = {};
    editMode.value = false;
    contentDraft.value = defaultContentSnapshot(settings.settings);
    publishedContent.value = cloneContent(contentDraft.value);
    pendingContent.value = { quickTopics: null, operations: [] };
    contentUploads.value = [];
    void cleanupPendingMediaUploads(new Set());
    layout.value = emptyLayout();
    siteDocument.value = emptySiteDocument();
    publishedSiteDocument.value = emptySiteDocument();
    siteDocumentLoaded.value = false;
    useCanvas.value = false;
    history.value = [];
    future.value = [];
    settingHistory.value = [];
    settingFuture.value = [];
    actionHistory.value = [];
    actionFuture.value = [];
    contentHistory.value = [];
    contentFuture.value = [];
    documentHistory.value = [];
    documentFuture.value = [];
    activeHistorySnapshot = null;
    activeDocumentHistorySnapshot = null;
    activeInlineSettingSnapshot = null;
    activeInlineContentSnapshot = null;
    activeInlineContentBinding = null;
    clearSelection();
    dirty.value = false;
  }

  function duplicateBlock(blockId) {
    mutate(() => {
      const found = findBlock(layout.value, blockId);
      if (!found) return;
      const cloneBlock = clone(found.block);
      cloneBlock.id = uid('b');
      found.column.blocks.splice(found.index + 1, 0, cloneBlock);
      selectedId.value = cloneBlock.id;
    });
  }

  return {
    editMode,
    useCanvas,
    slug,
    layout,
    siteDocument,
    publishedSiteDocument,
    siteDocumentLoaded,
    siteDocumentDirty,
    pendingSettings,
    contentDraft,
    publishedContent,
    pendingContent,
    contentUploads,
    trackPendingMediaUpload,
    contentLoaded,
    contentLoading,
    contentRevision,
    contentDirty,
    selectedId,
    selectedSectionId,
    selectedSetting,
    selectedContentText,
    selectedDocumentItem,
    selectedBlock,
    selectedSection,
    selectedDocumentBlock,
    selectedDocumentSection,
    dirty,
    saving,
    operationNotice,
    canEdit,
    canUndo,
    canRedo,
    history,
    future,
    draggedPayload,
    loadPage,
    switchPage,
    loadContent,
    loadSiteDocument,
    publishedLayout,
    documentSlot,
    defaultDocumentZone,
    resolveDocumentPageId,
    settingValue,
    setSetting,
    resetSetting,
    beginInlineSettingEdit,
    commitInlineSettingEdit,
    setQuickTopics,
    contentItem,
    selectContentText,
    beginInlineContentEdit,
    setInlineContentText,
    commitInlineContentEdit,
    cancelInlineContentEdit,
    contentFile,
    updateContentItem,
    createContentItem,
    archiveContentItem,
    restoreContentItem,
    duplicateContentItem,
    moveContentItem,
    queueContentUpload,
    removeContentUpload,
    updateContentFile,
    archiveContentFile,
    restoreContentFile,
    moveContentFile,
    selectSetting,
    clearSelection,
    selectDocumentBlock,
    selectDocumentSection,
    enable,
    disable,
    startBlockLayout,
    beginDocumentHistory,
    commitDocumentHistory,
    addDocumentSection,
    addDocumentBlock,
    updateDocumentBlock,
    setDocumentBlockProps,
    setDocumentBlockHidden,
    removeDocumentBlock,
    duplicateDocumentBlock,
    moveDocumentBlockBy,
    moveDocumentBlock,
    updateDocumentSectionProps,
    setDocumentSectionColumns,
    moveDocumentSection,
    moveDocumentSectionTo,
    duplicateDocumentSection,
    removeDocumentSection,
    beginHistory,
    undo,
    redo,
    select,
    selectSection,
    addSection,
    removeSection,
    moveSection,
    duplicateSection,
    addSectionPreset,
    setSectionColumns,
    updateSectionProps,
    addBlock,
    quickAddBlock,
    updateBlock,
    setBlockProps,
    setBlockHidden,
    updateBlockLayout,
    setBlockPresentation,
    duplicateBlock,
    commitHistory,
    removeBlock,
    moveBlock,
    moveBlockBy,
    saveDraft,
    publish,
    revertPublishedLayout,
    discard,
    resetToDefaults,
  };
});
