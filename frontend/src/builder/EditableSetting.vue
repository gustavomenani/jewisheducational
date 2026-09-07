<script setup>
// Public text keeps its existing template placement, but administrators edit
// the words directly in the preview. Only plain text is persisted; the
// inspector remains available for the deliberately less-common controls.
import { computed, onMounted, ref } from 'vue';
import { useBuilderStore } from './store';
import { fieldByKey } from './fieldCatalog';

const props = defineProps({
  settingKey: { type: String, required: true },
  default: { type: String, default: '' },
  tag: { type: String, default: 'span' },
  placeholder: { type: String, default: 'Text…' },
  label: { type: String, default: '' },
  type: { type: String, default: '' },
  linkKey: { type: String, default: '' },
  defaultLink: { type: String, default: '' },
  allowRemove: { type: Boolean, default: true },
});

const builder = useBuilderStore();
const elementRef = ref(null);
const nestedInteractive = ref(false);
const isFocusableInEditor = computed(() => builder.editMode && builder.canEdit && !nestedInteractive.value);
const canEditInline = computed(() => {
  if (!builder.editMode || !builder.canEdit || removed.value) return false;
  return !['boolean', 'color', 'image', 'select', 'align'].includes(String(metadata.value.type || 'text'));
});
const exposesButtonRole = computed(() => !canEditInline.value && isFocusableInEditor.value && !/^h[1-6]$/i.test(props.tag));
const visibilityKey = computed(() => `${props.settingKey}_show`);
const removed = computed(() => {
  const state = builder.settingValue(visibilityKey.value, 'true');
  return state === false || state === 'false';
});
const value = computed(() => removed.value ? '' : builder.settingValue(props.settingKey, props.default));
const metadata = computed(() => {
  const catalogField = fieldByKey(props.settingKey);
  return {
    ...(catalogField || {}),
    key: props.settingKey,
    label: props.label || catalogField?.label || props.settingKey.replaceAll('_', ' '),
    type: props.type || catalogField?.type || (props.tag === 'p' ? 'textarea' : 'text'),
    tag: props.tag,
    default: props.default || catalogField?.default || '',
    linkKey: props.linkKey || catalogField?.linkKey || '',
    defaultLink: props.defaultLink || catalogField?.defaultLink || '',
    visibilityKey: visibilityKey.value,
    allowRemove: props.allowRemove,
  };
});

const FONT_FAMILIES = new Set([
  'Nunito, system-ui, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  'Trebuchet MS, sans-serif',
]);
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);
const WEIGHTS = new Set(['400', '500', '600', '700', '800']);

function settingValue(suffix) {
  return builder.settingValue(`${props.settingKey}_${suffix}`, '');
}

const textStyle = computed(() => {
  const style = {};
  const family = String(settingValue('font_family') || '');
  const size = Number(settingValue('font_size'));
  const weight = String(settingValue('font_weight') || '');
  const color = String(settingValue('color') || '');
  const align = String(settingValue('text_align') || '');
  const opacity = Number(settingValue('opacity'));
  const width = Number(settingValue('width'));
  const lineHeight = Number(settingValue('line_height'));
  const letterSpacing = Number(settingValue('letter_spacing'));
  const marginTop = Number(settingValue('margin_top'));
  const marginBottom = Number(settingValue('margin_bottom'));

  if (FONT_FAMILIES.has(family)) style.fontFamily = family;
  // The Hero title already reaches 48 px at its template default. Keep room
  // above that value so the inspector can make large layout text visibly larger.
  if (size >= 10 && size <= 72) style.fontSize = `${size}px`;
  if (WEIGHTS.has(weight)) style.fontWeight = weight;
  if (/^#[\da-f]{3,8}$/i.test(color)) style.color = color;
  if (ALIGNMENTS.has(align)) style.textAlign = align;
  if (opacity >= 0.2 && opacity <= 1) style.opacity = opacity;
  if (width >= 25 && width <= 100) {
    style.width = `${width}%`;
    style.maxWidth = '100%';
    style.display = 'inline-block';
  }
  if (lineHeight >= 1 && lineHeight <= 2.2) style.lineHeight = lineHeight;
  if (letterSpacing >= 0 && letterSpacing <= 6) style.letterSpacing = `${letterSpacing}px`;
  if (marginTop >= 0 && marginTop <= 48) style.marginTop = `${marginTop}px`;
  if (marginBottom >= 0 && marginBottom <= 48) style.marginBottom = `${marginBottom}px`;
  if (props.tag === 'p') style.whiteSpace = 'pre-line';
  return style;
});

function startEdit(event) {
  if (!builder.editMode || !builder.canEdit) return;
  // Prevent navigation from links while allowing parent menus/buttons to
  // receive the same click and keep their normal open/close behavior.
  if (nestedInteractive.value) event?.preventDefault();
  event?.stopPropagation();
  builder.selectSetting(metadata.value);
}

function beginInlineEdit(event) {
  startEdit(event);
  if (canEditInline.value) builder.beginInlineSettingEdit();
}

function updateInlineText(event) {
  if (!canEditInline.value) return;
  const text = event.currentTarget.innerText || '';
  builder.setSetting(props.settingKey, text, { record: false });
  if (removed.value && text.trim()) builder.setSetting(visibilityKey.value, 'true', { record: false });
}

function finishInlineEdit() {
  if (!canEditInline.value) return;
  builder.commitInlineSettingEdit();
}

function cleanPaste(event) {
  if (!canEditInline.value) return;
  event.preventDefault();
  const plainText = event.clipboardData?.getData('text/plain') || '';
  const target = event.currentTarget;
  if (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('insertText')) {
    document.execCommand('insertText', false, plainText);
  } else {
    const selection = window.getSelection?.();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(plainText);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
  queueMicrotask(() => updateInlineText({ currentTarget: target }));
}

function selectWithKeyboard(event) {
  if (canEditInline.value) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  startEdit(event);
}

function keydownInline(event) {
  if (!canEditInline.value) return;
  if ((props.tag !== 'p' && props.tag !== 'div') && event.key === 'Enter') event.preventDefault();
}

onMounted(() => {
  nestedInteractive.value = Boolean(elementRef.value?.closest('a,button'));
});
</script>

<template>
  <component
    :is="tag"
    ref="elementRef"
    :class="[
      'editable-setting',
      {
        'is-editable': builder.editMode && builder.canEdit,
        'is-removed': removed,
        'is-selected': builder.editMode && builder.canEdit && builder.selectedSetting?.key === settingKey,
      }
    ]"
    :style="textStyle"
    :data-editor-setting="settingKey"
    :data-placeholder="placeholder"
    :tabindex="isFocusableInEditor ? 0 : undefined"
    :role="exposesButtonRole ? 'button' : undefined"
    :contenteditable="canEditInline ? 'true' : undefined"
    :spellcheck="canEditInline"
    @click="beginInlineEdit"
    @keydown="selectWithKeyboard"
    @focus="beginInlineEdit"
    @input="updateInlineText"
    @blur="finishInlineEdit"
    @paste="cleanPaste"
    @keydown.capture="keydownInline"
  >{{ value }}</component>
</template>

<style scoped>
.editable-setting {
  outline: none;
  position: relative;
  transition: box-shadow 0.15s ease, background 0.15s ease;
}
.editable-setting.is-editable {
  cursor: text;
  border-radius: 6px;
}
.editable-setting.is-editable:hover,
.editable-setting.is-selected {
  box-shadow: 0 0 0 2px rgba(59, 175, 184, 0.72);
  background: rgba(59, 175, 184, 0.06);
}
.editable-setting.is-editable:not(.is-removed):empty::before {
  content: attr(data-placeholder);
  opacity: 0.45;
}
.editable-setting.is-editable:focus-visible { outline: 2px solid #2e7d9a; outline-offset: 2px; }
</style>
