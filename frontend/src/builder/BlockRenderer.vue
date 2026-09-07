<script setup>
// Renders a page layout (sections -> columns -> blocks).
// Visitor mode: plain output. Edit mode (admin): selection, drag-reorder,
// drop-from-library, per-block and per-section controls.
import { ref, computed } from 'vue';
import { useBuilderStore } from './store';
import { blockDef } from './registry';
import { GRID_COLUMNS, normalizeBlockPlacement } from './layout';
import { mediaUrl } from '@/utils/media';

const builder = useBuilderStore();
const layout = computed(() => builder.layout);
function removeKnownPublicPlaceholder(value) {
  if (typeof value === 'string') return value.trim().toLowerCase() === 'dsfsd' ? '' : value;
  if (Array.isArray(value)) return value.map(removeKnownPublicPlaceholder);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, removeKnownPublicPlaceholder(item)]));
  }
  return value;
}

const displayLayout = computed(() => builder.editMode ? layout.value : removeKnownPublicPlaceholder(layout.value));
const activeDragCol = ref(null);
const activeDrop = ref(null);
const activeSectionMenu = ref(null);
const pendingSectionRemovalId = ref('');
const pendingBlockRemovalId = ref('');

function componentFor(type) {
  const def = blockDef(type);
  return def ? def.component : null;
}

function sectionStyle(section) {
  const p = section.props || {};
  let bgValue = p.bg;
  if (!bgValue && p.bgGradient) bgValue = p.bgGradient;
  let background = undefined;
  if (typeof bgValue === 'string' && bgValue) {
    if (bgValue.startsWith('#') || bgValue.startsWith('rgb') || bgValue.startsWith('linear-gradient')) {
      background = bgValue;
    } else {
      background = `url(${mediaUrl(bgValue)}) center/cover no-repeat`;
    }
  }
  return {
    paddingTop: `${p.paddingY ?? 48}px`,
    paddingBottom: `${p.paddingY ?? 48}px`,
    background,
    color: p.textColor || undefined,
  };
}

function containerStyle(section) {
  return { maxWidth: `${section.props?.maxWidth ?? 1140}px`, margin: '0 auto', width: '100%' };
}

function columnStyle(column) {
  const span = Math.min(12, Math.max(1, Number(column.span) || 12));
  return { gridColumn: `span ${span}` };
}

function blockStyle(block) {
  const placement = normalizeBlockPlacement(block.layout);
  return {
    gridColumn: `${placement.start} / span ${placement.span}`,
    marginTop: `${placement.marginTop}px`,
    marginBottom: `${placement.marginBottom}px`,
  };
}

function sectionBlockPosition(section, blockId) {
  const ordered = (section?.columns || []).flatMap((column) => column.blocks || []);
  const index = ordered.findIndex((block) => block.id === blockId);
  return { index, total: ordered.length };
}

function toggleSectionHidden(section) {
  builder.updateSectionProps(section.id, { hidden: !section.props?.hidden });
}

function toggleSectionMenu(sectionId, menuName) {
  if (activeSectionMenu.value?.id === sectionId && activeSectionMenu.value?.menu === menuName) {
    activeSectionMenu.value = null;
  } else {
    activeSectionMenu.value = { id: sectionId, menu: menuName };
  }
}

function setSectionPadding(sectionId, paddingY) {
  builder.updateSectionProps(sectionId, { paddingY });
  activeSectionMenu.value = null;
}

function setSectionBg(sectionId, bg) {
  builder.updateSectionProps(sectionId, { bg });
  activeSectionMenu.value = null;
}

function promptCustomBg(sectionId) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('editor:section-custom-bg', { detail: { sectionId } }));
  }
}

// ---- drag & drop ----
function onBlockDragStart(e, blockId) {
  builder.draggedPayload = { kind: 'move', value: blockId };
  try {
    e.dataTransfer.setData('text/plain', `move:${blockId}`);
    e.dataTransfer.effectAllowed = 'move';
  } catch {
    /* fallback */
  }
}

function parsePayload(e) {
  let payload = builder.draggedPayload && builder.draggedPayload.value
    ? { ...builder.draggedPayload }
    : null;
  builder.draggedPayload = null;
  if (!payload) {
    try {
      const raw = e.dataTransfer?.getData('text/plain') || '';
      const separator = raw.indexOf(':');
      payload = separator > 0
        ? { kind: raw.slice(0, separator), value: raw.slice(separator + 1) }
        : null;
    } catch {
      payload = null;
    }
  }
  if (!payload?.value) return { kind: null, value: null };
  if (payload.kind === 'new' && blockDef(payload.value)) return payload;
  if (payload.kind === 'move' && typeof payload.value === 'string') return payload;
  return { kind: null, value: null };
}

function onDropOnBlock(e, columnId, index) {
  e.preventDefault();
  e.stopPropagation();
  activeDragCol.value = null;
  activeDrop.value = null;
  const { kind, value } = parsePayload(e);
  if (kind === 'move') builder.moveBlock(value, columnId, index);
  else if (kind === 'new') builder.addBlock(columnId, value, index);
}

function onDropOnColumn(e, columnId) {
  e.preventDefault();
  activeDragCol.value = null;
  activeDrop.value = null;
  const { kind, value } = parsePayload(e);
  if (kind === 'move') builder.moveBlock(value, columnId, null);
  else if (kind === 'new') builder.addBlock(columnId, value, null);
}

function allowDrop(e, columnId, index = null) {
  if (builder.editMode) {
    e.preventDefault();
    if (index !== null) e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = builder.draggedPayload?.kind === 'move' ? 'move' : 'copy';
    } catch {
      /* fallback */
    }
    if (columnId) activeDragCol.value = columnId;
    activeDrop.value = { columnId, index };
  }
}

function onDragLeave(e, columnId) {
  if (e.currentTarget?.contains(e.relatedTarget)) return;
  if (activeDragCol.value === columnId) activeDragCol.value = null;
  if (activeDrop.value?.columnId === columnId) activeDrop.value = null;
}

function onDragEnd() {
  activeDragCol.value = null;
  activeDrop.value = null;
  builder.draggedPayload = null;
}

function requestRemoveSection(sectionId) {
  activeSectionMenu.value = null;
  pendingBlockRemovalId.value = '';
  pendingSectionRemovalId.value = sectionId;
}

function cancelRemoveSection() {
  pendingSectionRemovalId.value = '';
}

function confirmRemoveSection(sectionId) {
  if (pendingSectionRemovalId.value !== sectionId) return;
  pendingSectionRemovalId.value = '';
  builder.removeSection(sectionId);
}

function deleteLabel(block) {
  return ['heading', 'paragraph'].includes(block?.type) ? 'Delete text' : 'Delete block';
}

function requestRemoveBlock(blockId) {
  pendingSectionRemovalId.value = '';
  pendingBlockRemovalId.value = blockId;
}

function cancelRemoveBlock() {
  pendingBlockRemovalId.value = '';
}

function confirmRemoveBlock(blockId) {
  if (pendingBlockRemovalId.value !== blockId) return;
  pendingBlockRemovalId.value = '';
  builder.removeBlock(blockId);
}

function centerBlock(block) {
  if (block?.type === 'button') {
    builder.setBlockProps(block.id, { align: 'center' });
    return;
  }
  builder.updateBlockLayout(block.id, {
    start: Math.floor((GRID_COLUMNS - normalizeBlockPlacement(block.layout).span) / 2) + 1,
  });
}

function requestInsert(columnId, index) {
  if (!builder.editMode || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('editor:insert-target', {
    detail: { columnId, index },
  }));
}
</script>

<template>
  <div class="block-renderer" :class="{ 'edit-mode': builder.editMode }">
    <section
      v-for="(section, sIdx) in displayLayout.sections"
      v-show="!section.props?.hidden"
      :key="section.id"
      class="br-section"
      :class="{ 'selected-section': builder.selectedSectionId === section.id && builder.editMode }"
      :style="sectionStyle(section)"
      tabindex="-1"
      @click.stop="builder.editMode && builder.selectSection(section.id)"
    >
      <!-- Section floating control bar -->
      <div v-if="builder.editMode" class="br-section-bar">
        <span class="br-section-label">
          <i class="bi bi-layout-three-columns"></i> Content section {{ sIdx + 1 }}
          <small>Click text below to edit</small>
        </span>

        <div v-if="pendingSectionRemovalId === section.id" class="br-inline-confirmation" role="status">
          <span>Delete this section?</span>
          <button type="button" class="br-mini" title="Keep section" @click.stop="cancelRemoveSection">Keep</button>
          <button type="button" class="br-mini danger br-confirm-delete" title="Confirm delete section" aria-label="Confirm delete section" @click.stop="confirmRemoveSection(section.id)"><i class="bi bi-trash3"></i> Yes, delete</button>
        </div>

        <template v-else>
        <!-- Layout presets dropdown -->
        <div class="br-popover-wrapper">
          <button
            class="br-mini"
            :class="{ active: activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'cols' }"
            title="Change columns"
            @click="toggleSectionMenu(section.id, 'cols')"
          >
            <i class="bi bi-columns-gap"></i> Columns
          </button>

          <div
            v-if="activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'cols'"
            class="br-popover-menu"
          >
            <button @click="builder.setSectionColumns(section.id, [12]); activeSectionMenu = null">1 column (100%)</button>
            <button @click="builder.setSectionColumns(section.id, [6, 6]); activeSectionMenu = null">2 Columns (50% / 50%)</button>
            <button @click="builder.setSectionColumns(section.id, [8, 4]); activeSectionMenu = null">2 Columns (66% / 33%)</button>
            <button @click="builder.setSectionColumns(section.id, [4, 8]); activeSectionMenu = null">2 Columns (33% / 66%)</button>
            <button @click="builder.setSectionColumns(section.id, [4, 4, 4]); activeSectionMenu = null">3 columns (equal)</button>
            <button @click="builder.setSectionColumns(section.id, [3, 3, 3, 3]); activeSectionMenu = null">4 columns (equal)</button>
          </div>
        </div>

        <!-- Vertical Spacing dropdown -->
        <div class="br-popover-wrapper">
          <button
            class="br-mini"
            :class="{ active: activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'spacing' }"
            title="Vertical Spacing"
            @click="toggleSectionMenu(section.id, 'spacing')"
          >
            <i class="bi bi-arrows-expand"></i> Spacing
          </button>

          <div
            v-if="activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'spacing'"
            class="br-popover-menu"
          >
            <button @click="setSectionPadding(section.id, 16)">Small (16px)</button>
            <button @click="setSectionPadding(section.id, 48)">Medium (48px)</button>
            <button @click="setSectionPadding(section.id, 80)">Large (80px)</button>
            <button @click="setSectionPadding(section.id, 120)">Extra (120px)</button>
          </div>
        </div>

        <!-- Background selector dropdown -->
        <div class="br-popover-wrapper">
          <button
            class="br-mini"
            :class="{ active: activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'bg' }"
            title="Section background"
            @click="toggleSectionMenu(section.id, 'bg')"
          >
            <i class="bi bi-palette"></i> Background
          </button>

          <div
            v-if="activeSectionMenu?.id === section.id && activeSectionMenu?.menu === 'bg'"
            class="br-popover-menu"
          >
            <button @click="setSectionBg(section.id, '')">Transparent</button>
            <button @click="setSectionBg(section.id, '#ffffff')">White</button>
            <button @click="setSectionBg(section.id, '#f8fafc')">Light Gray</button>
            <button @click="setSectionBg(section.id, '#0f172a')">Dark (#0f172a)</button>
            <button @click="setSectionBg(section.id, 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)')">Dark Gradient</button>
            <button @click="setSectionBg(section.id, 'linear-gradient(135deg, #3bafb8 0%, #5d6dbe 100%)')">Blue/Purple Gradient</button>
            <button @click="setSectionBg(section.id, 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)')">Gold Gradient</button>
            <button @click="promptCustomBg(section.id)">Custom / Image…</button>
          </div>
        </div>

        <button
          class="br-mini"
          :title="section.props?.hidden ? 'Show section' : 'Hide section'"
          :aria-label="section.props?.hidden ? 'Show section' : 'Hide section'"
          @click="toggleSectionHidden(section)"
        >
          <i :class="section.props?.hidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i>
        </button>

        <!-- Reorder section up/down -->
        <button
          class="br-mini"
          title="Move section up"
          aria-label="Move section up"
          :disabled="sIdx === 0"
          @click="builder.moveSection(section.id, 'up')"
        >
          <i class="bi bi-arrow-up"></i>
        </button>
        <button
          class="br-mini"
          title="Move section down"
          aria-label="Move section down"
          :disabled="sIdx === layout.sections.length - 1"
          @click="builder.moveSection(section.id, 'down')"
        >
          <i class="bi bi-arrow-down"></i>
        </button>

        <!-- Duplicate section -->
        <button class="br-mini" title="Duplicate section" aria-label="Duplicate section" @click="builder.duplicateSection(section.id)">
          <i class="bi bi-copy"></i>
        </button>

        <!-- Remove section -->
        <button class="br-mini danger br-delete-section" title="Delete section" aria-label="Delete section" @click.stop="requestRemoveSection(section.id)">
          <i class="bi bi-trash3"></i><span>Delete section</span>
        </button>
        </template>
      </div>

      <div v-if="section.props?.hidden && builder.editMode" class="br-hidden-section-placeholder">
        <i class="bi bi-eye-slash"></i>
        <strong>Section hidden</strong>
        <button type="button" @click.stop="toggleSectionHidden(section)">Show section</button>
      </div>

      <div v-else class="br-container" :style="containerStyle(section)">
        <div class="br-row">
          <div
            v-for="column in section.columns"
            :key="column.id"
            class="br-col"
            :class="{
              'br-col-edit': builder.editMode,
              'br-col-dragover': builder.editMode && activeDragCol === column.id
            }"
            :style="columnStyle(column)"
            @dragover="allowDrop($event, column.id)"
            @dragleave="onDragLeave($event, column.id)"
            @drop="onDropOnColumn($event, column.id)"
          >
            <button
              v-if="builder.editMode && column.blocks.length"
              type="button"
              class="br-add-point"
              title="Add content here"
              @click.stop="requestInsert(column.id, 0)"
            >
              <i class="bi bi-plus-circle"></i><span>Add</span>
            </button>

            <div
              v-for="(block, idx) in column.blocks"
              :key="block.id"
              v-show="!block.props?.hidden"
              class="br-block"
              :class="{
                selected: builder.selectedId === block.id && builder.editMode,
                'br-drop-target': activeDrop?.columnId === column.id && activeDrop?.index === idx,
                'is-hidden': block.props?.hidden,
              }"
              :style="blockStyle(block)"
              @click.stop="builder.select(block.id)"
              @dragover="allowDrop($event, column.id, idx)"
              @drop="onDropOnBlock($event, column.id, idx)"
            >
              <div v-if="builder.editMode && (builder.selectedId === block.id || pendingBlockRemovalId === block.id)" class="br-block-tools" role="toolbar" :aria-label="`${blockDef(block.type)?.label || 'Content'} controls`">
                <template v-if="pendingBlockRemovalId === block.id">
                  <span class="br-inline-confirmation" role="status">
                    <span>Delete this text?</span>
                    <button type="button" class="br-tool-btn br-confirm-cancel" title="Keep text" @click.stop="cancelRemoveBlock">Keep</button>
                    <button type="button" class="br-tool-btn danger br-confirm-delete" title="Confirm delete text" aria-label="Confirm delete text" @click.stop="confirmRemoveBlock(block.id)"><i class="bi bi-trash3"></i> Yes, delete</button>
                  </span>
                </template>
                <template v-else>
                <span
                  class="br-tool-handle"
                  draggable="true"
                  title="Drag to move"
                  @dragstart="onBlockDragStart($event, block.id)"
                  @dragend="onDragEnd"
                >
                  <i class="bi bi-grip-vertical"></i>
                </span>
                <button
                  v-if="block.type === 'button'"
                  class="br-tool-btn br-center-tool"
                  title="Center button"
                  aria-label="Center button"
                  @click.stop="centerBlock(block)"
                >
                  <i class="bi bi-align-center"></i><span>Center</span>
                </button>
                <button
                  class="br-tool-btn"
                  title="Move block up"
                  aria-label="Move block up"
                  :disabled="sectionBlockPosition(section, block.id).index <= 0"
                  @click.stop="builder.moveBlockBy(block.id, 'up')"
                >
                  <i class="bi bi-arrow-up"></i>
                </button>
                <button
                  class="br-tool-btn"
                  title="Move block down"
                  aria-label="Move block down"
                  :disabled="sectionBlockPosition(section, block.id).index >= sectionBlockPosition(section, block.id).total - 1"
                  @click.stop="builder.moveBlockBy(block.id, 'down')"
                >
                  <i class="bi bi-arrow-down"></i>
                </button>
                <button class="br-tool-btn" title="Duplicate block" aria-label="Duplicate block" @click.stop="builder.duplicateBlock(block.id)">
                  <i class="bi bi-copy"></i>
                </button>
                <button class="br-tool-btn danger br-delete-text" :title="deleteLabel(block)" :aria-label="deleteLabel(block)" @click.stop="requestRemoveBlock(block.id)">
                  <i class="bi bi-trash3"></i><span>{{ deleteLabel(block) }}</span>
                </button>
                </template>
              </div>

              <div v-if="block.props?.hidden && builder.editMode" class="br-hidden-placeholder">
                <i class="bi bi-eye-slash"></i>
                <strong>{{ blockDef(block.type)?.label || 'Block' }} hidden</strong>
                <button type="button" @click.stop="builder.setBlockHidden(block.id, false)">Restore block</button>
              </div>
              <component :is="componentFor(block.type)" v-else-if="componentFor(block.type)" :block="block" />
              <div v-else class="br-unknown">Unknown block: {{ block.type }}</div>
            </div>
            <button
              v-if="builder.editMode"
              type="button"
              class="br-add-point"
              title="Add content here"
              @click.stop="requestInsert(column.id, idx + 1)"
            >
              <i class="bi bi-plus-circle"></i><span>Add</span>
            </button>

            <div v-if="builder.editMode && !column.blocks.length" class="br-empty-col">
              <i class="bi bi-plus-circle-dashed me-1"></i> Drop blocks here
            </div>
          </div>
        </div>
      </div>
    </section>

  </div>
</template>

<style scoped>
.br-section {
  position: relative;
  transition: padding 0.2s ease, background 0.2s ease;
}
.edit-mode .br-section {
  outline: 1px dashed transparent;
  transition: outline-color 0.2s ease;
}
.edit-mode .br-section:hover {
  outline-color: rgba(56, 189, 248, 0.4);
}
.edit-mode .br-section.selected-section {
  outline: 2px solid rgba(59, 175, 184, 0.65);
  outline-offset: -2px;
}
.br-container {
  padding: 0 16px;
}
.br-hidden-section-placeholder {
  display: grid;
  justify-items: center;
  gap: 7px;
  margin: 0 16px;
  padding: 28px 16px;
  border: 1px dashed #9bd5d7;
  border-radius: 10px;
  background: #f3fbfb;
  color: #557285;
  text-align: center;
}
.br-hidden-section-placeholder > i { color: #3bafb8; font-size: 1.25rem; }
.br-hidden-section-placeholder strong { font-size: .78rem; }
.br-hidden-section-placeholder button { padding: 6px 10px; border: 1px solid #8acfd1; border-radius: 7px; background: #fff; color: #237f86; cursor: pointer; font: inherit; font-size: .7rem; font-weight: 800; }
.br-row {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}
.br-col {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-content: start;
  column-gap: 10px;
  row-gap: 10px;
  transition: all 0.2s ease;
}
.br-col-edit {
  min-height: 48px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  padding: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  background-image: linear-gradient(to right, rgba(56, 189, 248, 0.045) 1px, transparent 1px);
  background-size: calc(100% / 12) 100%;
}
.br-col-dragover {
  border: 2px dashed #38bdf8 !important;
  background: rgba(56, 189, 248, 0.08) !important;
  box-shadow: inset 0 0 16px rgba(56, 189, 248, 0.2);
}
.br-block {
  position: relative;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.br-add-point {
  grid-column: 1 / -1;
  justify-self: center;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  margin: -2px 0;
  padding: 3px 9px;
  border: 1px dashed #9bd5d7;
  border-radius: 999px;
  background: rgba(240, 251, 251, 0.9);
  color: #237f86;
  cursor: pointer;
  font-size: 0.65rem;
  font-weight: 900;
  opacity: 0.72;
}
.br-add-point:hover { opacity: 1; border-color: #3bafb8; background: #dff5f5; }
.br-block::before {
  content: '';
  position: absolute;
  top: -5px;
  right: 0;
  left: 0;
  height: 3px;
  border-radius: 999px;
  background: transparent;
  pointer-events: none;
}
.br-block.br-drop-target::before {
  background: #38bdf8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
}
.edit-mode .br-block:hover {
  background: rgba(56, 189, 248, 0.06);
}
.br-block.selected {
  box-shadow: 0 0 0 2px #38bdf8, 0 6px 20px rgba(56, 189, 248, 0.25);
  background: rgba(56, 189, 248, 0.04);
  transform: translateY(-1px);
}
.br-block.is-hidden {
  border: 1px dashed #d4a54d;
  background: #fffaf0;
}
.br-hidden-placeholder {
  display: grid;
  justify-items: center;
  gap: 5px;
  min-height: 72px;
  padding: 14px;
  border: 1px dashed #e2bf78;
  border-radius: 7px;
  background: #fffaf0;
  color: #a86612;
  font-size: .72rem;
  text-align: center;
}
.br-hidden-placeholder i { font-size: 1.15rem; }
.br-hidden-placeholder button {
  min-height: 26px;
  padding: 4px 8px;
  border: 1px solid #e2bf78;
  border-radius: 6px;
  background: #fff;
  color: #8b5a13;
  cursor: pointer;
  font: inherit;
  font-size: .65rem;
  font-weight: 800;
}
.br-hidden-placeholder button:hover { background: #fff1ce; }
.br-block-tools {
  position: absolute;
  top: -14px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  opacity: 0;
  transform: translateY(3px);
  transition: all 0.15s ease-out;
  background: #0f172a;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.br-tool-handle,
.br-tool-btn {
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  font-size: 0.78rem;
}
.br-center-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  padding: 0 7px;
  gap: 4px;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
}
.br-center-tool span {
  line-height: 1;
}
.br-tool-handle { cursor: grab; }
.br-tool-btn { cursor: pointer; }
.br-tool-btn:hover:not(:disabled) { background: #0ea5e9; color: #fff; }
.br-tool-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.br-tool-btn.danger:hover { background: #ef4444; }
.br-block:hover .br-block-tools,
.br-block.selected .br-block-tools {
  opacity: 1;
  transform: translateY(0);
}
.br-drag {
  cursor: grab;
  background: #3bafb8;
  color: #fff;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
}
.br-drag:active {
  cursor: grabbing;
}
.br-mini {
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.br-mini:hover {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
.br-mini.active {
  background: #38bdf8;
  color: #0f172a;
}
.br-mini:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.br-mini.danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}
.br-mini.danger:hover {
  background: #ef4444;
  color: #fff;
}
.br-section-bar {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  align-items: center;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 4px 12px;
  z-index: 20;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  opacity: 0.28;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.br-section:hover > .br-section-bar,
.br-section:focus-within > .br-section-bar {
  opacity: 1;
}
.br-section-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #38bdf8;
  margin-right: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.br-popover-wrapper {
  position: relative;
}
.br-popover-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 6px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  z-index: 30;
  min-width: 180px;
  animation: fadeIn 0.15s ease-out;
}
.br-popover-menu button {
  background: transparent;
  border: none;
  color: #e2e8f0;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
}
.br-popover-menu button:hover {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}
.br-empty-col {
  grid-column: 1 / -1;
  color: #94a3b8;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  padding: 20px 8px;
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 6px;
}
.br-unknown {
  color: #fca5a5;
  font-size: 0.85rem;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
}
:global(body[data-editor-preview='mobile'] .br-col),
:global(body[data-editor-preview='mobile'] .br-block) {
  grid-column: 1 / -1 !important;
}
:global(body[data-editor-preview='mobile'] .br-section-bar) {
  position: relative;
  top: 0;
  left: 0;
  transform: none;
  flex-wrap: wrap;
  margin-bottom: 12px;
  border-radius: 12px;
}
:global(body[data-editor-workspace] .br-section-bar) {
  position: sticky;
  top: 74px;
  left: auto;
  display: flex !important;
  width: calc(100% - 20px);
  max-width: none;
  margin: 4px 10px 10px;
  padding: 6px 8px;
  justify-content: space-between;
  flex-wrap: wrap;
  transform: none;
  border-color: #b7e1e2;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(31, 78, 107, 0.16);
  opacity: 1;
}
:global(body[data-editor-workspace] .br-section-bar .br-section-label) {
  color: #237f86;
}
:global(body[data-editor-workspace] .br-section-label small) {
  margin-left: 4px;
  color: #6b8795;
  font-size: 0.64rem;
  font-weight: 800;
}
:global(body[data-editor-workspace] .br-section-bar .br-mini) {
  border: 1px solid #c8dde1;
  background: #f7fdfd;
  color: #3d687d;
}
:global(body[data-editor-workspace] .br-section-bar .br-mini:hover:not(:disabled)) {
  border-color: #88cdcf;
  background: #eafafa;
  color: #17656a;
}
:global(body[data-editor-workspace] .br-section-bar .br-mini.danger) {
  border-color: #efc5c3;
  background: #fff5f4;
  color: #b3413e;
}
:global(body[data-editor-workspace] .br-section-bar .br-mini.danger:hover) {
  border-color: #df9b98;
  background: #fee8e6;
  color: #9d302e;
}
:global(body[data-editor-workspace] .br-block-tools) {
  position: relative;
  top: auto;
  right: auto;
  display: flex !important;
  margin: 4px 0;
  padding: 4px;
  border-color: #b7e1e2;
  background: #fff;
  box-shadow: 0 8px 20px rgba(31, 78, 107, 0.16);
  opacity: 1;
  transform: none;
}
:global(body[data-editor-workspace] .br-block-tools .br-tool-btn),
:global(body[data-editor-workspace] .br-block-tools .br-tool-handle) {
  border: 1px solid #c8dde1;
  background: #f7fdfd;
  color: #3d687d;
}
:global(body[data-editor-workspace] .br-block-tools .br-tool-btn:hover:not(:disabled)) {
  border-color: #88cdcf;
  background: #eafafa;
  color: #17656a;
}
:global(body[data-editor-workspace] .br-block-tools .br-tool-btn.danger) {
  border-color: #efc5c3;
  background: #fff5f4;
  color: #b3413e;
}
:global(body[data-editor-workspace] .br-block-tools .br-tool-btn.danger:hover) {
  border-color: #df9b98;
  background: #fee8e6;
  color: #9d302e;
}
:global(body[data-editor-workspace] .br-delete-section),
:global(body[data-editor-workspace] .br-delete-text),
:global(body[data-editor-workspace] .br-confirm-delete),
:global(body[data-editor-workspace] .br-confirm-cancel) {
  display: inline-flex;
  width: auto;
  min-height: 27px;
  height: auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 8px;
  font-size: 0.68rem;
  font-weight: 800;
  white-space: nowrap;
}
:global(body[data-editor-workspace] .br-inline-confirmation) {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: #704544;
  font-size: 0.7rem;
  font-weight: 800;
}
:global(body[data-editor-workspace] .br-block.selected) {
  box-shadow: 0 0 0 2px #3bafb8, 0 8px 24px rgba(30, 77, 123, 0.16);
}
:global(body:not([data-editor-workspace]) .br-block.is-hidden) {
  display: none;
}
@media (max-width: 768px) {
  .br-col {
    grid-column: 1 / -1 !important;
  }
  .br-block {
    grid-column: 1 / -1 !important;
  }
  .br-section-bar {
    position: relative;
    top: 0;
    left: 0;
    transform: none;
    margin-bottom: 12px;
    flex-wrap: wrap;
    border-radius: 12px;
  }
  :global(body[data-editor-workspace] .br-section-bar) {
    position: relative;
    top: auto;
    width: calc(100% - 20px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .br-section,
  .br-col,
  .br-block,
  .br-block-tools {
    transition: none !important;
    animation: none !important;
  }
}
</style>
