<script setup>
import { PREVIEW_MODES } from './preview';

defineProps({
  pageId: { type: String, default: 'home' },
  pageLabel: { type: String, default: 'Home' },
  previewMode: { type: String, default: 'desktop' },
  dirty: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  contentLoading: { type: Boolean, default: false },
  contentLoaded: { type: Boolean, default: false },
  operationNotice: { type: Object, default: null },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
});

const emit = defineEmits([
  'preview',
  'undo',
  'redo',
  'discard',
  'publish',
  'exit',
  'help',
  'toggle-sidebar',
]);

function statusLabel(props) {
  if (props.saving) return 'Publishing';
  if (props.contentLoading) return 'Loading content';
  if (!props.contentLoaded) return 'Content unavailable';
  if (props.operationNotice?.type === 'error') return 'Publish failed';
  if (props.dirty) return 'Unsaved changes';
  return 'Saved';
}
</script>

<template>
  <div class="editor-topbar" role="region" aria-label="Site editor toolbar">
    <div class="editor-topbar-brand">
      <button type="button" class="editor-icon-button editor-sidebar-toggle" title="Toggle editor panel" aria-label="Toggle editor panel" @click="emit('toggle-sidebar')">
        <i class="bi bi-layout-sidebar-inset"></i>
      </button>
      <div class="editor-brand-mark"><i class="bi bi-grid-1x2-fill"></i></div>
      <div class="editor-brand-copy">
        <strong>Site editor</strong>
        <span>Jewish Educational Resources</span>
      </div>
    </div>

    <div class="editor-topbar-page">
      <span class="editor-topbar-label">Editing</span>
      <span class="editor-page-pill"><i class="bi bi-file-earmark-text"></i>{{ pageLabel }}</span>
    </div>

    <div class="editor-topbar-actions">
      <div class="editor-history-actions" role="group" aria-label="History">
        <button type="button" class="editor-icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" :disabled="!canUndo" @click="emit('undo')">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
        <button type="button" class="editor-icon-button" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" :disabled="!canRedo" @click="emit('redo')">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>

      <div class="editor-device-switcher" role="group" aria-label="Preview size">
        <button
          v-for="mode in PREVIEW_MODES"
          :key="mode.id"
          type="button"
          :class="{ active: previewMode === mode.id }"
          :title="`${mode.label} preview`"
          @click="emit('preview', mode.id)"
        >
          <i :class="['bi', mode.icon]"></i>
          <span>{{ mode.label }}</span>
        </button>
      </div>

      <span class="editor-save-status" :class="{ dirty, error: operationNotice?.type === 'error' }" role="status" aria-live="polite">
        <i :class="saving ? 'bi bi-arrow-repeat spin' : dirty ? 'bi bi-cloud-arrow-up' : operationNotice?.type === 'error' ? 'bi bi-exclamation-triangle' : 'bi bi-cloud-check'"></i>
        {{ statusLabel({ saving, dirty, operationNotice, contentLoading, contentLoaded }) }}
      </span>

      <button type="button" class="editor-text-button" title="Discard changes" :disabled="saving || !dirty" @click="emit('discard')">Discard</button>
      <button type="button" class="editor-publish-button" :disabled="saving || contentLoading || !contentLoaded" @click="emit('publish')">
        <i :class="saving ? 'bi bi-arrow-repeat spin' : 'bi bi-cloud-arrow-up-fill'"></i>
        {{ saving ? 'Publishing…' : contentLoading ? 'Loading…' : 'Publish' }}
      </button>
      <button type="button" class="editor-icon-button" title="Help" aria-label="Help" @click="emit('help')"><i class="bi bi-question-circle"></i></button>
      <button type="button" class="editor-icon-button editor-close-button" title="Close editor" aria-label="Close editor" @click="emit('exit')"><i class="bi bi-x-lg"></i></button>
    </div>
    <div v-if="operationNotice?.text" class="editor-topbar-notice" :class="operationNotice.type" role="alert" aria-live="polite">
      <i :class="operationNotice.type === 'error' ? 'bi bi-exclamation-triangle' : 'bi bi-check-circle'"></i>
      <span>{{ operationNotice.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.editor-topbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 30;
  height: 68px;
  display: grid;
  grid-template-columns: minmax(230px, 1fr) auto minmax(500px, 1.8fr);
  align-items: center;
  gap: 18px;
  padding: 0 18px;
  background: rgba(255, 255, 255, 0.96);
  border-bottom: 1px solid #dce8f0;
  box-shadow: 0 3px 16px rgba(31, 78, 107, 0.1);
  color: #173f5f;
  pointer-events: auto;
  font-family: Nunito, system-ui, sans-serif;
}
.editor-topbar-brand,
.editor-topbar-actions,
.editor-history-actions,
.editor-device-switcher,
.editor-page-pill,
.editor-save-status {
  display: flex;
  align-items: center;
}
.editor-topbar-brand { min-width: 0; gap: 9px; }
.editor-brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #3bafb8;
  color: #fff;
  box-shadow: 0 5px 12px rgba(59, 175, 184, 0.25);
}
.editor-brand-copy { display: grid; min-width: 0; }
.editor-brand-copy strong { font-size: 0.92rem; line-height: 1.1; }
.editor-brand-copy span { color: #526879; font-size: 0.68rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-topbar-page { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
.editor-topbar-label { color: #526879; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.editor-page-pill { gap: 7px; padding: 8px 12px; border: 1px solid #dce8f0; border-radius: 8px; background: #f7fafc; font-size: 0.82rem; font-weight: 800; }
.editor-topbar-actions { justify-content: flex-end; gap: 8px; min-width: 0; }
.editor-history-actions { gap: 2px; padding-right: 6px; border-right: 1px solid #dce8f0; }
.editor-device-switcher { gap: 2px; padding: 3px; border: 1px solid #dce8f0; border-radius: 9px; background: #f7fafc; }
.editor-device-switcher button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: #526879; cursor: pointer; font-size: 0.7rem; font-weight: 800; }
.editor-device-switcher button.active { background: #dff5f5; color: #17656a; box-shadow: inset 0 0 0 1px rgba(59, 175, 184, 0.25); }
.editor-icon-button { width: 32px; height: 32px; display: inline-grid; place-items: center; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #5f7b8e; cursor: pointer; }
.editor-icon-button:hover:not(:disabled) { border-color: #b8dce0; background: #eefafa; color: #207d85; }
.editor-icon-button:disabled { opacity: 0.35; cursor: not-allowed; }
.editor-sidebar-toggle { display: none; }
.editor-save-status { gap: 5px; color: #5d7d8d; font-size: 0.72rem; font-weight: 800; white-space: nowrap; }
.editor-save-status.dirty { color: #b06b12; }
.editor-save-status.error { color: #c2413e; }
.editor-save-status i { font-size: 0.9rem; }
.editor-text-button { border: 0; background: transparent; color: #577386; font-size: 0.75rem; font-weight: 800; cursor: pointer; }
.editor-text-button:hover:not(:disabled) { color: #c2413e; }
.editor-text-button:disabled { opacity: 0.35; cursor: not-allowed; }
.editor-publish-button { display: inline-flex; align-items: center; gap: 6px; border: 0; border-radius: 8px; padding: 9px 13px; background: #89d14f; color: #234b16; box-shadow: 0 3px 0 #5a9a24; font-size: 0.76rem; font-weight: 900; cursor: pointer; }
.editor-publish-button:hover:not(:disabled) { filter: brightness(1.04); transform: translateY(-1px); }
.editor-publish-button:disabled { opacity: 0.55; cursor: wait; }
.editor-close-button { margin-left: -2px; }
.editor-topbar-notice {
  position: absolute;
  top: calc(100% + 8px);
  right: 18px;
  max-width: min(520px, calc(100vw - 36px));
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid #dce8f0;
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 78, 107, 0.14);
  color: #466779;
  font-size: .74rem;
  font-weight: 700;
  line-height: 1.35;
  pointer-events: none;
}
.editor-topbar-notice.error { border-color: #f2c7c5; color: #a3322f; background: #fff8f7; }
.editor-topbar-notice.success { border-color: #c5e6c0; color: #397338; background: #f8fff6; }
.spin { animation: editor-spin 0.8s linear infinite; }
@keyframes editor-spin { to { transform: rotate(360deg); } }
@media (max-width: 1120px) {
  .editor-topbar { grid-template-columns: minmax(200px, 1fr) auto; }
  .editor-topbar-page { display: none; }
  .editor-topbar-actions { gap: 5px; }
  .editor-device-switcher span { display: none; }
}
@media (max-width: 760px) {
  .editor-topbar { height: 58px; padding: 0 9px; grid-template-columns: auto 1fr; }
  .editor-sidebar-toggle { display: inline-grid; }
  .editor-brand-copy span { display: none; }
  .editor-topbar-actions { gap: 3px; min-width: 0; max-width: 100%; overflow: hidden; justify-content: flex-end; padding-bottom: 2px; }
  .editor-history-actions, .editor-device-switcher, .editor-topbar-actions > .editor-icon-button[title="Help"] { display: none; }
  .editor-save-status { flex: 0 0 16px; width: 16px; overflow: hidden; font-size: .58rem; text-overflow: ellipsis; }
  .editor-text-button, .editor-publish-button { flex: 0 0 auto; }
  .editor-text-button { padding: 5px 4px; font-size: .66rem; }
  .editor-publish-button { padding: 8px 8px; white-space: nowrap; }
  .editor-close-button { flex: 0 0 28px; width: 28px; }
}
</style>
