<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores';
import { applyTheme } from '@/utils/theme';
import { useBuilderStore } from './store';
import { EDITOR_PAGES, useEditorUi } from './editorUi';
import { previewCanvasStyle } from './preview';
import EditorTopBar from './EditorTopBar.vue';
import EditorSidebar from './EditorSidebar.vue';
import EditorInspector from './EditorInspector.vue';
import EditorInlineToolbar from './EditorInlineToolbar.vue';

const HELP_STORAGE_KEY = 'jer_editor_help_seen_v2';

const builder = useBuilderStore();
const settings = useSettingsStore();
const route = useRoute();
const router = useRouter();
const ui = useEditorUi();
const {
  activePanel,
  previewMode,
  inspectorOpen,
  sidebarOpen,
  insertionTarget,
} = ui;
const showHelp = ref(false);
const confirmDialog = ref(null);
const previewPresentation = ref(previewCanvasStyle('desktop'));

const pageId = computed(() => {
  const area = String(route.query.area || '');
  if (EDITOR_PAGES.some((page) => page.id === area)) return area;
  if (builder.slug === 'resource') return 'resource';
  if (builder.slug === 'library') return 'library';
  if (builder.slug === 'download') return 'download';
  if (['login', 'register', 'forgot-password', 'reset-password', 'account', 'profile', 'favorites'].includes(builder.slug)) return 'auth';
  return 'home';
});

const pageLabel = computed(() => EDITOR_PAGES.find((page) => page.id === pageId.value)?.label || 'Home');

function setWorkspaceAttributes() {
  if (typeof document === 'undefined') return;
  if (!builder.editMode) {
    delete document.body.dataset.editorWorkspace;
    delete document.body.dataset.editorPreview;
    document.body.style.removeProperty('--editor-preview-scale');
    document.body.style.removeProperty('--editor-sidebar-space');
    return;
  }
  document.body.dataset.editorWorkspace = 'true';
  document.body.dataset.editorPreview = ui.previewMode.value;
  updatePreviewFit();
}

function updatePreviewFit() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const sidebarWidth = sidebarOpen.value ? (window.innerWidth <= 760 ? 24 : 384) : 0;
  const availableWidth = Math.max(320, window.innerWidth - sidebarWidth - 56);
  previewPresentation.value = previewCanvasStyle(ui.previewMode.value, availableWidth);
  document.body.style.setProperty('--editor-preview-scale', String(previewPresentation.value.scale));
  document.body.style.setProperty('--editor-sidebar-space', `${sidebarWidth + 28}px`);
}

function setPreviewMode(mode) {
  ui.setPreviewMode(mode);
  if (typeof document !== 'undefined') document.body.dataset.editorPreview = ui.previewMode.value;
  updatePreviewFit();
}

function openPanel(panel) {
  builder.clearSelection();
  ui.setInsertionTarget(null);
  ui.openPanel(panel);
}

function openInspector() {
  ui.openInspector();
}

function closeInspector() {
  builder.clearSelection();
  ui.closeInspector();
}

function handleSidebarToggle() {
  ui.toggleSidebar();
  updatePreviewFit();
}

function handleContentAdded() {
  // The narrow panel intentionally overlays the preview. Once a block is
  // inserted, return the editor to the canvas so the new content and its
  // direct controls can be used immediately instead of sitting behind it.
  if (typeof window === 'undefined' || window.innerWidth > 760) return;
  sidebarOpen.value = false;
  updatePreviewFit();
}

function handleInsertTarget(event) {
  if (!event.detail?.columnId && event.detail?.kind !== 'site-document') return;
  builder.clearSelection();
  ui.setInsertionTarget(event.detail);
  ui.openPanel('insert');
  sidebarOpen.value = true;
}

function handleContentSelection(event) {
  if (!builder.editMode || !event.detail?.entity || event.detail.forwarded) return;
  if (event.detail?.inline) {
    builder.selectContentText(event.detail);
    return;
  }
  builder.clearSelection();
  ui.setInsertionTarget(null);
  ui.openPanel('content');
  ui.sidebarOpen.value = true;
  window.setTimeout(() => window.dispatchEvent(new CustomEvent('editor:content-select', { detail: { ...event.detail, forwarded: true } })), 0);
}

function handleArea(area) {
  ui.setInsertionTarget({ area });
  closeInspector();
}

function handlePageRequest(page) {
  if (!page) return;
  confirmDialog.value = {
    action: 'page',
    page,
    title: 'Switch page?',
    message: 'Your unpublished changes will stay saved in this browser draft. Publish first if you want them live on the site.',
  };
}

function openHelp() {
  showHelp.value = true;
}

function dismissHelp() {
  showHelp.value = false;
  try {
    localStorage.setItem(HELP_STORAGE_KEY, 'true');
  } catch {
    // The editor remains usable when storage is unavailable.
  }
}

function maybeShowHelp() {
  if (typeof window !== 'undefined' && window.innerWidth <= 760) {
    // On a phone the help card used to sit above the sidebar tabs and steal
    // their taps. The Help button still opens it on demand.
    showHelp.value = false;
    return;
  }
  try {
    showHelp.value = localStorage.getItem(HELP_STORAGE_KEY) !== 'true';
  } catch {
    showHelp.value = true;
  }
}

async function discardChanges() {
  if (!builder.dirty) {
    await builder.discard();
    applyTheme(settings.settings);
    closeInspector();
    return;
  }
  confirmDialog.value = { action: 'discard', title: 'Discard unpublished changes?', message: 'Your draft will return to the last published version.' };
}

async function publishChanges() {
  await builder.publish();
  if (builder.operationNotice?.type === 'success') applyTheme(settings.settings);
}

async function exitEditor() {
  if (builder.dirty) {
    confirmDialog.value = { action: 'exit', title: 'Exit without publishing?', message: 'Your unpublished changes will remain only in this browser draft.' };
    return;
  }
  await finishExit();
}

async function finishExit() {
  await builder.disable();
  if (route.query.edit === '1') {
    const query = { ...route.query, edit: undefined, area: undefined };
    await router.replace({ query });
  }
}

async function confirmWorkspaceAction() {
  const action = confirmDialog.value?.action;
  const page = confirmDialog.value?.page;
  confirmDialog.value = null;
  if (action === 'discard') {
    await builder.discard();
    applyTheme(settings.settings);
    closeInspector();
  } else if (action === 'exit') {
    await finishExit();
  } else if (action === 'page') {
    window.dispatchEvent(new CustomEvent('editor:page-navigation-confirmed', { detail: page }));
  }
}

function isTypingTarget(target) {
  const element = target instanceof HTMLElement ? target : null;
  return element?.matches('input, textarea, select, [contenteditable="true"]');
}

function onKeydown(event) {
  if (!builder.editMode) return;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'z') {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    if (event.shiftKey) builder.redo();
    else builder.undo();
    return;
  }
  if (modifier && event.key.toLowerCase() === 'y') {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    builder.redo();
    return;
  }
  if ((event.altKey || (event.ctrlKey && event.shiftKey)) && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    if (builder.selectedBlock) builder.moveBlockBy(builder.selectedBlock.id, direction);
    else if (builder.selectedSection) builder.moveSection(builder.selectedSection.id, direction);
    else if (builder.selectedDocumentBlock) builder.moveDocumentBlockBy(pageId.value, builder.selectedDocumentItem.zone, builder.selectedDocumentBlock.id, direction);
    else if (builder.selectedDocumentSection) builder.moveDocumentSection(pageId.value, builder.selectedDocumentItem.zone, builder.selectedDocumentSection.id, direction);
  }
}

function onBeforeUnload(event) {
  if (!builder.editMode || !builder.dirty) return;
  event.preventDefault();
  event.returnValue = '';
}

watch(() => builder.editMode, (active) => {
  setWorkspaceAttributes();
  if (active) maybeShowHelp();
  else showHelp.value = false;
}, { immediate: true });

watch(sidebarOpen, () => {
  if (builder.editMode) updatePreviewFit();
});

watch(() => route.fullPath, () => {
  if (builder.editMode) closeInspector();
});

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('editor:insert-target', handleInsertTarget);
  window.addEventListener('editor:content-select', handleContentSelection);
  window.addEventListener('resize', updatePreviewFit);
  window.addEventListener('beforeunload', onBeforeUnload);
  if (builder.editMode) {
    setWorkspaceAttributes();
    maybeShowHelp();
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('editor:insert-target', handleInsertTarget);
  window.removeEventListener('editor:content-select', handleContentSelection);
  window.removeEventListener('resize', updatePreviewFit);
  window.removeEventListener('beforeunload', onBeforeUnload);
  if (typeof document !== 'undefined') {
    delete document.body.dataset.editorWorkspace;
    delete document.body.dataset.editorPreview;
    document.body.style.removeProperty('--editor-preview-scale');
    document.body.style.removeProperty('--editor-sidebar-space');
  }
});
</script>

<template>
  <div v-if="builder.canEdit" class="editor-workspace-root" :class="{ 'is-active': builder.editMode }">
    <button v-if="!builder.editMode" type="button" class="editor-launcher" @click="builder.enable()">
      <i class="bi bi-pencil-square"></i><span>Edit site</span>
    </button>

    <template v-else>
      <EditorTopBar
        :page-id="pageId"
        :page-label="pageLabel"
        :preview-mode="previewMode"
        :dirty="builder.dirty"
        :saving="builder.saving"
        :content-loading="builder.contentLoading"
        :content-loaded="builder.contentLoaded"
        :operation-notice="builder.operationNotice"
        :can-undo="builder.canUndo"
        :can-redo="builder.canRedo"
        @preview="setPreviewMode"
        @undo="builder.undo"
        @redo="builder.redo"
        @discard="discardChanges"
        @publish="publishChanges"
        @exit="exitEditor"
        @help="openHelp"
        @toggle-sidebar="handleSidebarToggle"
      />

      <EditorSidebar
        v-show="sidebarOpen"
        :active-panel="activePanel"
        :inspector-open="inspectorOpen"
        :page-id="pageId"
        :insertion-target="insertionTarget"
        @panel="openPanel"
        @inspect="openInspector"
        @area="handleArea"
        @page-request="handlePageRequest"
        @help="openHelp"
        @content-added="handleContentAdded"
      >
        <template #inspector>
          <EditorInspector :page-area="pageId" @close="closeInspector" />
        </template>
      </EditorSidebar>

      <EditorInlineToolbar @more-options="openInspector" />

      <div v-if="showHelp" class="editor-help-popover" role="status" aria-live="polite">
        <div class="editor-help-heading"><strong><i class="bi bi-compass"></i> Quick start</strong><button type="button" aria-label="Close help" @click="dismissHelp"><i class="bi bi-x-lg"></i></button></div>
        <ol class="editor-help-steps">
          <li><strong>Click and type</strong> directly in the text you want to change.</li>
          <li><strong>Click an image</strong> to replace it, change its size or hide it.</li>
          <li><strong>Publish</strong> when the preview looks right.</li>
        </ol>
        <p class="editor-help-simple">Use <strong>More options</strong> only for advanced settings. Search, forms and download actions stay protected.</p>
        <p>Choose <strong>Insert</strong> to add content. Click anything on the page to edit it in the right panel. Use <strong>Alt + ↑/↓</strong> to move a selected item.</p>
        <div class="editor-help-actions"><span><i class="bi bi-phone"></i> Preview devices</span><button type="button" @click="dismissHelp">Got it</button></div>
      </div>
      <div v-if="confirmDialog" class="editor-workspace-confirm-backdrop" role="presentation" tabindex="-1" @keydown.esc="confirmDialog = null" @click.self="confirmDialog = null">
        <div class="editor-workspace-confirm" role="dialog" aria-modal="true" aria-labelledby="workspace-confirm-title">
          <i class="bi bi-exclamation-circle"></i><h2 id="workspace-confirm-title">{{ confirmDialog.title }}</h2><p>{{ confirmDialog.message }}</p>
          <div class="editor-workspace-confirm-actions"><button type="button" class="editor-workspace-cancel" autofocus @click="confirmDialog = null">Cancel</button><button type="button" class="editor-workspace-danger" @click="confirmWorkspaceAction">{{ confirmDialog.action === 'exit' ? 'Exit' : confirmDialog.action === 'page' ? 'Switch page' : 'Discard' }}</button></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor-workspace-root { position: relative; z-index: 40; pointer-events: none; font-family: Nunito, system-ui, sans-serif; }
.editor-workspace-root.is-active { z-index: 1040; }
.editor-launcher { position: fixed; right: 22px; bottom: 20px; z-index: 45; display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 16px; border: 0; border-radius: 999px; background: #89d14f; color: #234b16; box-shadow: 0 8px 22px rgba(53, 101, 28, 0.24), 0 3px 0 #5a9a24; cursor: pointer; font-size: 0.82rem; font-weight: 900; pointer-events: auto; }
.editor-launcher:hover { transform: translateY(-1px); filter: brightness(1.04); }
.editor-help-popover { position: fixed; top: 80px; right: 18px; z-index: 1060; width: min(340px, calc(100vw - 32px)); padding: 14px; border: 1px solid #b8dfe1; border-radius: 12px; background: #fff; color: #557285; box-shadow: 0 15px 34px rgba(24, 70, 95, 0.18); pointer-events: auto; }
.editor-help-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #173f5f; font-size: 0.82rem; }
.editor-help-heading strong { display: inline-flex; align-items: center; gap: 7px; }
.editor-help-heading i { color: #3bafb8; }
.editor-help-heading button { width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: #7b93a2; cursor: pointer; }
.editor-help-popover p { margin: 10px 0; font-size: 0.74rem; line-height: 1.5; }
.editor-help-steps { display: grid; gap: 7px; margin: 10px 0; padding-left: 22px; color: #557285; font-size: 0.74rem; line-height: 1.45; }
.editor-help-steps strong { color: #237f86; }
.editor-help-popover > p:not(.editor-help-simple) { display: none; }
.editor-help-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #526879; font-size: 0.68rem; }
.editor-help-actions span { display: inline-flex; align-items: center; gap: 5px; }
.editor-help-actions i { color: #17656a; }
.editor-help-actions button { border: 0; border-radius: 7px; padding: 7px 10px; background: #dff5f5; color: #17656a; cursor: pointer; font-size: 0.7rem; font-weight: 900; }
.editor-workspace-confirm-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 18px; background: rgba(23, 63, 95, .3); pointer-events: auto; }
.editor-workspace-confirm { width: min(360px, calc(100vw - 32px)); padding: 22px; border: 1px solid #dce8f0; border-radius: 13px; background: #fff; color: #557285; box-shadow: 0 18px 48px rgba(24, 70, 95, .25); text-align: center; }
.editor-workspace-confirm > i { color: #d88936; font-size: 1.7rem; }
.editor-workspace-confirm h2 { margin: 8px 0 0; color: #173f5f; font-size: .98rem; }
.editor-workspace-confirm p { margin: 8px 0 15px; font-size: .74rem; line-height: 1.5; }
.editor-workspace-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.editor-workspace-cancel, .editor-workspace-danger { min-height: 34px; padding: 7px 12px; border-radius: 7px; cursor: pointer; font: inherit; font-size: .72rem; font-weight: 800; }
.editor-workspace-cancel { border: 1px solid #d4e4eb; background: #fff; color: #557285; }
.editor-workspace-danger { border: 1px solid #efc5c3; background: #fff2f1; color: #b3413e; }

:global(body[data-editor-workspace]) { overflow-x: hidden; background: #edf2f7; }
:global(body[data-editor-workspace] .editor-preview-stage) { min-height: 100vh; box-sizing: border-box; padding: 92px var(--editor-sidebar-space, 400px) 40px 28px; background-color: #edf2f7; background-image: linear-gradient(rgba(154, 174, 190, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(154, 174, 190, 0.12) 1px, transparent 1px); background-size: 24px 24px; }
:global(body[data-editor-workspace] .editor-preview-canvas) { box-sizing: border-box; width: min(calc(100vw - var(--editor-sidebar-space, 428px) - 28px), 1440px); min-width: 320px; margin: 0 auto; overflow: clip; border: 1px solid #d7e3ea; border-radius: 4px; background: #fff; box-shadow: 0 14px 36px rgba(31, 78, 107, 0.13); container-name: site-preview; container-type: inline-size; }
:global(body[data-editor-workspace][data-editor-preview='tablet'] .editor-preview-canvas),
:global(body[data-editor-workspace][data-editor-preview='mobile'] .editor-preview-canvas) { width: var(--editor-preview-logical-width, 768px); max-width: none; transform: scale(var(--editor-preview-scale, 1)); transform-origin: top center; margin-bottom: calc(var(--editor-preview-logical-height, 0px) * (1 - var(--editor-preview-scale, 1))); }
:global(body[data-editor-workspace][data-editor-preview='tablet']) { --editor-preview-logical-width: 768px; }
:global(body[data-editor-workspace][data-editor-preview='mobile']) { --editor-preview-logical-width: 390px; }
:global(body[data-editor-workspace][data-editor-preview='mobile'] .editor-preview-canvas) { width: 390px; }
:global(body[data-editor-workspace] .editor-preview-canvas img) { max-width: 100%; }
@media (max-width: 760px) {
  .editor-help-popover { top: 68px; right: 12px; }
  .editor-launcher { right: 14px; bottom: 14px; }
  :global(body[data-editor-workspace] .editor-preview-stage) { padding: 74px 12px 24px; }
  :global(body[data-editor-workspace] .editor-preview-canvas) { width: calc(100vw - 24px); }
}

@media (prefers-reduced-motion: reduce) {
  .editor-launcher, .editor-help-popover { transition: none; }
}
</style>
