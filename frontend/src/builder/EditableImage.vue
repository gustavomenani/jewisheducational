<script setup>
// Existing template images keep their safe layout position, while allowing an
// administrator to replace, resize, describe or hide them directly on the
// preview. New v2 images also expose responsive column alignment in their
// own local controls.
import { computed, onMounted, ref } from 'vue';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useBuilderStore } from './store';
import { fieldByKey } from './fieldCatalog';

const props = defineProps({
  settingKey: { type: String, required: true },
  default: { type: String, default: '' },
  alt: { type: String, default: '' },
  altSettingKey: { type: String, default: '' },
  defaultAlt: { type: String, default: '' },
  label: { type: String, default: '' },
  allowRemove: { type: Boolean, default: true },
  imgClass: { type: [String, Array, Object], default: '' },
  loading: { type: String, default: 'lazy' },
});

const builder = useBuilderStore();
const elementRef = ref(null);
const nestedInteractive = ref(false);
const uploading = ref(false);
const uploadError = ref('');
const isFocusableInEditor = computed(() => builder.editMode && builder.canEdit && !nestedInteractive.value);
const value = computed(() => builder.settingValue(props.settingKey, props.default));
const visibilityKey = computed(() => `${props.settingKey}_show`);
const removed = computed(() => {
  const state = builder.settingValue(visibilityKey.value, 'true');
  return state === false || state === 'false';
});
const src = computed(() => removed.value ? '' : mediaUrl(value.value));
const resolvedAlt = computed(() => props.altSettingKey
  ? builder.settingValue(props.altSettingKey, props.defaultAlt || props.alt)
  : props.alt);
const metadata = computed(() => {
  const catalogField = fieldByKey(props.settingKey);
  return {
    ...(catalogField || {}),
    key: props.settingKey,
    label: props.label || catalogField?.label || 'Image',
    type: 'image',
    default: props.default || catalogField?.default || '',
    altSettingKey: props.altSettingKey,
    defaultAlt: props.defaultAlt || props.alt,
    widthKey: `${props.settingKey}_width`,
    visibilityKey: visibilityKey.value,
    allowRemove: props.allowRemove,
  };
});
const widthPct = computed(() => {
  const n = Number(builder.settingValue(`${props.settingKey}_width`, ''));
  return n >= 25 && n <= 100 ? n : null;
});
const imgStyle = computed(() => widthPct.value
  ? { width: `${widthPct.value}%`, maxWidth: '100%', height: 'auto' }
  : null);
const selected = computed(() => builder.editMode && builder.canEdit && builder.selectedSetting?.key === props.settingKey);

function selectImage(event) {
  if (!builder.editMode || !builder.canEdit) return;
  if (nestedInteractive.value) event?.preventDefault();
  event?.stopPropagation();
  builder.selectSetting(metadata.value);
}

function selectWithKeyboard(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectImage(event);
}

async function uploadImage(event) {
  const file = event.target.files?.[0];
  if (!file || !builder.editMode || !builder.canEdit) return;
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'Choose an image up to 10 MB.';
    event.target.value = '';
    return;
  }
  uploadError.value = '';
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/settings/upload', form);
    builder.trackPendingMediaUpload(data.url);
    builder.setSetting(props.settingKey, data.url);
    builder.setSetting(visibilityKey.value, 'true');
  } catch (error) {
    uploadError.value = error.response?.data?.error || 'Could not upload this image.';
  } finally {
    uploading.value = false;
    event.target.value = '';
  }
}

function updateWidth(event) {
  builder.setSetting(`${props.settingKey}_width`, String(Math.min(100, Math.max(25, Number(event.target.value) || 100))), { record: false });
}

function beginImageInlineChange() {
  builder.beginInlineSettingEdit();
}

function finishImageInlineChange() {
  builder.commitInlineSettingEdit();
}

function updateAlt(event) {
  builder.setSetting(props.altSettingKey, event.target.value, { record: false });
}

function hideImage() {
  if (!props.allowRemove) return;
  builder.setSetting(visibilityKey.value, 'false');
}

function restoreImage() {
  builder.setSetting(visibilityKey.value, 'true');
}

onMounted(() => {
  nestedInteractive.value = Boolean(elementRef.value?.closest('a,button'));
});
</script>

<template>
  <span
    ref="elementRef"
    class="editable-image"
    :class="{
      'is-editable': builder.editMode && builder.canEdit,
      'is-removed': removed,
      'is-selected': builder.editMode && builder.canEdit && builder.selectedSetting?.key === settingKey,
    }"
    :tabindex="isFocusableInEditor ? 0 : undefined"
    :role="isFocusableInEditor ? 'button' : undefined"
    @click="selectImage"
    @keydown="selectWithKeyboard"
    >
    <img v-if="src" :src="src" :alt="resolvedAlt" :class="imgClass" :loading="loading" :style="imgStyle" />
    <span v-else-if="builder.editMode && builder.canEdit" class="editable-image-removed" aria-label="Image removed">
      <i class="bi bi-image"></i><span>Image hidden</span>
    </span>
    <span v-if="selected" class="editable-image-actions" role="toolbar" aria-label="Image controls" @click.stop>
      <label class="editable-image-change" :title="uploading ? 'Uploading image' : 'Replace image'">
        <i :class="uploading ? 'bi bi-arrow-repeat' : 'bi bi-image'"></i><span>{{ uploading ? 'Uploading' : 'Replace' }}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" @change="uploadImage" />
      </label>
      <label class="editable-image-size"><span>Size</span><input type="range" min="25" max="100" step="5" :value="widthPct || 100" @pointerdown="beginImageInlineChange" @focus="beginImageInlineChange" @input="updateWidth" @change="finishImageInlineChange" /></label>
      <label v-if="altSettingKey" class="editable-image-alt"><span>Alt text</span><input type="text" :value="resolvedAlt" @focus="beginImageInlineChange" @input="updateAlt" @blur="finishImageInlineChange" /></label>
      <button v-if="removed" type="button" title="Show image" @click="restoreImage"><i class="bi bi-eye"></i></button>
      <button v-else-if="allowRemove" type="button" title="Hide image" @click="hideImage"><i class="bi bi-eye-slash"></i></button>
    </span>
    <small v-if="selected && uploadError" class="editable-image-error" role="alert">{{ uploadError }}</small>
  </span>
</template>

<style scoped>
.editable-image { position: relative; display: inline-block; max-width: 100%; }
.editable-image.is-editable { cursor: pointer; }
.editable-image-removed {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-width: 120px;
  min-height: 56px;
  padding: 0.7rem 1rem;
  border: 1px dashed #b6c9d3;
  border-radius: 8px;
  color: #4d6373;
  background: #f5f8fa;
  font-size: 0.75rem;
  font-weight: 700;
}
.editable-image-removed i { color: #3bafb8; font-size: 1rem; }
.editable-image.is-editable::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  box-shadow: inset 0 0 0 2px rgba(59, 175, 184, 0);
  transition: box-shadow 0.15s ease;
  pointer-events: none;
}
.editable-image.is-editable:hover::after,
.editable-image.is-selected::after {
  box-shadow: inset 0 0 0 2px rgba(59, 175, 184, 0.9);
}
.editable-image.is-editable:focus-visible { outline: 2px solid #2e7d9a; outline-offset: 2px; }
.editable-image-actions {
  position: absolute;
  z-index: 10;
  top: -36px;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(520px, 85vw);
  padding: 4px;
  border: 1px solid #b7e1e2;
  border-radius: 8px;
  background: #fff;
  color: #416375;
  box-shadow: 0 8px 20px rgba(31, 78, 107, .16);
  font: 800 .62rem Nunito, system-ui, sans-serif;
}
.editable-image-change { position: relative; display: inline-flex; align-items: center; gap: 4px; min-height: 26px; padding: 4px 7px; border: 1px solid #9bd6d7; border-radius: 6px; background: #effbfb; color: #17656a; cursor: pointer; }
.editable-image-change input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.editable-image-size { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.editable-image-size input { width: 58px; accent-color: #3bafb8; }
.editable-image-alt { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.editable-image-alt input { width: min(145px, 22vw); min-height: 26px; padding: 3px 6px; border: 1px solid #c8dde1; border-radius: 6px; color: #365a70; font: inherit; }
.editable-image-actions button { display: grid; width: 27px; height: 27px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #a23d39; cursor: pointer; }
.editable-image-actions button:hover { border-color: #efc5c3; background: #fff3f2; }
.editable-image-error { position: absolute; z-index: 11; top: -58px; right: 0; padding: 4px 7px; border-radius: 5px; background: #fff3f2; color: #a23d39; font: 800 .62rem Nunito, system-ui, sans-serif; white-space: nowrap; }
@media (max-width: 760px) {
  .editable-image-actions { position: relative; top: auto; right: auto; flex-wrap: wrap; margin-top: 5px; }
  .editable-image-error { position: relative; top: auto; right: auto; display: block; margin-top: 4px; white-space: normal; }
}
</style>
