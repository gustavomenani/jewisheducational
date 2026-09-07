<script setup>
// Editor de "Tipos de material" com bolinhas clicáveis para escolher ícone
// e cor de cada tipo — sem precisar digitar código de cor ou nome de ícone.
import { ref, watch } from 'vue';
import {
  MATERIAL_TYPE_ICONS,
  MATERIAL_TYPE_COLORS,
  parseMaterialTypes,
  serializeMaterialTypes,
} from '@/utils/materialTypes';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Add type...' },
  inputId: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const items = ref(parseMaterialTypes(props.modelValue));
let syncingFromProp = false;
watch(() => props.modelValue, (val) => {
  syncingFromProp = true;
  items.value = parseMaterialTypes(val);
  syncingFromProp = false;
});

function persist() {
  if (syncingFromProp) return;
  emit('update:modelValue', serializeMaterialTypes(items.value));
}

const newLabel = ref('');
function addItem() {
  const label = newLabel.value.trim();
  if (!label || items.value.some((i) => i.label === label)) {
    newLabel.value = '';
    return;
  }
  items.value.push({
    label,
    icon: MATERIAL_TYPE_ICONS[0],
    color: MATERIAL_TYPE_COLORS[items.value.length % MATERIAL_TYPE_COLORS.length],
  });
  newLabel.value = '';
  persist();
}

function removeItem(index) {
  items.value.splice(index, 1);
  persist();
}

const openPicker = ref(null);
function togglePicker(index, kind) {
  const key = `${index}:${kind}`;
  openPicker.value = openPicker.value === key ? null : key;
}
function setIcon(index, icon) {
  items.value[index].icon = icon;
  openPicker.value = null;
  persist();
}
function setColor(index, color) {
  items.value[index].color = color;
  openPicker.value = null;
  persist();
}
</script>

<template>
  <div class="line-list-editor">
    <ul v-if="items.length" class="line-list material-type-list">
      <li v-for="(item, index) in items" :key="index" class="material-type-row">
        <div class="material-type-main">
          <button
            type="button"
            class="mte-icon-btn"
            :style="{ color: item.color, borderColor: item.color }"
            title="Choose icon"
            @click="togglePicker(index, 'icon')"
          >
            <i :class="['bi', item.icon]"></i>
          </button>
          <button
            type="button"
            class="mte-color-dot"
            :style="{ background: item.color }"
            title="Choose color"
            @click="togglePicker(index, 'color')"
          ></button>
          <span class="line-list-text">{{ item.label }}</span>
          <button type="button" class="line-list-remove" :aria-label="`Remove ${item.label}`" @click="removeItem(index)">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div v-if="openPicker === `${index}:icon`" class="mte-picker">
          <button
            v-for="ic in MATERIAL_TYPE_ICONS"
            :key="ic"
            type="button"
            class="mte-icon-option"
            :class="{ active: ic === item.icon }"
            @click="setIcon(index, ic)"
          >
            <i :class="['bi', ic]"></i>
          </button>
        </div>

        <div v-if="openPicker === `${index}:color`" class="mte-picker">
          <button
            v-for="c in MATERIAL_TYPE_COLORS"
            :key="c"
            type="button"
            class="mte-color-option"
            :class="{ active: c === item.color }"
            :style="{ background: c }"
            @click="setColor(index, c)"
          ></button>
        </div>
      </li>
    </ul>
    <p v-else class="line-list-empty">No items have been added yet.</p>

    <div class="line-list-add">
      <input
        :id="inputId || undefined"
        v-model="newLabel"
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
