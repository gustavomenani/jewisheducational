<script setup>
// A presentational extension zone. It deliberately renders outside the
// protected application widgets (search, authentication, checkout and file
// delivery), while providing direct editing for the visual content around
// them.
import { computed, ref } from 'vue';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useBuilderStore } from './store';
import { normalizeTextStyle, textStyleToCss } from './textStyle';

const props = defineProps({
  pageId: { type: String, required: true },
  zone: { type: String, required: true },
  label: { type: String, default: 'Content area' },
});

const builder = useBuilderStore();
const draggedBlock = ref(null);
const draggedSection = ref(null);
const uploadingBlockId = ref('');
const uploadError = ref('');
const pendingSectionRemovalId = ref('');

const canEdit = computed(() => builder.editMode && builder.canEdit);
const slot = computed(() => builder.documentSlot(props.pageId, props.zone));
const hasContent = computed(() => slot.value.sections.some((section) => !section.props?.hidden));

function isSelected(kind, id) {
  const selected = builder.selectedDocumentItem;
  return selected?.kind === kind
    && selected?.id === id
    && selected?.pageId === props.pageId
    && selected?.zone === props.zone;
}

function sectionStyle(section) {
  const rawBackground = String(section.props?.bg || '');
  const background = /^#[\da-f]{3,8}$/i.test(rawBackground) || /^linear-gradient\(/i.test(rawBackground)
    ? rawBackground
    : undefined;
  return {
    paddingTop: `${section.props?.paddingY ?? 48}px`,
    paddingBottom: `${section.props?.paddingY ?? 48}px`,
    background,
  };
}

function containerStyle(section) {
  return { maxWidth: `${section.props?.maxWidth ?? 1140}px` };
}

function columnStyle(column) {
  return { gridColumn: `span ${Math.min(12, Math.max(1, Number(column.span) || 12))}` };
}

function blockStyle(block) {
  const placement = block.layout || {};
  const span = Math.min(12, Math.max(1, Number(placement.span) || 12));
  const start = Math.min(13 - span, Math.max(1, Number(placement.start) || 1));
  return {
    gridColumn: `${start} / span ${span}`,
    marginTop: `${Math.min(160, Math.max(0, Number(placement.marginTop) || 0))}px`,
    marginBottom: `${Math.min(160, Math.max(0, Number(placement.marginBottom) || 0))}px`,
  };
}

function blockTextStyle(block) {
  const css = textStyleToCss(normalizeTextStyle(block.props?.textStyle, block.props));
  return {
    ...css,
    textAlign: css.textAlign || block.props?.align || 'left',
    margin: 0,
    whiteSpace: block.type === 'paragraph' ? 'pre-line' : undefined,
  };
}

function imageStyle(block) {
  const width = Math.min(100, Math.max(25, Number(block.props?.maxWidth) || 100));
  const align = block.props?.align || 'center';
  return {
    width: `${width}%`,
    borderRadius: `${Math.min(64, Math.max(0, Number(block.props?.radius) || 0))}px`,
    marginLeft: align === 'center' || align === 'right' ? 'auto' : undefined,
    marginRight: align === 'center' || align === 'left' ? 'auto' : undefined,
  };
}

function buttonHref(block) {
  const value = String(block.props?.link || '/');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return /^https:|^mailto:|^tel:/i.test(value) ? value : '/';
}

function selectBlock(event, block) {
  if (!canEdit.value) return;
  event?.preventDefault();
  event?.stopPropagation();
  builder.selectDocumentBlock(props.pageId, props.zone, block.id);
}

function selectSection(event, section) {
  if (!canEdit.value) return;
  event?.stopPropagation();
  builder.selectDocumentSection(props.pageId, props.zone, section.id);
}

function startTextEdit(event, block) {
  if (!canEdit.value) return;
  selectBlock(event, block);
  builder.beginDocumentHistory();
}

function updateText(event, block) {
  if (!canEdit.value) return;
  builder.updateDocumentBlock(props.pageId, props.zone, block.id, { text: event.currentTarget.innerText || '' });
}

function finishTextEdit() {
  builder.commitDocumentHistory();
}

function cleanPaste(event) {
  if (!canEdit.value) return;
  event.preventDefault();
  const text = event.clipboardData?.getData('text/plain') || '';
  if (document.queryCommandSupported?.('insertText')) {
    document.execCommand('insertText', false, text);
    return;
  }
  const selection = window.getSelection?.();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function keydownText(event, block) {
  if (!canEdit.value) return;
  if (event.key === 'Enter' && ['heading', 'button'].includes(block.type)) event.preventDefault();
}

function updateTextStyle(block, patch) {
  builder.setDocumentBlockProps(props.pageId, props.zone, block.id, {
    textStyle: { ...(block.props?.textStyle || {}), ...patch },
  });
}

function adjustTextSize(block, amount) {
  const fallback = block.type === 'heading' ? 32 : 17;
  const size = Math.min(72, Math.max(10, Number(block.props?.textStyle?.fontSize) || fallback) + amount);
  updateTextStyle(block, { fontSize: size });
}

function setTextAlign(block, align) {
  builder.setDocumentBlockProps(props.pageId, props.zone, block.id, {
    align,
    textStyle: { ...(block.props?.textStyle || {}), textAlign: align },
  });
}

function toggleBold(block) {
  const current = String(block.props?.textStyle?.fontWeight || '');
  updateTextStyle(block, { fontWeight: current === '700' ? '400' : '700' });
}

function addBlock(type, section = null) {
  builder.addDocumentBlock(props.pageId, props.zone, type, section ? { sectionId: section.id } : {});
}

function addSection() {
  builder.addDocumentSection(props.pageId, props.zone);
}

function requestSectionRemoval(section) {
  if (!canEdit.value) return;
  builder.selectDocumentSection(props.pageId, props.zone, section.id);
  pendingSectionRemovalId.value = section.id;
}

function cancelSectionRemoval() {
  pendingSectionRemovalId.value = '';
}

function confirmSectionRemoval(section) {
  if (pendingSectionRemovalId.value !== section.id) return;
  pendingSectionRemovalId.value = '';
  builder.removeDocumentSection(props.pageId, props.zone, section.id);
}

function onDragStart(event, block) {
  if (!canEdit.value) return;
  draggedBlock.value = block.id;
  event.dataTransfer?.setData('text/plain', block.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onSectionDragStart(event, section) {
  if (!canEdit.value) return;
  draggedSection.value = section.id;
  event.dataTransfer?.setData('application/x-site-section', section.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onSectionDrop(event, index) {
  if (!canEdit.value || !draggedSection.value) return;
  event.preventDefault();
  event.stopPropagation();
  const sectionId = draggedSection.value;
  draggedSection.value = null;
  builder.moveDocumentSectionTo(props.pageId, props.zone, sectionId, index);
}

function onDrop(event, column, index) {
  if (!canEdit.value) return;
  event.preventDefault();
  const blockId = draggedBlock.value || event.dataTransfer?.getData('text/plain');
  draggedBlock.value = null;
  if (blockId) builder.moveDocumentBlock(props.pageId, props.zone, blockId, column.id, index);
}

function dragOver(event) {
  if (canEdit.value) event.preventDefault();
}

async function uploadImage(event, block) {
  const file = event.target.files?.[0];
  if (!file || !canEdit.value) return;
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'Choose an image up to 10 MB.';
    event.target.value = '';
    return;
  }
  uploadError.value = '';
  uploadingBlockId.value = block.id;
  try {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/settings/upload', form);
    builder.trackPendingMediaUpload(data.url);
    builder.setDocumentBlockProps(props.pageId, props.zone, block.id, { src: data.url, hidden: false });
  } catch (error) {
    uploadError.value = error.response?.data?.error || 'Could not upload this image.';
  } finally {
    uploadingBlockId.value = '';
    event.target.value = '';
  }
}
</script>

<template>
  <section
    v-if="hasContent || canEdit"
    class="site-content-slot"
    :class="{ 'is-editing': canEdit, 'is-empty': !hasContent }"
    :data-page="pageId"
    :data-zone="zone"
    :aria-label="canEdit ? `${label} — safe editable area` : undefined"
  >
    <div v-if="canEdit" class="site-slot-anchor" role="note">
      <span><i class="bi bi-unlock"></i>{{ label }}</span>
      <small>Visual content only</small>
    </div>

    <section
      v-for="(section, sectionIndex) in slot.sections"
      v-show="!section.props?.hidden || canEdit"
      :key="section.id"
      class="site-slot-section"
      :class="{ 'is-selected': isSelected('section', section.id), 'is-hidden': section.props?.hidden }"
      :style="sectionStyle(section)"
      @dragover="dragOver"
      @drop="onSectionDrop($event, sectionIndex)"
      @click="selectSection($event, section)"
    >
      <div v-if="canEdit" class="site-slot-section-tools" role="toolbar" :aria-label="`Section ${sectionIndex + 1} controls`">
        <span class="site-slot-drag-label" draggable="true" title="Drag to reorder section" @dragstart="onSectionDragStart($event, section)" @dragend="draggedSection = null"><i class="bi bi-grip-vertical"></i>Section {{ sectionIndex + 1 }}</span>
        <div class="site-slot-section-actions">
          <template v-if="pendingSectionRemovalId === section.id">
            <span class="site-slot-delete-question" role="status">Delete this section?</span>
            <button type="button" class="site-slot-delete-cancel" title="Keep section" @click.stop="cancelSectionRemoval">Keep</button>
            <button type="button" class="site-slot-delete-confirm is-danger" title="Confirm delete section" aria-label="Confirm delete section" @click.stop="confirmSectionRemoval(section)"><i class="bi bi-trash3"></i>Yes, delete</button>
          </template>
          <template v-else>
            <button type="button" title="Move section up" :disabled="sectionIndex === 0" @click.stop="builder.moveDocumentSection(pageId, zone, section.id, 'up')"><i class="bi bi-arrow-up"></i></button>
            <button type="button" title="Move section down" :disabled="sectionIndex === slot.sections.length - 1" @click.stop="builder.moveDocumentSection(pageId, zone, section.id, 'down')"><i class="bi bi-arrow-down"></i></button>
            <button type="button" title="Duplicate section" @click.stop="builder.duplicateDocumentSection(pageId, zone, section.id)"><i class="bi bi-copy"></i></button>
            <button type="button" :title="section.props?.hidden ? 'Show section' : 'Hide section'" @click.stop="builder.updateDocumentSectionProps(pageId, zone, section.id, { hidden: !section.props?.hidden })"><i :class="section.props?.hidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i></button>
            <button type="button" class="site-slot-delete-section is-danger" title="Delete section" @click.stop="requestSectionRemoval(section)"><i class="bi bi-trash3"></i><span>Delete section</span></button>
          </template>
        </div>
      </div>

      <div v-if="section.props?.hidden && canEdit" class="site-slot-hidden"><i class="bi bi-eye-slash"></i> This section is hidden.</div>
      <div v-else class="site-slot-container" :style="containerStyle(section)">
        <div class="site-slot-grid">
          <div
            v-for="column in section.columns"
            :key="column.id"
            class="site-slot-column"
            :style="columnStyle(column)"
            @dragover="dragOver"
            @drop="onDrop($event, column, column.blocks.length)"
          >
            <article
              v-for="(block, blockIndex) in column.blocks"
              v-show="!block.props?.hidden || canEdit"
              :key="block.id"
              class="site-slot-block"
              :class="{ 'is-selected': isSelected('block', block.id), 'is-hidden': block.props?.hidden }"
              :style="blockStyle(block)"
              @dragover.stop="dragOver"
              @drop.stop="onDrop($event, column, blockIndex)"
              @click="selectBlock($event, block)"
            >
              <div v-if="canEdit && isSelected('block', block.id)" class="site-slot-block-tools" role="toolbar" :aria-label="`${block.type} controls`">
                <span class="site-slot-block-handle" draggable="true" title="Drag to move" @dragstart="onDragStart($event, block)" @dragend="draggedBlock = null"><i class="bi bi-grip-vertical"></i></span>
                <template v-if="block.type === 'heading' || block.type === 'paragraph'">
                  <button type="button" title="Smaller text" @mousedown.prevent @click="adjustTextSize(block, -2)">A−</button>
                  <button type="button" title="Larger text" @mousedown.prevent @click="adjustTextSize(block, 2)">A+</button>
                  <button type="button" title="Bold" :class="{ active: block.props?.textStyle?.fontWeight === '700' }" @mousedown.prevent @click="toggleBold(block)"><i class="bi bi-type-bold"></i></button>
                  <button v-for="align in ['left', 'center', 'right']" :key="align" type="button" :title="`Align ${align}`" :class="{ active: (block.props?.textStyle?.textAlign || block.props?.align || 'left') === align }" @mousedown.prevent @click="setTextAlign(block, align)"><i :class="`bi bi-text-${align}`"></i></button>
                </template>
                <template v-else-if="block.type === 'image'">
                  <label class="site-slot-upload" :title="uploadingBlockId === block.id ? 'Uploading image' : 'Replace image'">
                    <i :class="uploadingBlockId === block.id ? 'bi bi-arrow-repeat' : 'bi bi-image'"></i>
                    <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploadingBlockId === block.id" @change="uploadImage($event, block)" />
                  </label>
                  <label class="site-slot-width"><span>Size</span><input type="range" min="25" max="100" step="5" :value="block.props?.maxWidth || 100" @pointerdown="builder.beginDocumentHistory" @input="builder.setDocumentBlockProps(pageId, zone, block.id, { maxWidth: Number($event.target.value) })" @change="builder.commitDocumentHistory" /></label>
                  <input class="site-slot-link-input" :value="block.props?.alt || ''" aria-label="Image alt text" placeholder="Alt text" @click.stop @change="builder.setDocumentBlockProps(pageId, zone, block.id, { alt: $event.target.value })" />
                  <button v-for="align in ['left', 'center', 'right']" :key="align" type="button" :title="`Align ${align}`" :class="{ active: (block.props?.align || 'center') === align }" @click="builder.setDocumentBlockProps(pageId, zone, block.id, { align })"><i :class="`bi bi-align-${align}`"></i></button>
                </template>
                <template v-else-if="block.type === 'button'">
                  <input class="site-slot-link-input" :value="block.props?.link || '/'" aria-label="Button link" @click.stop @change="builder.setDocumentBlockProps(pageId, zone, block.id, { link: $event.target.value })" />
                </template>
                <button type="button" title="Move up" @click="builder.moveDocumentBlockBy(pageId, zone, block.id, 'up')"><i class="bi bi-arrow-up"></i></button>
                <button type="button" title="Move down" @click="builder.moveDocumentBlockBy(pageId, zone, block.id, 'down')"><i class="bi bi-arrow-down"></i></button>
                <button type="button" title="Duplicate" @click="builder.duplicateDocumentBlock(pageId, zone, block.id)"><i class="bi bi-copy"></i></button>
                <button type="button" :title="block.props?.hidden ? 'Show block' : 'Hide block'" @click="builder.setDocumentBlockHidden(pageId, zone, block.id, !block.props?.hidden)"><i :class="block.props?.hidden ? 'bi bi-eye' : 'bi bi-eye-slash'"></i></button>
                <button type="button" class="is-danger" title="Delete" @click="builder.removeDocumentBlock(pageId, zone, block.id)"><i class="bi bi-trash3"></i></button>
              </div>

              <component
                v-if="block.type === 'heading'"
                :is="`h${block.props?.level || 2}`"
                class="site-slot-editable-text site-slot-heading"
                :style="blockTextStyle(block)"
                :contenteditable="canEdit ? 'true' : 'false'"
                :spellcheck="canEdit"
                @click="startTextEdit($event, block)"
                @focus="startTextEdit($event, block)"
                @input="updateText($event, block)"
                @blur="finishTextEdit"
                @paste="cleanPaste"
                @keydown="keydownText($event, block)"
              >{{ block.props?.text }}</component>

              <p
                v-else-if="block.type === 'paragraph'"
                class="site-slot-editable-text site-slot-paragraph"
                :style="blockTextStyle(block)"
                :contenteditable="canEdit ? 'true' : 'false'"
                :spellcheck="canEdit"
                @click="startTextEdit($event, block)"
                @focus="startTextEdit($event, block)"
                @input="updateText($event, block)"
                @blur="finishTextEdit"
                @paste="cleanPaste"
                @keydown="keydownText($event, block)"
              >{{ block.props?.text }}</p>

              <figure v-else-if="block.type === 'image' && (block.props?.src || canEdit)" class="site-slot-image" :style="{ textAlign: block.props?.align || 'center' }">
                <img v-if="block.props?.src" :src="mediaUrl(block.props.src)" :alt="block.props?.alt || ''" :style="imageStyle(block)" />
                <label v-else class="site-slot-image-empty">
                  <i class="bi bi-image"></i><span>Add an image</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" @change="uploadImage($event, block)" />
                </label>
                <figcaption v-if="block.props?.caption">{{ block.props.caption }}</figcaption>
              </figure>

              <div v-else-if="block.type === 'button'" :style="{ textAlign: block.props?.align || 'left' }">
                <a
                  class="site-slot-button"
                  :class="`is-${block.props?.variant || 'primary'}`"
                  :href="canEdit ? undefined : buttonHref(block)"
                  :target="!canEdit && /^https:/i.test(buttonHref(block)) ? '_blank' : undefined"
                  rel="noopener"
                  @click="selectBlock($event, block)"
                >
                  <span
                    class="site-slot-editable-text"
                    :contenteditable="canEdit ? 'true' : 'false'"
                    :spellcheck="canEdit"
                    @focus="startTextEdit($event, block)"
                    @input="updateText($event, block)"
                    @blur="finishTextEdit"
                    @paste="cleanPaste"
                    @keydown="keydownText($event, block)"
                  >{{ block.props?.text }}</span>
                </a>
              </div>
            </article>

            <div v-if="canEdit" class="site-slot-add-blocks" role="group" aria-label="Add a block">
              <button type="button" @click.stop="addBlock('heading', section)"><i class="bi bi-type-h1"></i>Text</button>
              <button type="button" @click.stop="addBlock('image', section)"><i class="bi bi-image"></i>Image</button>
              <button type="button" @click.stop="addBlock('button', section)"><i class="bi bi-hand-index-thumb"></i>Button</button>
            </div>
          </div>
        </div>
      </div>

      <details v-if="canEdit && isSelected('section', section.id)" class="site-slot-more" @click.stop>
        <summary>More options</summary>
        <div class="site-slot-more-controls">
          <label>Columns
            <select :value="section.columns.map((column) => column.span).join('-')" @change="builder.setDocumentSectionColumns(pageId, zone, section.id, $event.target.value.split('-').map(Number))">
              <option value="12">One column</option>
              <option value="6-6">Two columns</option>
              <option value="4-4-4">Three columns</option>
            </select>
          </label>
          <label>Space
            <input type="range" min="0" max="160" step="8" :value="section.props?.paddingY ?? 48" @pointerdown="builder.beginDocumentHistory" @input="builder.updateDocumentSectionProps(pageId, zone, section.id, { paddingY: Number($event.target.value) })" @change="builder.commitDocumentHistory" />
          </label>
          <label>Background
            <input type="color" :value="/^#[\da-f]{3,8}$/i.test(section.props?.bg || '') ? section.props.bg : '#ffffff'" @input="builder.updateDocumentSectionProps(pageId, zone, section.id, { bg: $event.target.value })" />
          </label>
        </div>
      </details>
    </section>

    <div v-if="canEdit" class="site-slot-add-section">
      <button type="button" @click="addSection"><i class="bi bi-plus-lg"></i>Add section here</button>
      <span v-if="uploadError" role="alert">{{ uploadError }}</span>
    </div>
  </section>
</template>

<style scoped>
.site-content-slot { position: relative; min-width: 0; }
.site-content-slot.is-empty { min-height: 0; }
.site-slot-anchor { display: none; }
.site-content-slot.is-editing { margin: 10px 0; outline: 1px dashed rgba(59, 175, 184, .28); outline-offset: 4px; }
.site-content-slot.is-editing .site-slot-anchor { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 26px; padding: 4px 9px; border: 1px solid #b7e1e2; border-radius: 8px 8px 0 0; background: #f0fbfb; color: #237f86; font-family: Nunito, system-ui, sans-serif; font-size: .66rem; font-weight: 900; letter-spacing: .025em; }
.site-slot-anchor span { display: inline-flex; align-items: center; gap: 5px; }
.site-slot-anchor small { color: #6b8795; font-size: .58rem; font-weight: 800; }
.site-slot-section { position: relative; min-width: 0; scroll-margin-top: 92px; transition: outline-color .15s ease; }
.site-content-slot.is-editing .site-slot-section { outline: 1px dashed transparent; outline-offset: -1px; }
.site-content-slot.is-editing .site-slot-section:hover, .site-slot-section.is-selected { outline-color: rgba(59, 175, 184, .55); }
.site-slot-section.is-hidden { min-height: 48px; padding: 12px !important; background: #f8fbfc !important; }
.site-slot-container { width: min(100%, 1140px); margin: 0 auto; padding: 0 16px; box-sizing: border-box; }
.site-slot-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
.site-slot-column { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); min-width: 0; align-content: start; }
.site-slot-block { position: relative; min-width: 0; padding: 2px; border-radius: 7px; scroll-margin-top: 92px; }
.site-content-slot.is-editing .site-slot-block:hover, .site-slot-block.is-selected { box-shadow: 0 0 0 2px rgba(59, 175, 184, .68); background: rgba(59, 175, 184, .05); }
.site-slot-block.is-hidden { min-height: 30px; opacity: .58; }
.site-slot-section-tools, .site-slot-block-tools { position: relative; z-index: 7; display: flex; flex-wrap: wrap; align-items: center; gap: 3px; width: fit-content; max-width: min(100%, 540px); padding: 4px; border: 1px solid #b7e1e2; border-radius: 8px; background: #fff; color: #3e6478; box-shadow: 0 8px 20px rgba(31, 78, 107, .16); font-family: Nunito, system-ui, sans-serif; }
.site-slot-section-tools { justify-content: space-between; width: calc(100% - 12px); max-width: none; min-height: 37px; margin: 4px 6px; padding: 5px 7px; }
.site-content-slot.is-editing .site-slot-section-tools { position: sticky; top: 74px; z-index: 9; }
.site-slot-block-tools { margin: 4px 0; }
.site-slot-section-tools button, .site-slot-block-tools button, .site-slot-upload { display: inline-grid; width: 27px; height: 27px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #3d687d; cursor: pointer; font: inherit; font-size: .68rem; font-weight: 900; scroll-margin-top: 100px; }
.site-slot-section-tools button:hover:not(:disabled), .site-slot-block-tools button:hover, .site-slot-block-tools button.active, .site-slot-upload:hover { border-color: #88cdcf; background: #eafafa; color: #17656a; }
.site-slot-section-tools button:disabled { opacity: .35; cursor: not-allowed; }
.site-slot-section-tools .is-danger, .site-slot-block-tools .is-danger { color: #b3413e; }
.site-slot-drag-label { display: inline-flex; align-items: center; gap: 3px; padding: 0 3px; color: #237f86; font-size: .62rem; font-weight: 900; }
.site-slot-section-actions { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 3px; }
.site-slot-section-tools .site-slot-delete-section, .site-slot-section-tools .site-slot-delete-confirm, .site-slot-section-tools .site-slot-delete-cancel { display: inline-flex; width: auto; min-height: 28px; height: auto; align-items: center; justify-content: center; gap: 5px; padding: 5px 8px; border-width: 1px; font-size: .66rem; }
.site-slot-section-tools .site-slot-delete-section { border-color: #efc5c3; background: #fff5f4; color: #b3413e; }
.site-slot-section-tools .site-slot-delete-section:hover, .site-slot-section-tools .site-slot-delete-confirm:hover { border-color: #df9b98; background: #fee8e6; color: #9d302e; }
.site-slot-section-tools .site-slot-delete-confirm { border-color: #df9b98; background: #fff0ef; color: #a73734; }
.site-slot-section-tools .site-slot-delete-cancel { border-color: #c8dde1; background: #fff; color: #557285; }
.site-slot-delete-question { padding: 0 3px; color: #704544; font-size: .65rem; font-weight: 900; }
.site-slot-block-handle { display: inline-grid; width: 23px; height: 27px; place-items: center; cursor: grab; color: #237f86; }
.site-slot-block-handle:active { cursor: grabbing; }
.site-slot-width { display: inline-flex; align-items: center; gap: 4px; min-width: 82px; color: #557285; font-size: .58rem; font-weight: 800; }
.site-slot-width input { width: 54px; accent-color: #3bafb8; }
.site-slot-upload { position: relative; overflow: hidden; color: #237f86; }
.site-slot-upload input, .site-slot-image-empty input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.site-slot-link-input { width: min(150px, 26vw); min-height: 27px; padding: 3px 6px; border: 1px solid #b7dadd; border-radius: 6px; color: #365a70; font: inherit; font-size: .64rem; }
.site-slot-editable-text { outline: none; cursor: text; }
.site-content-slot.is-editing .site-slot-editable-text:focus { box-shadow: 0 0 0 2px rgba(59, 175, 184, .45); border-radius: 4px; background: rgba(255,255,255,.76); }
.site-slot-heading { color: #173f5f; line-height: 1.14; }
.site-slot-paragraph { color: #526879; line-height: 1.65; }
.site-slot-image { margin: 0; }
.site-slot-image img { display: block; max-width: 100%; height: auto; }
.site-slot-image figcaption { margin-top: 7px; color: #617b89; font-size: .83rem; }
.site-slot-image-empty { position: relative; display: grid; min-height: 150px; place-items: center; gap: 7px; border: 2px dashed #a7ced0; border-radius: 10px; background: #f4fbfb; color: #237f86; cursor: pointer; font-family: Nunito, system-ui, sans-serif; font-size: .76rem; font-weight: 900; }
.site-slot-image-empty i { font-size: 1.7rem; }
.site-slot-button { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 9px 16px; border: 1px solid transparent; border-radius: 8px; text-decoration: none; font-family: Nunito, system-ui, sans-serif; font-size: .86rem; font-weight: 900; }
.site-slot-button.is-primary { background: #3bafb8; color: #fff; }
.site-slot-button.is-secondary { background: #173f5f; color: #fff; }
.site-slot-button.is-outline { border-color: #3bafb8; background: #fff; color: #237f86; }
.site-slot-hidden { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; color: #65808e; font-family: Nunito, system-ui, sans-serif; font-size: .72rem; font-weight: 800; }
.site-slot-add-blocks { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 5px; min-height: 26px; margin-top: 6px; }
.site-slot-add-blocks button, .site-slot-add-section button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 29px; padding: 5px 9px; border: 1px dashed #8bcfd1; border-radius: 7px; background: #f7fdfd; color: #237f86; cursor: pointer; font: 800 .65rem Nunito, system-ui, sans-serif; }
.site-slot-add-blocks button:hover, .site-slot-add-section button:hover { border-style: solid; background: #e7f8f8; }
.site-slot-add-section { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 10px; border: 1px dashed #9bd6d7; background: #fbffff; color: #a23d39; font-family: Nunito, system-ui, sans-serif; font-size: .65rem; font-weight: 800; }
.site-slot-more { position: relative; z-index: 8; max-width: 380px; margin: 0 16px 8px auto; padding: 8px 10px; border: 1px solid #cfe5e6; border-radius: 8px; background: #fff; color: #4b6d7f; font-family: Nunito, system-ui, sans-serif; font-size: .7rem; }
.site-slot-more summary { cursor: pointer; color: #237f86; font-weight: 900; }
.site-slot-more-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
.site-slot-more-controls label { display: grid; gap: 4px; color: #5c7786; font-size: .61rem; font-weight: 800; }
.site-slot-more-controls select, .site-slot-more-controls input { min-width: 0; min-height: 26px; border: 1px solid #c8dde1; border-radius: 5px; color: #365a70; font: inherit; }
@media (max-width: 760px) {
  .site-slot-section-tools { position: relative; top: auto; right: auto; width: calc(100% - 12px); margin: 4px 6px; }
  .site-slot-section-actions { width: 100%; }
  .site-slot-delete-question { margin-right: auto; }
  .site-slot-block-tools { position: relative; top: auto; right: auto; margin: 4px 0; }
  .site-slot-container { padding: 0 12px; }
  .site-slot-more-controls { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .site-slot-section { transition: none; } }
</style>
