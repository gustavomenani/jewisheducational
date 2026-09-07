<script setup>
import { computed, ref } from 'vue';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useBuilderStore } from './store';
import { blockDef } from './registry';
import { alignBlockPlacement, findBlock, normalizeBlockPlacement } from './layout';
import { fieldByKey } from './fieldCatalog';
import { normalizeEditorUrl } from './fieldCatalog';
import { normalizeTextStyle } from './textStyle';

defineProps({
  pageArea: { type: String, default: 'home' },
});

const emit = defineEmits(['close']);
const builder = useBuilderStore();
const uploading = ref(false);
const fieldError = ref('');
const confirmDialog = ref(null);

const ALIGNMENT_OPTIONS = [
  { value: 'left', label: 'Align left', icon: 'bi-text-left' },
  { value: 'center', label: 'Align center', icon: 'bi-text-center' },
  { value: 'right', label: 'Align right', icon: 'bi-text-right' },
];

const WIDTH_PRESETS = [
  { value: 'compact', label: 'Compact', span: 4 },
  { value: 'normal', label: 'Normal', span: 6 },
  { value: 'wide', label: 'Wide', span: 9 },
  { value: 'full', label: 'Full width', span: 12 },
];

const SPACE_PRESETS = [
  { value: 'none', label: 'No space', amount: 0 },
  { value: 'small', label: 'Small space', amount: 16 },
  { value: 'normal', label: 'Normal space', amount: 32 },
  { value: 'comfortable', label: 'Comfortable space', amount: 56 },
];

const SECTION_LAYOUT_PRESETS = [
  { value: '12', label: 'One column', icon: 'bi-square-fill' },
  { value: '6-6', label: 'Two columns', icon: 'bi-columns-gap' },
  { value: '4-4-4', label: 'Three columns', icon: 'bi-grid-3x3-gap-fill' },
];

const SECTION_SPACE_PRESETS = [
  { value: 'tight', label: 'Tight', amount: 24 },
  { value: 'normal', label: 'Normal', amount: 48 },
  { value: 'comfortable', label: 'Comfortable space', amount: 80 },
];

const selectedBlock = computed(() => builder.selectedBlock);
const selectedSection = computed(() => builder.selectedSection);
const selectedSetting = computed(() => builder.selectedSetting);
const selectedBlockDefinition = computed(() => blockDef(selectedBlock.value?.type));
const selectedBlockHidden = computed(() => Boolean(selectedBlock.value?.props?.hidden));
const selectedSectionHidden = computed(() => Boolean(selectedSection.value?.props?.hidden));
const selectedField = computed(() => selectedSetting.value ? (fieldByKey(selectedSetting.value.key) || selectedSetting.value) : null);
const blockLocation = computed(() => selectedBlock.value ? findBlock(builder.layout, selectedBlock.value.id) : null);
const parentSection = computed(() => blockLocation.value?.section || null);
const blockOrderLocation = computed(() => {
  const location = blockLocation.value;
  if (!location) return null;
  const ordered = location.section.columns.flatMap((column) => column.blocks.map((block) => ({ block, column })));
  return {
    index: ordered.findIndex((item) => item.block.id === selectedBlock.value.id),
    total: ordered.length,
  };
});
const sectionOrderLocation = computed(() => {
  if (!selectedSection.value) return null;
  return {
    index: builder.layout.sections.findIndex((section) => section.id === selectedSection.value.id),
    total: builder.layout.sections.length,
  };
});
const blockPlacement = computed(() => normalizeBlockPlacement(selectedBlock.value?.layout));
const blockContentFields = computed(() => (selectedBlockDefinition.value?.fields || []).filter((field) => {
  if (field.key === 'align') return false;
  if (['heading', 'paragraph'].includes(selectedBlock.value?.type) && field.key === 'color') return false;
  if (selectedBlock.value?.type === 'image' && field.key === 'size') return false;
  if (selectedBlock.value?.type === 'video' && field.key === 'maxWidth') return false;
  return true;
}));
const blockHasAlignment = computed(() => (selectedBlockDefinition.value?.fields || []).some((field) => field.key === 'align'));
const isBlockTypography = computed(() => ['heading', 'paragraph'].includes(selectedBlock.value?.type));
const blockTextStyle = computed(() => selectedBlock.value
  ? normalizeTextStyle(selectedBlock.value.props?.textStyle, selectedBlock.value.props)
  : {});
const simpleAlignment = computed(() => {
  if (blockHasAlignment.value && ['left', 'center', 'right'].includes(selectedBlock.value?.props?.align)) {
    return selectedBlock.value.props.align;
  }
  const placement = blockPlacement.value;
  if (placement.start <= 1) return 'left';
  if (placement.start + placement.span - 1 >= 12) return 'right';
  return 'center';
});
const simpleWidth = computed(() => WIDTH_PRESETS.find((preset) => preset.span === blockPlacement.value.span)?.value || '');
const simpleSpace = computed(() => SPACE_PRESETS.find((preset) => (
  preset.amount === blockPlacement.value.marginTop && preset.amount === blockPlacement.value.marginBottom
))?.value || '');
const sectionColumnsValue = computed(() => selectedSection.value?.columns?.map((column) => column.span).join('-') || '12');
const sectionSpace = computed(() => SECTION_SPACE_PRESETS.find((preset) => (
  preset.amount === Number(selectedSection.value?.props?.paddingY ?? 48)
))?.value || '');
const isHeroButton = computed(() => ['home_hero_cta_primary', 'home_hero_cta_secondary'].includes(selectedSetting.value?.key));
const isImageSetting = computed(() => selectedField.value?.type === 'image' || selectedSetting.value?.type === 'image');
const isTextSetting = computed(() => {
  const type = selectedField.value?.type || selectedSetting.value?.type || 'text';
  return Boolean(selectedSetting.value) && selectedSetting.value.allowRemove !== false && !isImageSetting.value && ['text', 'textarea', 'url'].includes(type);
});

const TEXT_FONT_OPTIONS = [
  { value: '', label: 'Theme default' },
  { value: 'Nunito, system-ui, sans-serif', label: 'Nunito' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
];
const TEXT_STYLE_SUFFIXES = [
  'font_family', 'font_size', 'font_weight', 'color', 'text_align',
  'opacity', 'width', 'line_height', 'letter_spacing', 'margin_top', 'margin_bottom',
];

function styleValue(suffix, fallback = '') {
  if (!selectedSetting.value) return fallback;
  const value = builder.settingValue(`${selectedSetting.value.key}_${suffix}`, '');
  return value === '' || value === null || value === undefined ? fallback : value;
}

function setTextStyle(suffix, rawValue) {
  if (!selectedSetting.value) return;
  let value = rawValue;
  if (['font_size', 'width', 'margin_top', 'margin_bottom'].includes(suffix)) {
    const limits = {
      font_size: [10, 72], width: [25, 100], margin_top: [0, 48], margin_bottom: [0, 48],
    }[suffix];
    value = Math.min(limits[1], Math.max(limits[0], Number(rawValue) || limits[0]));
  }
  if (suffix === 'opacity') value = Math.min(1, Math.max(0.2, Number(rawValue) || 1));
  if (suffix === 'line_height') value = Math.min(2.2, Math.max(1, Number(rawValue) || 1.4));
  if (suffix === 'letter_spacing') value = Math.min(6, Math.max(0, Number(rawValue) || 0));
  builder.setSetting(`${selectedSetting.value.key}_${suffix}`, String(value));
}

function resetTextStyle() {
  if (!selectedSetting.value) return;
  TEXT_STYLE_SUFFIXES.forEach((suffix) => builder.resetSetting(`${selectedSetting.value.key}_${suffix}`));
}

const settingTitle = computed(() => selectedSetting.value?.label || selectedField.value?.label || 'Site content');
const selectedImageVisibilityKey = computed(() => selectedSetting.value?.visibilityKey || (selectedSetting.value?.key ? `${selectedSetting.value.key}_show` : ''));
const selectedImageAltKey = computed(() => selectedSetting.value?.altSettingKey || '');
const selectedImageRemoved = computed(() => {
  if (!isImageSetting.value || !selectedImageVisibilityKey.value) return false;
  const state = builder.settingValue(selectedImageVisibilityKey.value, 'true');
  return state === false || state === 'false';
});
const selectedTextVisibilityKey = computed(() => selectedSetting.value?.visibilityKey || (selectedSetting.value?.key ? `${selectedSetting.value.key}_show` : ''));
const selectedTextRemoved = computed(() => {
  if (!isTextSetting.value || !selectedTextVisibilityKey.value) return false;
  const state = builder.settingValue(selectedTextVisibilityKey.value, 'true');
  return state === false || state === 'false';
});
const selectedTitle = computed(() => {
  if (selectedBlock.value) return selectedBlockDefinition.value?.label || 'Content block';
  if (selectedSection.value) return 'Section';
  if (selectedSetting.value) return settingTitle.value;
  return 'Nothing selected';
});

function settingValue() {
  if (!selectedSetting.value) return '';
  return builder.settingValue(selectedSetting.value.key, selectedSetting.value.default || '');
}

function setSettingValue(value) {
  if (!selectedSetting.value) return;
  fieldError.value = '';
  if (selectedField.value?.type === 'url') {
    const normalized = normalizeEditorUrl(value);
    if (normalized === null) {
      fieldError.value = 'Use a site path beginning with / or a secure https:// URL.';
      return;
    }
    builder.setSetting(selectedSetting.value.key, normalized);
    if (selectedTextRemoved.value && selectedTextVisibilityKey.value) builder.setSetting(selectedTextVisibilityKey.value, 'true');
    return;
  }
  builder.setSetting(selectedSetting.value.key, value);
  if (isTextSetting.value && selectedTextVisibilityKey.value) {
    if (String(value || '').trim()) builder.setSetting(selectedTextVisibilityKey.value, 'true');
    else builder.setSetting(selectedTextVisibilityKey.value, 'false');
  }
}

function resetSetting() {
  if (selectedSetting.value?.key) {
    builder.resetSetting(selectedSetting.value.key);
    if (selectedSetting.value.altSettingKey) builder.resetSetting(selectedSetting.value.altSettingKey);
    if (selectedSetting.value.widthKey) builder.resetSetting(selectedSetting.value.widthKey);
    if (selectedSetting.value.visibilityKey) builder.resetSetting(selectedSetting.value.visibilityKey);
  }
  fieldError.value = '';
}

function removeSelectedImage() {
  if (!selectedSetting.value || !isImageSetting.value) return;
  if (selectedImageVisibilityKey.value) builder.setSetting(selectedImageVisibilityKey.value, 'false');
}

function restoreSelectedImage() {
  if (!selectedSetting.value || !selectedImageVisibilityKey.value) return;
  builder.setSetting(selectedImageVisibilityKey.value, 'true');
}

function removeSelectedText() {
  if (!selectedSetting.value || !isTextSetting.value) return;
  if (selectedTextVisibilityKey.value) builder.setSetting(selectedTextVisibilityKey.value, 'false');
}

function restoreSelectedText() {
  if (!selectedSetting.value || !isTextSetting.value) return;
  if (selectedTextVisibilityKey.value) builder.setSetting(selectedTextVisibilityKey.value, 'true');
}

async function uploadSettingImage(event) {
  const file = event.target.files?.[0];
  if (!file || !selectedSetting.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/settings/upload', form);
    builder.trackPendingMediaUpload(data.url);
    builder.setSetting(selectedSetting.value.key, data.url);
    if (selectedImageVisibilityKey.value) builder.setSetting(selectedImageVisibilityKey.value, 'true');
  } catch (error) {
    fieldError.value = error.response?.data?.error || 'Could not upload the image.';
  } finally {
    uploading.value = false;
    event.target.value = '';
  }
}

function blockValue(key) {
  return selectedBlock.value?.props?.[key] ?? '';
}

function setBlockField(field, value) {
  if (!selectedBlock.value) return;
  builder.setBlockProps(selectedBlock.value.id, { [field.key]: field.type === 'number' ? Number(value) : value });
}

function blockStyleValue(key, fallback = '') {
  return blockTextStyle.value[key] ?? fallback;
}

function setBlockTextStyle(key, value) {
  if (!selectedBlock.value) return;
  const next = normalizeTextStyle({ ...blockTextStyle.value, [key]: value }, selectedBlock.value.props);
  builder.setBlockProps(selectedBlock.value.id, { textStyle: next });
}

function resetBlockTextStyle() {
  if (!selectedBlock.value) return;
  builder.setBlockProps(selectedBlock.value.id, { textStyle: {} });
}

function clearBlockField(field) {
  if (!selectedBlock.value || !field?.clearable) return;
  builder.setBlockProps(selectedBlock.value.id, { [field.key]: '' });
}

function setBlockLayout(key, value) {
  if (!selectedBlock.value) return;
  builder.updateBlockLayout(selectedBlock.value.id, { [key]: Number(value) });
}

function setSimpleAlignment(alignment) {
  if (!selectedBlock.value) return;
  const props = blockHasAlignment.value ? { align: alignment } : {};
  const layout = alignBlockPlacement(blockPlacement.value, alignment);
  builder.setBlockPresentation(selectedBlock.value.id, { props, layout });
}

function setSimpleWidth(preset) {
  if (!selectedBlock.value) return;
  const props = {};
  if (selectedBlock.value.type === 'image') {
    props.size = { 4: 'small', 6: 'medium', 9: 'large', 12: 'full' }[preset.span] || 'large';
  }
  if (selectedBlock.value.type === 'video') props.maxWidth = Math.round((preset.span / 12) * 100);
  const layout = alignBlockPlacement({ ...blockPlacement.value, span: preset.span }, simpleAlignment.value);
  builder.setBlockPresentation(selectedBlock.value.id, { props, layout });
}

function setSimpleSpace(preset) {
  if (!selectedBlock.value) return;
  builder.setBlockPresentation(selectedBlock.value.id, {
    layout: { ...blockPlacement.value, marginTop: preset.amount, marginBottom: preset.amount },
  });
}

async function uploadBlockImage(event, field) {
  const file = event.target.files?.[0];
  if (!file || !selectedBlock.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/settings/upload', form);
    builder.trackPendingMediaUpload(data.url);
    setBlockField(field, data.url);
  } catch (error) {
    fieldError.value = error.response?.data?.error || 'Could not upload the image.';
  } finally {
    uploading.value = false;
    event.target.value = '';
  }
}

function setSectionProp(key, value) {
  if (!selectedSection.value) return;
  builder.updateSectionProps(selectedSection.value.id, { [key]: key === 'paddingY' || key === 'maxWidth' ? Number(value) : value });
}

function setSimpleSectionColumns(preset) {
  if (!selectedSection.value) return;
  builder.setSectionColumns(selectedSection.value.id, preset.value.split('-').map(Number));
}

function setSimpleSectionSpace(preset) {
  if (!selectedSection.value) return;
  builder.updateSectionProps(selectedSection.value.id, { paddingY: preset.amount });
}

function removeBlock() {
  if (!selectedBlock.value) return;
  builder.removeBlock(selectedBlock.value.id);
  emit('close');
}

function requestRemoveBlock() {
  if (!selectedBlock.value) return;
  confirmDialog.value = {
    action: 'block',
    title: 'Delete this block?',
    message: 'This removes the block from the draft. You can use Undo if you change your mind.',
  };
}

function toggleBlockHidden() {
  if (!selectedBlock.value) return;
  builder.setBlockHidden(selectedBlock.value.id, !selectedBlockHidden.value);
}

function toggleSectionHidden() {
  if (!selectedSection.value) return;
  builder.updateSectionProps(selectedSection.value.id, { hidden: !selectedSectionHidden.value });
}

function removeSection() {
  if (!selectedSection.value) return;
  builder.removeSection(selectedSection.value.id);
  emit('close');
}

function selectParentSection() {
  if (!parentSection.value) return;
  builder.selectSection(parentSection.value.id);
}

function requestRemoveSection() {
  if (!selectedSection.value) return;
  confirmDialog.value = {
    action: 'section',
    title: 'Delete this section?',
    message: 'All blocks inside this section will be removed from the draft. You can use Undo if needed.',
  };
}

function confirmRemove() {
  const action = confirmDialog.value?.action;
  confirmDialog.value = null;
  if (action === 'block') removeBlock();
  if (action === 'section') removeSection();
}

function centerSelected() {
  if (!selectedBlock.value) return;
  setSimpleAlignment('center');
}

function duplicateSelected() {
  if (selectedBlock.value) builder.duplicateBlock(selectedBlock.value.id);
  else if (selectedSection.value) builder.duplicateSection(selectedSection.value.id);
}

function moveSelected(direction) {
  if (selectedBlock.value) builder.moveBlockBy(selectedBlock.value.id, direction);
  else if (selectedSection.value) builder.moveSection(selectedSection.value.id, direction);
}

function hideHeroButton() {
  if (!selectedSetting.value) return;
  const visibilityKey = selectedSetting.value.key === 'home_hero_cta_primary'
    ? 'home_hero_cta_primary_show'
    : 'home_hero_cta_secondary_show';
  builder.setSetting(visibilityKey, 'false');
}
</script>

<template>
  <div class="editor-inspector">
    <div class="editor-inspector-heading">
      <div><span class="editor-kicker">Properties</span><h2>{{ selectedTitle }}</h2></div>
      <button type="button" class="editor-inspector-close" aria-label="Close properties" title="Close properties" @click="emit('close')"><i class="bi bi-x-lg"></i></button>
    </div>

    <div v-if="selectedBlock || selectedSection" class="editor-selection-actions" role="toolbar" :aria-label="selectedBlock ? 'Block quick actions' : 'Section quick actions'">
      <span class="editor-selection-actions-label">Quick actions</span>
      <button type="button" :class="selectedBlockHidden || selectedSectionHidden ? 'editor-secondary-action' : 'editor-danger-action'" @click="selectedBlock ? toggleBlockHidden() : toggleSectionHidden()">
        <i :class="selectedBlockHidden || selectedSectionHidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i>{{ selectedBlockHidden || selectedSectionHidden ? 'Restore' : 'Hide' }} {{ selectedBlock ? 'block' : 'section' }}
      </button>
      <button v-if="selectedBlock && parentSection" type="button" class="editor-secondary-action" @click="selectParentSection">
        <i class="bi bi-layout-three-columns"></i>Select section
      </button>
      <button type="button" class="editor-danger-action" :aria-label="selectedBlock ? 'Delete block' : 'Delete section'" @click="selectedBlock ? requestRemoveBlock() : requestRemoveSection()">
        <i class="bi bi-trash3"></i>Delete {{ selectedBlock ? 'block' : 'section' }}
      </button>
    </div>

    <div v-if="!selectedBlock && !selectedSection && !selectedSetting" class="editor-empty-inspector">
      <i class="bi bi-cursor"></i>
      <strong>Select something on the page</strong>
      <p>Click a text, image, button, block or section to see its controls here.</p>
    </div>

    <template v-else-if="selectedSetting">
      <div class="editor-selection-note"><i class="bi bi-pencil-square"></i><span>This content is part of the live site layout.</span></div>
      <div class="editor-field-group">
        <label :for="`editor-setting-${selectedSetting.key}`">{{ settingTitle }}</label>
        <div v-if="selectedTextRemoved" class="editor-text-removed"><i class="bi bi-eye-slash"></i><span>Text removed from page</span></div>
        <div v-if="isImageSetting" class="editor-image-control">
          <img v-if="settingValue() && !selectedImageRemoved" :src="mediaUrl(settingValue())" :alt="`${settingTitle} preview`" />
          <div v-else-if="selectedImageRemoved" class="editor-image-removed"><i class="bi bi-eye-slash"></i><span>Image removed from page</span></div>
          <div class="editor-image-actions">
            <label class="editor-upload-button"><i class="bi bi-upload"></i>{{ uploading ? 'Uploading…' : 'Upload image' }}<input type="file" accept="image/jpeg,image/png,image/webp" hidden :disabled="uploading" @change="uploadSettingImage($event)" /></label>
            <button type="button" class="editor-secondary-action" @click="resetSetting"><i class="bi bi-arrow-counterclockwise"></i>Restore default</button>
            <button v-if="selectedImageRemoved" type="button" class="editor-secondary-action" @click="restoreSelectedImage"><i class="bi bi-eye"></i>Restore image</button><button v-else type="button" class="editor-danger-action" @click="removeSelectedImage"><i class="bi bi-eye-slash"></i>Remove image</button>
          </div>
          <label v-if="selectedImageAltKey" :for="`editor-image-alt-${selectedSetting.key}`">Alt text</label><input v-if="selectedImageAltKey" :id="`editor-image-alt-${selectedSetting.key}`" class="editor-input" :value="builder.settingValue(selectedImageAltKey, '')" @input="builder.setSetting(selectedImageAltKey, $event.target.value)" />
        </div>
        <textarea v-else-if="selectedField?.type === 'textarea'" :id="`editor-setting-${selectedSetting.key}`" class="editor-input" rows="4" :value="selectedTextRemoved ? '' : settingValue()" @input="setSettingValue($event.target.value)"></textarea>
        <select v-else-if="selectedField?.type === 'select'" :id="`editor-setting-${selectedSetting.key}`" class="editor-input" :value="settingValue()" @change="setSettingValue($event.target.value)"><option v-for="option in selectedField.options || []" :key="typeof option === 'object' ? option.value : option" :value="typeof option === 'object' ? option.value : option">{{ typeof option === 'object' ? option.label : option }}</option></select>
        <label v-else-if="selectedField?.type === 'boolean'" class="editor-checkbox-row"><input :id="`editor-setting-${selectedSetting.key}`" type="checkbox" :checked="settingValue() !== 'false'" @change="setSettingValue($event.target.checked ? 'true' : 'false')" /><span>Visible on the page</span></label>
        <input v-else-if="selectedField?.type === 'color'" :id="`editor-setting-${selectedSetting.key}`" class="editor-color-input" type="color" :value="settingValue() || '#ffffff'" @input="setSettingValue($event.target.value)" />
        <input v-else-if="!isImageSetting" :id="`editor-setting-${selectedSetting.key}`" class="editor-input" :type="selectedField?.type === 'url' ? 'url' : 'text'" :value="selectedTextRemoved ? '' : settingValue()" @input="setSettingValue($event.target.value)" />
        <div v-if="isTextSetting" class="editor-text-field-actions">
          <button v-if="selectedTextRemoved" type="button" class="editor-secondary-action" @click="restoreSelectedText"><i class="bi bi-eye"></i>Restore text</button>
          <button v-else type="button" class="editor-danger-action" @click="removeSelectedText"><i class="bi bi-eye-slash"></i>Remove text</button>
        </div>
         <small v-if="fieldError" class="editor-error">{{ fieldError }}</small>
       </div>
      <div v-if="isImageSetting" class="editor-field-group editor-image-width-group">
        <label :for="`editor-image-width-${selectedSetting.key}`">Image width</label>
        <input :id="`editor-image-width-${selectedSetting.key}`" type="range" min="25" max="100" step="5" :value="styleValue('width', 100)" @input="setTextStyle('width', $event.target.value)" />
        <span class="editor-range-value">{{ styleValue('width', 100) }}%</span>
      </div>
      <section v-if="isTextSetting" class="editor-inspector-section editor-typography-section">
        <div class="editor-section-heading-row"><h3>Text styling</h3><button type="button" class="editor-clear-field" @click="resetTextStyle">Reset styling</button></div>
        <p class="editor-placement-hint">Small, safe controls for the selected text. Layout stays with the page template.</p>
        <div class="editor-field-group"><label :for="`editor-font-family-${selectedSetting.key}`">Font</label><select :id="`editor-font-family-${selectedSetting.key}`" class="editor-input" :value="styleValue('font_family')" @change="setTextStyle('font_family', $event.target.value)"><option v-for="option in TEXT_FONT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
        <div class="editor-style-grid">
          <label class="editor-size-control">Size<div class="editor-range-with-number"><input type="range" min="10" max="72" step="1" :value="styleValue('font_size', 16)" aria-label="Text size slider" @input="setTextStyle('font_size', $event.target.value)" /><input class="editor-number-input" type="number" min="10" max="72" step="1" :value="styleValue('font_size', 16)" aria-label="Text size in pixels" @input="setTextStyle('font_size', $event.target.value)" /></div><span>{{ styleValue('font_size', 16) }} px</span></label>
          <label>Weight<select class="editor-input" :value="styleValue('font_weight', '400')" @change="setTextStyle('font_weight', $event.target.value)"><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label>
          <label>Color<input class="editor-color-input" type="color" :value="styleValue('color', '#234b67')" @input="setTextStyle('color', $event.target.value)" /></label>
          <label>Alignment<select class="editor-input" :value="styleValue('text_align', 'left')" @change="setTextStyle('text_align', $event.target.value)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label>
          <label>Opacity<input type="range" min="0.2" max="1" step="0.05" :value="styleValue('opacity', 1)" @input="setTextStyle('opacity', $event.target.value)" /><span>{{ Math.round(Number(styleValue('opacity', 1)) * 100) }}%</span></label>
          <label>Width<input type="range" min="25" max="100" step="5" :value="styleValue('width', 100)" @input="setTextStyle('width', $event.target.value)" /><span>{{ styleValue('width', 100) }}%</span></label>
          <label>Line spacing<input type="range" min="1" max="2.2" step="0.1" :value="styleValue('line_height', 1.4)" @input="setTextStyle('line_height', $event.target.value)" /><span>{{ styleValue('line_height', 1.4) }}</span></label>
          <label>Letter spacing<input type="range" min="0" max="6" step="0.5" :value="styleValue('letter_spacing', 0)" @input="setTextStyle('letter_spacing', $event.target.value)" /><span>{{ styleValue('letter_spacing', 0) }} px</span></label>
        </div>
        <div class="editor-style-grid editor-style-spacing"><label>Top space<input type="range" min="0" max="48" step="4" :value="styleValue('margin_top', 0)" @input="setTextStyle('margin_top', $event.target.value)" /><span>{{ styleValue('margin_top', 0) }} px</span></label><label>Bottom space<input type="range" min="0" max="48" step="4" :value="styleValue('margin_bottom', 0)" @input="setTextStyle('margin_bottom', $event.target.value)" /><span>{{ styleValue('margin_bottom', 0) }} px</span></label></div>
      </section>
      <div v-if="selectedSetting.linkKey" class="editor-field-group"><label :for="`editor-setting-link-${selectedSetting.key}`">Link</label><input :id="`editor-setting-link-${selectedSetting.key}`" class="editor-input" type="url" :value="builder.settingValue(selectedSetting.linkKey, selectedSetting.defaultLink || '/')" @input="builder.setSetting(selectedSetting.linkKey, $event.target.value)" /></div>
      <div class="editor-inspector-actions"><button type="button" class="editor-secondary-action" @click="resetSetting"><i class="bi bi-arrow-counterclockwise"></i>Restore default</button><button v-if="isHeroButton && !selectedTextRemoved" type="button" class="editor-danger-action" @click="hideHeroButton"><i class="bi bi-eye-slash"></i>Hide this button</button></div>
    </template>

    <template v-else-if="selectedBlock">
      <div class="editor-selection-note"><i :class="['bi', selectedBlockDefinition?.icon || 'bi-square']"></i><span>{{ selectedBlockDefinition?.label || 'Block' }} · edit its content and layout.</span></div>
      <section class="editor-inspector-section"><h3>Content</h3>
        <div v-for="field in blockContentFields" :key="field.key" class="editor-field-group">
          <label :for="`editor-block-${field.key}`">{{ field.label }}</label>
          <select v-if="field.type === 'select' || field.type === 'align'" :id="`editor-block-${field.key}`" class="editor-input" :value="blockValue(field.key)" @change="setBlockField(field, $event.target.value)"><option v-for="option in field.options || (field.type === 'align' ? ['left', 'center', 'right'] : [])" :key="typeof option === 'object' ? option.value : option" :value="typeof option === 'object' ? option.value : option">{{ typeof option === 'object' ? option.label : option }}</option></select>
          <textarea v-else-if="field.type === 'textarea'" :id="`editor-block-${field.key}`" class="editor-input" rows="4" :value="blockValue(field.key)" @input="setBlockField(field, $event.target.value)"></textarea>
          <div v-else-if="field.type === 'image'" class="editor-image-control"><img v-if="blockValue(field.key)" :src="mediaUrl(blockValue(field.key))" :alt="`${field.label} preview`" /><div class="editor-image-actions"><label class="editor-upload-button"><i class="bi bi-upload"></i>{{ uploading ? 'Uploading…' : 'Upload image' }}<input type="file" accept="image/jpeg,image/png,image/webp" hidden :disabled="uploading" @change="uploadBlockImage($event, field)" /></label><button type="button" class="editor-secondary-action" :disabled="!blockValue(field.key)" @click="setBlockField(field, '')"><i class="bi bi-eye-slash"></i>Remove image</button></div></div>
          <input v-else-if="field.type === 'color'" :id="`editor-block-${field.key}`" class="editor-color-input" type="color" :value="blockValue(field.key) || '#ffffff'" @input="setBlockField(field, $event.target.value)" />
         <input v-else :id="`editor-block-${field.key}`" class="editor-input" :type="field.type === 'number' ? 'number' : 'text'" :value="blockValue(field.key)" @input="setBlockField(field, $event.target.value)" />
          <button v-if="field.clearable" type="button" class="editor-clear-field" :disabled="!blockValue(field.key)" @click="clearBlockField(field)"><i class="bi bi-eraser"></i>Clear text</button>
        </div>
      </section>
      <section v-if="isBlockTypography" class="editor-inspector-section editor-typography-section">
        <div class="editor-section-heading-row"><h3>Text styling</h3><button type="button" class="editor-clear-field" @click="resetBlockTextStyle">Reset styling</button></div>
        <p class="editor-placement-hint">Edit text only from this panel. The canvas remains selection-only.</p>
        <div class="editor-field-group"><label :for="`editor-block-font-family-${selectedBlock.id}`">Font</label><select :id="`editor-block-font-family-${selectedBlock.id}`" class="editor-input" :value="blockStyleValue('fontFamily')" @change="setBlockTextStyle('fontFamily', $event.target.value)"><option v-for="option in TEXT_FONT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></div>
        <div class="editor-style-grid">
          <label class="editor-size-control">Size<div class="editor-range-with-number"><input type="range" min="10" max="72" step="1" :value="blockStyleValue('fontSize', selectedBlock.type === 'heading' ? 32 : 16)" aria-label="Text block size slider" @input="setBlockTextStyle('fontSize', $event.target.value)" /><input class="editor-number-input" type="number" min="10" max="72" step="1" :value="blockStyleValue('fontSize', selectedBlock.type === 'heading' ? 32 : 16)" aria-label="Text block size in pixels" @input="setBlockTextStyle('fontSize', $event.target.value)" /></div><span>{{ blockStyleValue('fontSize', selectedBlock.type === 'heading' ? 32 : 16) }} px</span></label>
          <label>Weight<select class="editor-input" :value="blockStyleValue('fontWeight', selectedBlock.type === 'heading' ? '700' : '400')" @change="setBlockTextStyle('fontWeight', $event.target.value)"><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option><option value="800">Extra bold</option></select></label>
          <label>Color<input class="editor-color-input" type="color" :value="blockStyleValue('color', selectedBlock.type === 'heading' ? '#234b67' : '#234b67')" @input="setBlockTextStyle('color', $event.target.value)" /></label>
          <label>Alignment<select class="editor-input" :value="blockStyleValue('textAlign', selectedBlock.props?.align || 'left')" @change="setBlockTextStyle('textAlign', $event.target.value)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></label>
          <label>Opacity<input type="range" min="0.2" max="1" step="0.05" :value="blockStyleValue('opacity', 1)" @input="setBlockTextStyle('opacity', Number($event.target.value))" /><span>{{ Math.round(Number(blockStyleValue('opacity', 1)) * 100) }}%</span></label>
          <label>Width<input type="range" min="25" max="100" step="5" :value="blockStyleValue('width', 100)" @input="setBlockTextStyle('width', Number($event.target.value))" /><span>{{ blockStyleValue('width', 100) }}%</span></label>
          <label>Line spacing<input type="range" min="1" max="2.2" step="0.1" :value="blockStyleValue('lineHeight', selectedBlock.type === 'heading' ? 1.2 : 1.6)" @input="setBlockTextStyle('lineHeight', Number($event.target.value))" /><span>{{ blockStyleValue('lineHeight', selectedBlock.type === 'heading' ? 1.2 : 1.6) }}</span></label>
          <label>Letter spacing<input type="range" min="0" max="6" step="0.5" :value="blockStyleValue('letterSpacing', 0)" @input="setBlockTextStyle('letterSpacing', Number($event.target.value))" /><span>{{ blockStyleValue('letterSpacing', 0) }} px</span></label>
        </div>
      </section>
      <section class="editor-inspector-section editor-simple-placement"><h3>Place on page</h3>
        <p class="editor-placement-hint">Choose where it sits, how wide it is, and the breathing room around it.</p>
        <div class="editor-field-group"><span class="editor-control-label">Alignment</span>
          <div class="editor-choice-row" role="group" aria-label="Block alignment">
            <button v-for="option in ALIGNMENT_OPTIONS" :key="option.value" type="button" :class="['editor-choice-button', { selected: simpleAlignment === option.value }]" :aria-pressed="simpleAlignment === option.value" :title="option.label" @click="setSimpleAlignment(option.value)"><i :class="['bi', option.icon]"></i><span>{{ option.value === 'center' ? 'Center' : option.value === 'left' ? 'Left' : 'Right' }}</span></button>
          </div>
        </div>
        <div class="editor-field-group"><span class="editor-control-label">Choose a width</span>
          <div class="editor-width-row" role="group" aria-label="Block width">
            <button v-for="preset in WIDTH_PRESETS" :key="preset.value" type="button" :class="['editor-width-button', { selected: simpleWidth === preset.value }]" :aria-pressed="simpleWidth === preset.value" @click="setSimpleWidth(preset)"><span class="editor-width-symbol" :style="{ width: `${Math.max(24, (preset.span / 12) * 58)}px` }"></span><span>{{ preset.label }}</span></button>
          </div>
        </div>
        <div class="editor-field-group"><span class="editor-control-label">Space around this item</span>
          <div class="editor-choice-row editor-space-row" role="group" aria-label="Block spacing">
            <button v-for="preset in SPACE_PRESETS" :key="preset.value" type="button" :class="['editor-choice-button', { selected: simpleSpace === preset.value }]" :aria-pressed="simpleSpace === preset.value" @click="setSimpleSpace(preset)">{{ preset.label }}</button>
          </div>
        </div>
      </section>
      <details class="editor-advanced"><summary>Advanced layout</summary><section class="editor-inspector-section"><h3>Layout</h3>
        <div class="editor-field-group"><label for="editor-block-width">Width</label><select id="editor-block-width" class="editor-input" :value="blockPlacement.span" @change="setBlockLayout('span', $event.target.value)"><option value="12">Full width</option><option value="9">Three quarters</option><option value="8">Two thirds</option><option value="6">Half</option><option value="4">One third</option></select></div>
        <div class="editor-field-group"><label for="editor-block-top-space">Space above (px)</label><input id="editor-block-top-space" class="editor-input" type="number" min="0" max="240" step="4" :value="blockPlacement.marginTop" @input="setBlockLayout('marginTop', $event.target.value)" /></div>
        <div class="editor-field-group"><label for="editor-block-bottom-space">Space below (px)</label><input id="editor-block-bottom-space" class="editor-input" type="number" min="0" max="240" step="4" :value="blockPlacement.marginBottom" @input="setBlockLayout('marginBottom', $event.target.value)" /></div>
        <button type="button" class="editor-secondary-action editor-full-action" @click="centerSelected"><i class="bi bi-align-center"></i>Center on page</button>
      </section></details>
      <section class="editor-inspector-section"><h3>Actions</h3><p class="editor-reorder-hint">{{ blockOrderLocation?.total > 1 ? 'Move up/down follows the page order, including between columns.' : 'Add another block to enable reordering.' }}</p><div class="editor-action-grid"><button type="button" class="editor-secondary-action" :disabled="!blockOrderLocation || blockOrderLocation.index <= 0" @click="moveSelected('up')"><i class="bi bi-arrow-up"></i>Move up</button><button type="button" class="editor-secondary-action" :disabled="!blockOrderLocation || blockOrderLocation.index >= blockOrderLocation.total - 1" @click="moveSelected('down')"><i class="bi bi-arrow-down"></i>Move down</button><button type="button" class="editor-secondary-action" @click="duplicateSelected"><i class="bi bi-copy"></i>Duplicate</button><button type="button" :class="selectedBlockHidden ? 'editor-secondary-action' : 'editor-danger-action'" @click="toggleBlockHidden"><i :class="selectedBlockHidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i>{{ selectedBlockHidden ? 'Restore block' : 'Hide block' }}</button><button type="button" class="editor-danger-action editor-full-action" @click="requestRemoveBlock"><i class="bi bi-trash3"></i>Delete block</button></div></section>
    </template>

    <template v-else-if="selectedSection">
      <div class="editor-selection-note"><i class="bi bi-layout-three-columns"></i><span>Section settings apply to all columns inside this row.</span></div>
      <section class="editor-inspector-section editor-simple-placement"><h3>Section layout</h3>
        <p class="editor-placement-hint">Choose a simple layout for everything in this row.</p>
        <div class="editor-field-group"><span class="editor-control-label">Columns</span>
          <div class="editor-section-layout-row" role="group" aria-label="Section columns">
            <button v-for="preset in SECTION_LAYOUT_PRESETS" :key="preset.value" type="button" :class="['editor-section-layout-button', { selected: sectionColumnsValue === preset.value }]" :aria-pressed="sectionColumnsValue === preset.value" @click="setSimpleSectionColumns(preset)"><i :class="['bi', preset.icon]"></i><span>{{ preset.label }}</span></button>
          </div>
        </div>
        <div class="editor-field-group"><span class="editor-control-label">Vertical space</span>
          <div class="editor-choice-row editor-section-space-row" role="group" aria-label="Section spacing">
            <button v-for="preset in SECTION_SPACE_PRESETS" :key="preset.value" type="button" :class="['editor-choice-button', { selected: sectionSpace === preset.value }]" :aria-pressed="sectionSpace === preset.value" @click="setSimpleSectionSpace(preset)">{{ preset.label }}</button>
          </div>
        </div>
      </section>
      <details class="editor-advanced"><summary>Advanced section layout</summary><section class="editor-inspector-section"><h3>Section layout</h3><div class="editor-field-group"><label for="editor-section-columns">Columns</label><select id="editor-section-columns" class="editor-input" :value="selectedSection.columns.map((column) => column.span).join('-')" @change="builder.setSectionColumns(selectedSection.id, $event.target.value.split('-').map(Number))"><option value="12">One column</option><option value="6-6">Two equal columns</option><option value="8-4">Wide left / narrow right</option><option value="4-8">Narrow left / wide right</option><option value="4-4-4">Three equal columns</option><option value="3-3-3-3">Four equal columns</option></select></div><div class="editor-field-group"><label for="editor-section-padding">Vertical spacing (px)</label><input id="editor-section-padding" class="editor-input" type="number" min="0" max="240" step="8" :value="selectedSection.props?.paddingY ?? 48" @input="setSectionProp('paddingY', $event.target.value)" /></div><div class="editor-field-group"><label for="editor-section-width">Content max width (px)</label><input id="editor-section-width" class="editor-input" type="number" min="480" max="1440" step="20" :value="selectedSection.props?.maxWidth ?? 1140" @input="setSectionProp('maxWidth', $event.target.value)" /></div><div class="editor-field-group"><label for="editor-section-background">Background</label><input id="editor-section-background" class="editor-input" :value="selectedSection.props?.bg || ''" placeholder="Optional color or image URL" @input="setSectionProp('bg', $event.target.value)" /></div></section></details>
      <section class="editor-inspector-section"><h3>Actions</h3><p class="editor-reorder-hint">{{ sectionOrderLocation?.total > 1 ? `Section ${sectionOrderLocation.index + 1} of ${sectionOrderLocation.total}.` : 'Duplicate or add another section to enable reordering.' }}</p><div class="editor-action-grid"><button type="button" class="editor-secondary-action" :disabled="!sectionOrderLocation || sectionOrderLocation.index <= 0" @click="moveSelected('up')"><i class="bi bi-arrow-up"></i>Move up</button><button type="button" class="editor-secondary-action" :disabled="!sectionOrderLocation || sectionOrderLocation.index >= sectionOrderLocation.total - 1" @click="moveSelected('down')"><i class="bi bi-arrow-down"></i>Move down</button><button type="button" class="editor-secondary-action" @click="duplicateSelected"><i class="bi bi-copy"></i>Duplicate</button><button type="button" :class="selectedSectionHidden ? 'editor-secondary-action' : 'editor-danger-action'" @click="toggleSectionHidden"><i :class="selectedSectionHidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i>{{ selectedSectionHidden ? 'Restore section' : 'Hide section' }}</button><button type="button" class="editor-danger-action editor-full-action" aria-label="Delete section" @click="requestRemoveSection"><i class="bi bi-trash3"></i>Delete section</button></div></section>
    </template>

    <div v-if="confirmDialog" class="editor-confirm-backdrop" role="presentation" tabindex="-1" @keydown.esc="confirmDialog = null" @click.self="confirmDialog = null">
      <div class="editor-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="inspector-confirm-title">
        <i class="bi bi-exclamation-triangle editor-confirm-icon"></i><h3 id="inspector-confirm-title">{{ confirmDialog.title }}</h3><p>{{ confirmDialog.message }}</p>
        <div class="editor-action-grid"><button type="button" class="editor-secondary-action" autofocus @click="confirmDialog = null">Cancel</button><button type="button" class="editor-danger-action" @click="confirmRemove">Delete</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-inspector { flex: 1; overflow-y: auto; padding: 18px 17px 28px; color: #234b67; font-family: Nunito, system-ui, sans-serif; }
.editor-kicker { color: #17656a; font-size: 0.64rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
.editor-inspector-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding-bottom: 13px; border-bottom: 1px solid #e6eef2; }
.editor-inspector-heading h2 { margin: 2px 0 0; color: #173f5f; font-size: 1.18rem; line-height: 1.15; }
.editor-inspector-close { width: 29px; height: 29px; border: 1px solid #dce8f0; border-radius: 7px; background: #fff; color: #7893a3; cursor: pointer; }
.editor-inspector-close:hover { color: #c2413e; border-color: #efb7b5; }
.editor-selection-actions { position: sticky; top: 0; z-index: 5; display: grid; grid-template-columns: repeat(auto-fit, minmax(102px, 1fr)); gap: 7px; margin: -1px -17px 14px; padding: 10px 17px 11px; border-bottom: 1px solid #dce8f0; background: rgba(255, 255, 255, .98); box-shadow: 0 5px 12px rgba(31, 78, 107, .08); }
.editor-selection-actions-label { grid-column: 1 / -1; color: #17656a; font-size: .62rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
.editor-selection-note { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0; padding: 10px; border: 1px solid #cde9eb; border-radius: 8px; background: #f0fbfb; color: #477684; font-size: 0.71rem; line-height: 1.4; }
.editor-selection-note i { color: #3bafb8; }
.editor-empty-inspector { display: grid; justify-items: center; gap: 7px; padding: 54px 18px; color: #7893a3; text-align: center; }
.editor-empty-inspector i { color: #3bafb8; font-size: 2.2rem; }
.editor-empty-inspector strong { color: #45687c; font-size: 0.84rem; }
.editor-empty-inspector p { margin: 0; font-size: 0.72rem; line-height: 1.5; }
.editor-inspector-section { padding: 15px 0; border-bottom: 1px solid #e6eef2; }
.editor-advanced { margin-top: 12px; border-top: 1px solid #e6eef2; border-bottom: 1px solid #e6eef2; }
.editor-advanced summary { padding: 12px 0; color: #557285; cursor: pointer; font-size: .72rem; font-weight: 900; list-style: none; }
.editor-advanced summary::before { content: '+'; display: inline-grid; width: 19px; height: 19px; margin-right: 6px; place-items: center; border: 1px solid #cde9eb; border-radius: 5px; color: #237f86; }
.editor-advanced[open] summary::before { content: '−'; }
.editor-inspector-section h3 { margin: 0 0 11px; color: #557285; font-size: 0.69rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
.editor-section-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.editor-section-heading-row h3 { margin-bottom: 0; }
.editor-style-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.editor-style-grid > label { display: grid; gap: 4px; color: #557285; font-size: .68rem; font-weight: 800; }
.editor-style-grid input[type='range'] { width: 100%; accent-color: #3bafb8; }
.editor-range-with-number { display: grid; grid-template-columns: minmax(0, 1fr) 54px; align-items: center; gap: 7px; }
.editor-range-with-number input[type='range'] { min-width: 0; }
.editor-number-input { width: 54px; min-height: 28px; box-sizing: border-box; padding: 4px 5px; border: 1px solid #d4e4eb; border-radius: 6px; background: #fff; color: #294f66; font: inherit; font-size: .68rem; }
.editor-number-input:focus { outline: 0; border-color: #3bafb8; box-shadow: 0 0 0 3px rgba(59, 175, 184, 0.13); }
.editor-style-grid label > span, .editor-range-value { color: #8aa0af; font-size: .62rem; font-weight: 700; }
.editor-style-spacing { margin-top: 9px; }
.editor-image-width-group { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 6px 10px; }
.editor-image-width-group label { grid-column: 1 / -1; }
.editor-image-width-group input[type='range'] { width: 100%; accent-color: #3bafb8; }
.editor-field-group { display: grid; gap: 5px; margin-bottom: 11px; }
.editor-field-group label { color: #557285; font-size: 0.73rem; font-weight: 800; }
.editor-simple-placement { display: grid; gap: 2px; background: linear-gradient(135deg, rgba(240, 251, 251, .72), rgba(255, 255, 255, 0)); }
.editor-placement-hint { margin: -2px 0 10px; color: #6d8795; font-size: .7rem; line-height: 1.42; }
.editor-reorder-hint { margin: -3px 0 9px; color: #6d8795; font-size: .68rem; line-height: 1.4; }
.editor-control-label { color: #557285; font-size: .73rem; font-weight: 800; }
.editor-choice-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.editor-space-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.editor-section-space-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.editor-choice-button, .editor-width-button, .editor-section-layout-button { min-height: 42px; border: 1px solid #d4e4eb; border-radius: 8px; background: #fff; color: #557285; cursor: pointer; font: inherit; font-size: .68rem; font-weight: 800; line-height: 1.15; }
.editor-choice-button { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 6px 4px; }
.editor-choice-button i { color: #5a91aa; font-size: 1rem; }
.editor-width-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.editor-width-button { display: grid; grid-template-columns: 66px 1fr; align-items: center; gap: 6px; padding: 7px 8px; text-align: left; }
.editor-width-symbol { display: block; height: 8px; max-width: 58px; border-radius: 99px; background: #b8d9df; transition: background .15s ease, width .15s ease; }
.editor-section-layout-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.editor-section-layout-button { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 7px 4px; }
.editor-section-layout-button i { color: #5a91aa; font-size: .95rem; }
.editor-choice-button:hover, .editor-width-button:hover, .editor-section-layout-button:hover { border-color: #8acfd1; background: #f5fdfd; color: #237f86; }
.editor-choice-button.selected, .editor-width-button.selected, .editor-section-layout-button.selected { border-color: #3bafb8; background: #dff5f5; color: #17656a; box-shadow: inset 0 0 0 1px rgba(59, 175, 184, .16); }
.editor-choice-button.selected i, .editor-section-layout-button.selected i { color: #237f86; }
.editor-width-button.selected .editor-width-symbol { background: #3bafb8; }
.editor-choice-button:focus-visible, .editor-width-button:focus-visible, .editor-section-layout-button:focus-visible { outline: 3px solid rgba(59, 175, 184, .24); outline-offset: 1px; }
.editor-checkbox-row { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 8px 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; color: #557285; font-size: 0.74rem; font-weight: 700; }
.editor-checkbox-row input { accent-color: #3bafb8; }
.editor-input { width: 100%; box-sizing: border-box; min-height: 34px; padding: 8px 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; color: #294f66; font: inherit; font-size: 0.76rem; }
.editor-input:focus { outline: 0; border-color: #3bafb8; box-shadow: 0 0 0 3px rgba(59, 175, 184, 0.13); }
.editor-color-input { width: 100%; height: 36px; padding: 2px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; }
.editor-error { color: #c2413e; font-size: 0.68rem; }
.editor-text-field-actions { display: flex; justify-content: flex-start; margin-top: 2px; }
.editor-inspector-actions, .editor-action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 13px; }
.editor-secondary-action, .editor-danger-action, .editor-upload-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 33px; padding: 7px 9px; border: 1px solid #d4e4eb; border-radius: 7px; background: #fff; color: #557285; cursor: pointer; font: inherit; font-size: 0.7rem; font-weight: 800; }
.editor-secondary-action:hover:not(:disabled) { border-color: #7fc8ca; background: #f0fbfb; color: #237f86; }
.editor-secondary-action:disabled { opacity: 0.4; cursor: not-allowed; }
.editor-clear-field { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 0; border: 0; background: transparent; color: #b3413e; cursor: pointer; font: inherit; font-size: 0.68rem; font-weight: 800; }
.editor-clear-field:disabled { opacity: 0.45; cursor: not-allowed; }
.editor-danger-action { border-color: #efc5c3; background: #fff8f7; color: #b3413e; }
.editor-danger-action:hover { border-color: #e49b98; background: #fff0ef; color: #9f2f2c; }
.editor-full-action { width: 100%; }
.editor-image-control { display: grid; gap: 8px; }
.editor-image-control img { width: 100%; max-height: 150px; object-fit: contain; border: 1px solid #dce8f0; border-radius: 8px; background: #f6fafc; }
.editor-image-removed { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 70px; border: 1px dashed #b6c9d3; border-radius: 8px; background: #f5f8fa; color: #4d6373; font-size: 0.72rem; font-weight: 800; }
.editor-image-removed i { color: #3bafb8; }
.editor-text-removed { display: flex; align-items: center; gap: 7px; padding: 8px 9px; border: 1px dashed #b6c9d3; border-radius: 7px; background: #f5f8fa; color: #4d6373; font-size: 0.72rem; font-weight: 800; }
.editor-text-removed i { color: #3bafb8; }
.editor-image-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.editor-upload-button { position: relative; overflow: hidden; border-color: #9bd5d7; background: #f0fbfb; color: #237f86; }
.editor-upload-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.editor-confirm-backdrop { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 18px; background: rgba(23, 63, 95, .3); }
.editor-confirm-dialog { width: min(340px, 100%); padding: 20px; border: 1px solid #dce8f0; border-radius: 12px; background: #fff; box-shadow: 0 18px 48px rgba(24, 70, 95, .25); color: #557285; text-align: center; }
.editor-confirm-dialog h3 { margin: 8px 0 0; color: #173f5f; font-size: .95rem; }
.editor-confirm-dialog p { margin: 8px 0 13px; font-size: .72rem; line-height: 1.45; }
.editor-confirm-dialog .editor-confirm-icon { display: block; margin: 0 auto; color: #b3413e; font-size: 1.5rem; }
</style>
