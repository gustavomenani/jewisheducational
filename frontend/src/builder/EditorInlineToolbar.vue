<script setup>
// Compact preview-first controls for text that lives in the original page
// templates. New SiteDocument blocks carry their own local toolbar; this one
// bridges the legacy editable settings without turning the inspector into the
// primary editing surface again.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useBuilderStore } from './store';

const emit = defineEmits(['more-options']);
const builder = useBuilderStore();
const position = ref({ top: 76, left: 12, visible: false });

const selected = computed(() => builder.selectedSetting);
const canShow = computed(() => builder.editMode && builder.canEdit && Boolean(selected.value?.key));
const styleKey = (suffix) => `${selected.value?.key || ''}_${suffix}`;

function valueFor(suffix, fallback) {
  if (!selected.value?.key) return fallback;
  const value = builder.settingValue(styleKey(suffix), '');
  return value === '' || value === null || value === undefined ? fallback : value;
}

function setStyle(suffix, value) {
  if (!selected.value?.key) return;
  builder.setSetting(styleKey(suffix), String(value));
  placeToolbar();
}

function adjustSize(amount) {
  const fallback = /^h[1-6]$/i.test(selected.value?.tag || '') ? 32 : 16;
  const next = Math.min(72, Math.max(10, Number(valueFor('font_size', fallback)) + amount));
  setStyle('font_size', next);
}

function toggleBold() {
  setStyle('font_weight', String(valueFor('font_weight', '400')) === '700' ? '400' : '700');
}

function setLink(event) {
  if (!selected.value?.linkKey) return;
  builder.setSetting(selected.value.linkKey, event.target.value);
}

function elementForSelectedSetting() {
  if (!selected.value?.key || typeof document === 'undefined') return null;
  const escaped = globalThis.CSS?.escape
    ? globalThis.CSS.escape(selected.value.key)
    : selected.value.key.replaceAll('"', '\\"');
  return document.querySelector(`[data-editor-setting="${escaped}"]`);
}

function placeToolbar() {
  if (!canShow.value || typeof window === 'undefined') {
    position.value = { ...position.value, visible: false };
    return;
  }
  const element = elementForSelectedSetting();
  if (!element) {
    position.value = { top: 76, left: 12, visible: true };
    return;
  }
  const rect = element.getBoundingClientRect();
  const estimatedWidth = selected.value?.linkKey ? 430 : 276;
  position.value = {
    top: Math.max(76, Math.round(rect.top - 42)),
    left: Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - estimatedWidth - 8)),
    visible: true,
  };
}

watch(selected, () => nextTick(placeToolbar), { deep: true });
watch(() => builder.editMode, () => nextTick(placeToolbar));

onMounted(() => {
  window.addEventListener('resize', placeToolbar);
  window.addEventListener('scroll', placeToolbar, true);
  nextTick(placeToolbar);
});

onUnmounted(() => {
  window.removeEventListener('resize', placeToolbar);
  window.removeEventListener('scroll', placeToolbar, true);
});
</script>

<template>
  <div
    v-if="canShow && position.visible"
    class="editor-inline-toolbar"
    :style="{ top: `${position.top}px`, left: `${position.left}px` }"
    role="toolbar"
    aria-label="Text formatting"
    @mousedown.stop
  >
    <button type="button" title="Smaller text" aria-label="Smaller text" @click="adjustSize(-2)">A−</button>
    <button type="button" title="Larger text" aria-label="Larger text" @click="adjustSize(2)">A+</button>
    <button type="button" title="Bold" aria-label="Bold" :class="{ active: String(valueFor('font_weight', '400')) === '700' }" @click="toggleBold"><i class="bi bi-type-bold"></i></button>
    <span class="editor-inline-separator"></span>
    <button v-for="align in ['left', 'center', 'right']" :key="align" type="button" :title="`Align ${align}`" :aria-label="`Align ${align}`" :class="{ active: valueFor('text_align', 'left') === align }" @click="setStyle('text_align', align)"><i :class="`bi bi-text-${align}`"></i></button>
    <template v-if="selected?.linkKey">
      <span class="editor-inline-separator"></span>
      <input :value="builder.settingValue(selected.linkKey, selected.defaultLink || '/')" type="url" aria-label="Link" placeholder="Link" @input="setLink" />
    </template>
    <button type="button" class="editor-inline-more" title="More options" aria-label="More options" @click="emit('more-options')"><i class="bi bi-sliders"></i></button>
  </div>
</template>

<style scoped>
.editor-inline-toolbar {
  position: fixed;
  z-index: 1055;
  display: flex;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 16px);
  min-height: 34px;
  padding: 4px;
  border: 1px solid #b7e1e2;
  border-radius: 9px;
  background: #fff;
  color: #45687c;
  box-shadow: 0 9px 24px rgba(31, 78, 107, .19);
  font-family: Nunito, system-ui, sans-serif;
  pointer-events: auto;
}
.editor-inline-toolbar button { display: grid; width: 27px; height: 27px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #416375; cursor: pointer; font: 900 .68rem Nunito, system-ui, sans-serif; }
.editor-inline-toolbar button:hover, .editor-inline-toolbar button.active { border-color: #91d0d2; background: #eafafa; color: #17656a; }
.editor-inline-toolbar input { width: min(145px, 31vw); min-height: 27px; padding: 3px 6px; border: 1px solid #c8dde1; border-radius: 6px; color: #365a70; font: 700 .64rem Nunito, system-ui, sans-serif; }
.editor-inline-separator { width: 1px; height: 19px; margin: 0 2px; background: #dce9ec; }
.editor-inline-toolbar .editor-inline-more { color: #237f86; }
@media (max-width: 600px) {
  .editor-inline-toolbar { flex-wrap: wrap; }
  .editor-inline-toolbar input { width: min(130px, 45vw); }
}
</style>
