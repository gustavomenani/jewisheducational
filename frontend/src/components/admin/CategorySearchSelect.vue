<script setup>
// Combobox com busca — em vez de um <select> nativo com centenas de opções
// pra rolar, digita uma parte do nome e a lista filtra na hora.
import { ref, computed, watch, nextTick } from 'vue';

const props = defineProps({
  // Cada opção: { id, label } e, opcionalmente, { parent, depth, path }.
  // `label` é o nome curto (folha) exibido; `path` é o caminho completo usado
  // só para a busca; `parent`/`depth` dão o contexto/indentação na lista.
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  emptyLabel: { type: String, default: '' }, // ex.: "Sem category" — deixe vazio para omitir
  placeholder: { type: String, default: 'Search category...' },
});
const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const query = ref('');
const inputRef = ref(null);

const selectedOption = computed(() =>
  props.options.find((o) => String(o.id) === String(props.modelValue)) || null
);

watch(() => props.modelValue, syncQueryFromSelection, { immediate: true });
function syncQueryFromSelection() {
  query.value = selectedOption.value ? selectedOption.value.label : (props.emptyLabel || '');
}

// Busca pelo caminho completo (path) quando existir, para digitar o nome de
// um assunto-pai ainda encontrar os sub-assuntos, mesmo mostrando só a folha.
function optionText(o) {
  return (o.path || o.label || '').toLowerCase();
}

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const base = props.options;
  if (!open.value) return base;
  if (!q || (selectedOption.value && q === (selectedOption.value.label || '').toLowerCase())) return base;
  return base.filter((o) => optionText(o).includes(q));
});

function openList() {
  open.value = true;
  query.value = '';
  nextTick(() => inputRef.value?.select());
}

function pick(option) {
  emit('update:modelValue', option ? option.id : '');
  open.value = false;
  syncQueryFromSelection();
}

function onBlur() {
  // Pequeno atraso para o clique na opção (mousedown) registrar antes do blur fechar a lista.
  setTimeout(() => {
    open.value = false;
    syncQueryFromSelection();
  }, 150);
}
</script>

<template>
  <div class="category-search-select">
    <input
      ref="inputRef"
      v-model="query"
      type="text"
      class="form-control"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="openList"
      @blur="onBlur"
    />
    <ul v-if="open" class="category-search-list">
      <li v-if="emptyLabel">
        <button type="button" class="category-search-item" @mousedown.prevent="pick(null)">
          {{ emptyLabel }}
        </button>
      </li>
      <li v-for="o in filtered" :key="o.id">
        <button
          type="button"
          class="category-search-item"
          :class="{ active: String(o.id) === String(modelValue) }"
          :style="{ paddingLeft: `calc(0.6rem + ${o.depth || 0} * 0.85rem)` }"
          @mousedown.prevent="pick(o)"
        >
          <span class="category-search-leaf">{{ o.label }}</span>
          <span v-if="o.parent" class="category-search-parent">em {{ o.parent }}</span>
        </button>
      </li>
      <li v-if="!filtered.length && !emptyLabel" class="category-search-empty">No categories found.</li>
    </ul>
  </div>
</template>
