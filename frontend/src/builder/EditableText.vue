<script setup>
// Legacy canvas blocks now use the same direct-editing contract as the v2
// document: text stays plain, a whole typing session is one undo step, and
// pasted content never carries foreign HTML or styling into the site.
import { computed, onMounted, ref } from 'vue';
import { useBuilderStore } from './store';

const props = defineProps({
  modelValue: { type: String, default: '' },
  tag: { type: String, default: 'span' },
  selectId: { type: String, default: '' },
  placeholder: { type: String, default: 'Text…' },
});

const emit = defineEmits(['update:modelValue', 'commit']);
const builder = useBuilderStore();
const elementRef = ref(null);
const nestedInteractive = ref(false);
const isDirectlyEditable = computed(() => builder.editMode && builder.canEdit);
const isFocusableInEditor = computed(() => isDirectlyEditable.value && !nestedInteractive.value);
const exposesButtonRole = computed(() => !isDirectlyEditable.value && isFocusableInEditor.value && !/^h[1-6]$/i.test(props.tag));

function selectText(event) {
  if (!builder.editMode || !builder.canEdit) return;
  // A span inside an existing link or button must not trigger that protected
  // visitor action while the administrator is typing. Preventing the click
  // here does not prevent the contenteditable element from receiving focus.
  if (nestedInteractive.value) event?.preventDefault();
  event?.stopPropagation();
  if (props.selectId) builder.select(props.selectId);
}

function beginTextEdit(event) {
  selectText(event);
  if (isDirectlyEditable.value) builder.beginHistory();
}

function updateText(event) {
  if (!isDirectlyEditable.value) return;
  emit('update:modelValue', event.currentTarget.innerText || '');
}

function finishTextEdit() {
  if (!isDirectlyEditable.value) return;
  builder.commitHistory();
  emit('commit');
}

function cleanPaste(event) {
  if (!isDirectlyEditable.value) return;
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
  // Some browsers do not dispatch an input event for execCommand. Reading
  // innerText keeps only text and line breaks regardless of that detail.
  queueMicrotask(() => emit('update:modelValue', target.innerText || ''));
}

function selectWithKeyboard(event) {
  if (isDirectlyEditable.value) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectText(event);
}

onMounted(() => {
  nestedInteractive.value = Boolean(elementRef.value?.closest('a,button'));
});
</script>

<template>
  <component
    :is="tag"
    ref="elementRef"
    :class="['editable-text', { 'is-editable': builder.editMode && builder.canEdit, 'is-selected': builder.editMode && builder.canEdit && builder.selectedId === selectId }]"
    :data-placeholder="placeholder"
    :tabindex="isFocusableInEditor ? 0 : undefined"
    :role="exposesButtonRole ? 'button' : undefined"
    :contenteditable="isDirectlyEditable ? 'true' : undefined"
    :spellcheck="isDirectlyEditable"
    @click="beginTextEdit"
    @keydown="selectWithKeyboard"
    @focus="beginTextEdit"
    @input="updateText"
    @blur="finishTextEdit"
    @paste="cleanPaste"
  >{{ modelValue }}</component>
</template>

<style scoped>
.editable-text {
  outline: none;
  position: relative;
  transition: box-shadow 0.15s ease, background 0.15s ease;
}
.editable-text.is-editable {
  cursor: text;
  border-radius: 6px;
}
.editable-text.is-editable:hover,
.editable-text.is-selected {
  box-shadow: 0 0 0 2px rgba(59, 175, 184, 0.72);
  background: rgba(59, 175, 184, 0.06);
}
.editable-text.is-editable:focus-visible { outline: 2px solid #2e7d9a; outline-offset: 2px; }
.editable-text.is-editable:empty::before {
  content: attr(data-placeholder);
  opacity: 0.45;
}
</style>
