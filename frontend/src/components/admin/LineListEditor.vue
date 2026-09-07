<script setup>
// Editor de lista simples: cada linha vira um item com marcador (bolinha) e
// botão de remover, em vez de editar texto corrido num textarea. Continua
// salvando como texto com quebra de linha (mesmo formato de sempre).
import { ref, computed } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Add item...' },
  inputId: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const newItem = ref('');

const items = computed(() =>
  (props.modelValue || '').split('\n').map((s) => s.trim()).filter(Boolean)
);

function emitItems(list) {
  emit('update:modelValue', list.join('\n'));
}

function addItem() {
  const value = newItem.value.trim();
  if (!value) return;
  if (items.value.includes(value)) {
    newItem.value = '';
    return;
  }
  emitItems([...items.value, value]);
  newItem.value = '';
}

function removeItem(index) {
  const next = items.value.filter((_, i) => i !== index);
  emitItems(next);
}
</script>

<template>
  <div class="line-list-editor">
    <ul v-if="items.length" class="line-list">
      <li v-for="(item, index) in items" :key="`${item}-${index}`">
        <span class="line-list-dot" aria-hidden="true"></span>
        <span class="line-list-text">{{ item }}</span>
        <button type="button" class="line-list-remove" :aria-label="`Remove ${item}`" @click="removeItem(index)">
          <i class="bi bi-x-lg"></i>
        </button>
      </li>
    </ul>
    <p v-else class="line-list-empty">No items have been added yet.</p>

    <div class="line-list-add">
      <input
        :id="inputId || undefined"
        v-model="newItem"
        type="text"
        class="form-control"
        :placeholder="placeholder"
        @keydown.enter.prevent="addItem"
      />
      <button type="button" class="btn btn-outline-primary" @click="addItem">
        <i class="bi bi-plus-lg me-1"></i>Add
      </button>
    </div>
  </div>
</template>
