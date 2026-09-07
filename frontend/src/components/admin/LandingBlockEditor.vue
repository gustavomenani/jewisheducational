<script setup>
import { ref, computed } from 'vue';
import { mediaUrl } from '@/utils/media';
import { LANDING_BLOCK_DEFS, OPTIONAL_LANDING_BLOCKS, blockSizeKey } from '@/utils/theme';

const props = defineProps({
  blockOrder: { type: Array, required: true },
  form: { type: Object, required: true },
  activityCards: { type: Array, default: () => [] },
  uploadingField: { type: String, default: '' },
});

const emit = defineEmits(['update:blockOrder', 'upload']);

const dragIndex = ref(null);
const dropIndex = ref(null);
const expandedId = ref(null);
const showAddMenu = ref(false);

const orderedDefs = computed(() =>
  props.blockOrder.map((id) => LANDING_BLOCK_DEFS[id]).filter(Boolean)
);

const addableBlocks = computed(() =>
  OPTIONAL_LANDING_BLOCKS
    .filter((id) => !props.blockOrder.includes(id))
    .map((id) => LANDING_BLOCK_DEFS[id])
    .filter(Boolean)
);

function isEnabled(blockId) {
  const def = LANDING_BLOCK_DEFS[blockId];
  if (!def) return false;
  return props.form[def.showKey] === 'true' || props.form[def.showKey] === true;
}

function toggleEnabled(blockId) {
  const def = LANDING_BLOCK_DEFS[blockId];
  if (!def) return;
  props.form[def.showKey] = isEnabled(blockId) ? 'false' : 'true';
}

function toggleExpand(blockId) {
  expandedId.value = expandedId.value === blockId ? null : blockId;
}

function onDragStart(index) {
  dragIndex.value = index;
}

function onDragEnter(index) {
  if (dragIndex.value === null || dragIndex.value === index) return;
  dropIndex.value = index;
}

function onDragEnd() {
  if (dragIndex.value !== null && dropIndex.value !== null && dragIndex.value !== dropIndex.value) {
    const next = [...props.blockOrder];
    const [moved] = next.splice(dragIndex.value, 1);
    next.splice(dropIndex.value, 0, moved);
    emit('update:blockOrder', next);
  }
  dragIndex.value = null;
  dropIndex.value = null;
}

function onDragOver(event) {
  event.preventDefault();
}

function moveBlock(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= props.blockOrder.length) return;
  const next = [...props.blockOrder];
  [next[index], next[target]] = [next[target], next[index]];
  emit('update:blockOrder', next);
}

function previewLabel(blockId) {
  const def = LANDING_BLOCK_DEFS[blockId];
  const titleField = def?.fields?.find((f) => f.key.includes('title') || f.key === 'hero_title');
  if (titleField && props.form[titleField.key]) return props.form[titleField.key];
  return def?.title || blockId;
}

function sizeValue(blockId) {
  return Number(props.form[blockSizeKey(blockId)] || 100);
}

function setSize(blockId, value) {
  props.form[blockSizeKey(blockId)] = String(value);
}

function uploadImage(event, fieldKey) {
  emit('upload', event, fieldKey);
}

function addActivityCard() {
  props.activityCards.push({
    img: '',
    title: 'Novo card',
    pos: `pos-${props.activityCards.length + 1}`,
  });
}

function removeActivityCard(index) {
  props.activityCards.splice(index, 1);
}

function addBlock(blockId) {
  emit('update:blockOrder', [...props.blockOrder, blockId]);
  const def = LANDING_BLOCK_DEFS[blockId];
  if (def) props.form[def.showKey] = 'true';
  expandedId.value = blockId;
  showAddMenu.value = false;
}
</script>

<template>
  <div class="block-editor">
    <p class="block-editor-hint text-muted small mb-3">
      <i class="bi bi-grip-vertical me-1"></i>
      Drag blocks to reorder the home page, just like in WordPress. Use the size control (↔) on each row or expand a block to adjust it from 75% to 150%.
    </p>

    <div v-if="addableBlocks.length" class="mb-3 block-editor-add">
      <button
        type="button"
        class="btn btn-outline-primary btn-sm"
        @click="showAddMenu = !showAddMenu"
      >
        <i class="bi bi-plus-lg me-1"></i>Add block
      </button>
      <ul v-if="showAddMenu" class="block-editor-add-menu list-unstyled mb-0 mt-2">
        <li v-for="block in addableBlocks" :key="block.id">
          <button type="button" class="dropdown-item" @click="addBlock(block.id)">
            <i :class="block.icon" class="me-2"></i>{{ block.title }}
          </button>
        </li>
      </ul>
      <small class="text-muted d-block mt-1">New blocks are added to the end of the page. Save the appearance to publish.</small>
    </div>

    <div class="block-editor-list">
      <article
        v-for="(blockId, index) in blockOrder"
        :key="blockId"
        class="block-editor-item"
        :class="{
          'is-dragging': dragIndex === index,
          'is-drop-target': dropIndex === index && dragIndex !== index,
          'is-disabled': !isEnabled(blockId),
          'is-expanded': expandedId === blockId,
        }"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragenter="onDragEnter(index)"
        @dragover="onDragOver"
        @dragend="onDragEnd"
      >
        <header class="block-editor-item-head" @click="toggleExpand(blockId)">
          <button
            type="button"
            class="block-editor-handle"
            aria-label="Drag block"
            @click.stop
            @mousedown.stop
          >
            <i class="bi bi-grip-vertical"></i>
          </button>

          <span class="block-editor-icon" :class="`tone-${LANDING_BLOCK_DEFS[blockId]?.previewTone}`">
            <i :class="LANDING_BLOCK_DEFS[blockId]?.icon"></i>
          </span>

          <div class="block-editor-meta">
            <strong>{{ LANDING_BLOCK_DEFS[blockId]?.title }}</strong>
            <small class="text-muted d-block text-truncate">{{ previewLabel(blockId) }}</small>
          </div>

          <div
            v-if="isEnabled(blockId)"
            class="block-editor-size"
            title="Block size on the page"
            @click.stop
          >
            <i class="bi bi-arrows-angle-expand"></i>
            <input
              type="range"
              min="75"
              max="150"
              step="5"
              :value="sizeValue(blockId)"
              @input="setSize(blockId, $event.target.value)"
            />
            <span>{{ sizeValue(blockId) }}%</span>
          </div>

          <div class="block-editor-actions" @click.stop>
            <button
              type="button"
              class="btn btn-sm btn-link block-editor-move"
              title="Mover para cima"
              :disabled="index === 0"
              @click="moveBlock(index, -1)"
            >
              <i class="bi bi-chevron-up"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm btn-link block-editor-move"
              title="Mover para baixo"
              :disabled="index === blockOrder.length - 1"
              @click="moveBlock(index, 1)"
            >
              <i class="bi bi-chevron-down"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm block-editor-visibility"
              :class="isEnabled(blockId) ? 'btn-outline-success' : 'btn-outline-secondary'"
              :title="isEnabled(blockId) ? 'Hide block' : 'Show block'"
              @click="toggleEnabled(blockId)"
            >
              <i :class="isEnabled(blockId) ? 'bi bi-eye' : 'bi bi-eye-slash'"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link block-editor-expand" @click="toggleExpand(blockId)">
              <i :class="expandedId === blockId ? 'bi bi-chevron-up' : 'bi bi-chevron-down'"></i>
            </button>
          </div>
        </header>

        <div v-show="expandedId === blockId" class="block-editor-item-body">
          <div class="row g-3">
            <template v-for="field in LANDING_BLOCK_DEFS[blockId]?.fields" :key="field.key">
              <div
                :class="field.type === 'textarea' || field.type === 'range' ? 'col-12' : 'col-md-6'"
              >
                <label v-if="field.type !== 'checkbox'" class="admin-form-label">{{ field.label }}</label>

                <div v-if="field.type === 'range'" class="block-editor-range">
                  <input
                    v-model="form[field.key]"
                    type="range"
                    class="form-range"
                    :min="field.min || 75"
                    :max="field.max || 150"
                    :step="field.step || 5"
                  />
                  <span class="block-editor-range-value">{{ form[field.key] || 100 }}%</span>
                </div>

                <textarea
                  v-else-if="field.type === 'textarea'"
                  v-model="form[field.key]"
                  class="form-control"
                  rows="2"
                ></textarea>

                <div v-else-if="field.type === 'image'" class="input-group">
                  <input v-model="form[field.key]" class="form-control" placeholder="Image URL" />
                  <label class="btn btn-outline-secondary mb-0" :class="{ disabled: uploadingField === field.key }">
                    <i class="bi bi-upload"></i>
                    <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, field.key)" />
                  </label>
                </div>

                <div v-else-if="field.type === 'checkbox'" class="form-check form-switch mt-2">
                  <input
                    :id="field.key"
                    v-model="form[field.key]"
                    class="form-check-input"
                    type="checkbox"
                    true-value="true"
                    false-value="false"
                  />
                  <label class="form-check-label" :for="field.key">{{ field.label }}</label>
                </div>

                <input v-else-if="field.type !== 'checkbox' && field.type !== 'image' && field.type !== 'range'" v-model="form[field.key]" class="form-control" />

                <div v-if="field.hint" class="form-text">{{ field.hint }}</div>
                <img
                  v-if="field.type === 'image' && form[field.key]"
                  :src="mediaUrl(form[field.key])"
                  alt=""
                  class="appearance-thumb mt-2"
                />
              </div>
            </template>

            <div v-if="blockId === 'potential'" class="col-12">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <label class="admin-form-label mb-0">Cards de atividades</label>
                <button type="button" class="btn btn-sm btn-outline-primary" @click="addActivityCard">
                  <i class="bi bi-plus-lg"></i> Add
                </button>
              </div>
              <div
                v-for="(card, cardIndex) in activityCards"
                :key="cardIndex"
                class="appearance-activity-row mb-2 p-2 border rounded"
              >
                <div class="row g-2 align-items-center">
                  <div class="col-md-4">
                    <input v-model="card.title" class="form-control form-control-sm" placeholder="Title" />
                  </div>
                  <div class="col-md-5">
                    <input v-model="card.img" class="form-control form-control-sm" placeholder="Image URL" />
                  </div>
                  <div class="col-md-2">
                    <select v-model="card.pos" class="form-select form-select-sm">
                      <option value="pos-1">Pos 1</option>
                      <option value="pos-2">Pos 2</option>
                      <option value="pos-3">Pos 3</option>
                      <option value="pos-4">Pos 4</option>
                    </select>
                  </div>
                  <div class="col-md-1 text-end">
                    <button type="button" class="btn btn-sm btn-outline-danger admin-action-btn" @click="removeActivityCard(cardIndex)">
                      <i class="bi bi-trash3"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
