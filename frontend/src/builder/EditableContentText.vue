<script setup>
// Database-backed category, topic, and material copy uses this component so
// administrators can edit it exactly where visitors see it. The component
// never accepts an arbitrary field name: contentTextBindings owns that list.
import { computed, getCurrentInstance, nextTick, ref, useAttrs, watch } from 'vue';
import { useBuilderStore } from './store';
import {
  contentTextValue,
  isContentTextBinding,
} from './contentTextBindings';

const props = defineProps({
  entity: { type: String, required: true },
  item: { type: Object, required: true },
  field: { type: String, required: true },
  tag: { type: String, default: 'span' },
  placeholder: { type: String, default: 'Text…' },
  label: { type: String, default: '' },
});
defineOptions({ inheritAttrs: false });

const builder = useBuilderStore();
const attrs = useAttrs();
const elementRef = ref(null);
const inlineError = ref('');
const floatingStyle = ref({});
// Script-setup variables are recreated for every component instance. Vue's
// component uid is the stable per-instance identity needed when the same
// category or material is rendered in the header, page, and footer together.
const instanceId = 'editable-content-' + String(
  getCurrentInstance()?.uid ?? [props.entity, props.item?.id, props.field].join('-')
);

const binding = computed(() => ({
  entity: props.entity,
  id: props.item?.id,
  field: props.field,
  instanceId,
}));
const canEditInline = computed(() => (
  builder.editMode && builder.canEdit
  && isContentTextBinding(props.entity, props.field)
  && Boolean(builder.contentItem(props.entity, props.item?.id))
));
const value = computed(() => contentTextValue(props.item, props.entity, props.field));
const isSelected = computed(() => (
  canEditInline.value
  && builder.selectedContentText?.entity === props.entity
  && String(builder.selectedContentText?.id) === String(props.item?.id)
  && builder.selectedContentText?.field === props.field
  && builder.selectedContentText?.instanceId === instanceId
));
const contentId = computed(() => `${props.entity}:${props.item?.id}:${props.field}`);

function updateFloatingPosition() {
  const element = elementRef.value;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  floatingStyle.value = {
    top: `${Math.max(8, Math.min(window.innerHeight - 36, rect.bottom + 5))}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - 150, rect.right - 132))}px`,
  };
}

function beginInlineEdit(event) {
  if (!canEditInline.value) return;
  event?.preventDefault();
  event?.stopPropagation();
  inlineError.value = '';
  builder.beginInlineContentEdit(binding.value);
  nextTick(updateFloatingPosition);
}

function updateInlineText(event) {
  if (!canEditInline.value) return;
  inlineError.value = '';
  builder.setInlineContentText(binding.value, event.currentTarget.innerText || '');
}

function finishInlineEdit(event) {
  if (!canEditInline.value) return;
  const result = builder.commitInlineContentEdit();
  inlineError.value = result.error || '';
  if (result.error && event?.currentTarget) event.currentTarget.innerText = value.value;
}

function cancelInlineEdit(event) {
  if (!canEditInline.value) return;
  const canceled = builder.cancelInlineContentEdit();
  if (!canceled) return;
  inlineError.value = '';
  if (elementRef.value) elementRef.value.innerText = value.value;
  event?.currentTarget?.blur?.();
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

function keydownInline(event) {
  if (!canEditInline.value) return;
  // Text inside links and menu triggers must never activate those visitor
  // actions while an administrator is typing.
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelInlineEdit(event);
    return;
  }
  if (!['p', 'div'].includes(props.tag.toLowerCase()) && event.key === 'Enter') event.preventDefault();
}

function selectWithKeyboard(event) {
  if (canEditInline.value || (event.key !== 'Enter' && event.key !== ' ')) return;
  beginInlineEdit(event);
}

function openMoreOptions(event) {
  event.preventDefault();
  event.stopPropagation();
  if (inlineError.value) return;
  const result = builder.commitInlineContentEdit();
  if (result.error) {
    inlineError.value = result.error;
    return;
  }
  window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { ...binding.value, inline: false },
  }));
}

watch(isSelected, (selected) => {
  if (selected) nextTick(updateFloatingPosition);
});
</script>

<template>
  <component
    :is="tag"
    ref="elementRef"
    v-bind="attrs"
    :class="[
      'editable-content-text',
      {
        'is-editable': canEditInline,
        'is-selected': isSelected,
      },
    ]"
    :data-editor-content="contentId"
    :data-placeholder="placeholder"
    :contenteditable="canEditInline ? 'true' : undefined"
    :spellcheck="canEditInline"
    :aria-label="label || undefined"
    @click="beginInlineEdit"
    @focus="beginInlineEdit"
    @input="updateInlineText"
    @blur="finishInlineEdit"
    @paste="cleanPaste"
    @keydown="selectWithKeyboard"
    @keydown.capture="keydownInline"
  >{{ value }}</component>
  <Teleport to="body">
    <button
      v-if="isSelected"
      type="button"
      class="editable-content-more"
      aria-label="Open content options"
      :style="floatingStyle"
      @mousedown.prevent
      @click="openMoreOptions"
    >
      <i class="bi bi-sliders"></i> More options
    </button>
    <span v-if="inlineError" class="editable-content-error" :style="floatingStyle" role="alert">{{ inlineError }}</span>
  </Teleport>
</template>

<style scoped>
.editable-content-text {
  outline: none;
  position: relative;
  transition: box-shadow .15s ease, background .15s ease;
}
.editable-content-text.is-editable {
  cursor: text;
  border-radius: 6px;
}
.editable-content-text.is-editable:hover,
.editable-content-text.is-selected {
  box-shadow: 0 0 0 2px rgba(59, 175, 184, .72);
  background: rgba(59, 175, 184, .06);
}
.editable-content-text.is-editable:focus-visible {
  outline: 2px solid #2e7d9a;
  outline-offset: 2px;
}
.editable-content-text.is-editable:empty::before {
  content: attr(data-placeholder);
  opacity: .48;
}
.editable-content-more {
  position: fixed;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  border: 1px solid #8acbd1;
  border-radius: 999px;
  padding: 3px 7px;
  background: #fff;
  color: #17656a;
  box-shadow: 0 3px 10px rgba(23, 101, 106, .16);
  cursor: pointer;
  font: 800 .68rem/1 system-ui, sans-serif;
  white-space: nowrap;
}
.editable-content-more:hover,
.editable-content-more:focus-visible {
  background: #e5f7f7;
}
.editable-content-error {
  position: fixed;
  z-index: 21;
  transform: translateY(30px);
  min-width: max-content;
  max-width: min(280px, 80vw);
  border-radius: 5px;
  padding: 4px 7px;
  background: #fff1f0;
  color: #a4312d;
  font: 700 .7rem/1.35 system-ui, sans-serif;
}
</style>
