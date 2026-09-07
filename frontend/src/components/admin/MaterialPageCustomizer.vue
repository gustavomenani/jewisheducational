<script setup>
import { ref } from 'vue';
import { mediaUrl } from '@/utils/media';
import {
  RESOURCE_PAGE_BLOCK_DEFS,
  HERO_LAYOUT_OPTIONS,
  PAGE_BG_SIZE_OPTIONS,
  PAGE_BG_REPEAT_OPTIONS,
} from '@/utils/resourcePage';

const props = defineProps({
  blockOrder: { type: Array, required: true },
  layout: { type: Object, required: true },
  displayMode: { type: String, default: 'default' },
  uploadingField: { type: String, default: '' },
});

const emit = defineEmits(['update:blockOrder', 'upload']);

const dragIndex = ref(null);
const dropIndex = ref(null);
const expandedId = ref(null);

function isEnabled(blockId) {
  const block = props.layout[blockId];
  if (!block) return false;
  if (blockId === 'grid' && props.displayMode !== 'grid') return false;
  return block.enabled !== false;
}

function toggleEnabled(blockId) {
  if (!props.layout[blockId]) return;
  props.layout[blockId].enabled = !isEnabled(blockId);
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

function uploadImage(event, fieldPath) {
  emit('upload', event, fieldPath);
}

function addGalleryImage() {
  props.layout.gallery.images.push({ url: '', caption: '' });
}

function removeGalleryImage(index) {
  props.layout.gallery.images.splice(index, 1);
}

function visibleBlocks() {
  return props.blockOrder.filter((id) => {
    if (id === 'grid') return props.displayMode === 'grid';
    return true;
  });
}
</script>

<template>
  <div class="block-editor">
    <p class="block-editor-hint text-muted small mb-3">
      <i class="bi bi-grip-vertical me-1"></i>
      Drag to change the order of this resource page. Expand each block to edit text and images.
    </p>

    <div v-if="displayMode === 'grid'" class="alert alert-info py-2 small mb-3">
      <i class="bi bi-grid-3x3-gap me-1"></i>
      <strong>Grid collection</strong> mode is active — the "Letter/sheet grid" block appears on the public page.
    </div>

    <div class="block-editor-list">
      <article
        v-for="(blockId, index) in visibleBlocks()"
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
          <button type="button" class="block-editor-handle" aria-label="Drag" @click.stop @mousedown.stop>
            <i class="bi bi-grip-vertical"></i>
          </button>
          <span class="block-editor-icon" :class="`tone-${RESOURCE_PAGE_BLOCK_DEFS[blockId]?.previewTone}`">
            <i :class="RESOURCE_PAGE_BLOCK_DEFS[blockId]?.icon"></i>
          </span>
          <div class="block-editor-meta">
            <strong>{{ RESOURCE_PAGE_BLOCK_DEFS[blockId]?.title }}</strong>
            <small v-if="blockId === 'grid' && displayMode !== 'grid'" class="text-warning d-block">Only appears in grid mode</small>
          </div>
          <div class="block-editor-actions" @click.stop>
            <button type="button" class="btn btn-sm btn-link block-editor-move" :disabled="index === 0" @click="moveBlock(index, -1)">
              <i class="bi bi-chevron-up"></i>
            </button>
            <button type="button" class="btn btn-sm btn-link block-editor-move" :disabled="index === blockOrder.length - 1" @click="moveBlock(index, 1)">
              <i class="bi bi-chevron-down"></i>
            </button>
            <button
              type="button"
              class="btn btn-sm block-editor-visibility"
              :class="isEnabled(blockId) ? 'btn-outline-success' : 'btn-outline-secondary'"
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
          <!-- Hero -->
          <div v-if="blockId === 'hero'" class="row g-3">
            <div class="col-md-6">
              <label class="admin-form-label">Header layout</label>
              <select v-model="layout.hero.layout" class="form-select">
                <option v-for="opt in HERO_LAYOUT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Header background color</label>
              <div class="input-group">
                <input v-model="layout.hero.bg_color" type="color" class="form-control form-control-color" />
                <input v-model="layout.hero.bg_color" type="text" class="form-control font-monospace small" placeholder="#ffffff or blank" />
              </div>
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Title (blank uses the resource title)</label>
              <input v-model="layout.hero.title" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Subtitle (blank uses the short summary)</label>
              <input v-model="layout.hero.subtitle" class="form-control" />
            </div>
            <div class="col-12">
              <label class="admin-form-label">Header background image</label>
              <div class="input-group">
                <input v-model="layout.hero.bg_image" class="form-control" placeholder="Image URL" />
                <label class="btn btn-outline-secondary mb-0">
                  <i class="bi bi-upload"></i>
                  <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, 'hero.bg_image')" />
                </label>
              </div>
            </div>
            <div class="col-md-4">
              <label class="admin-form-label">Primary button text</label>
              <input v-model="layout.hero.primary_btn_text" class="form-control" placeholder="Preview / Download" />
            </div>
            <div class="col-md-8 d-flex flex-wrap gap-3 align-items-end">
              <div class="form-check form-switch">
                <input id="h-cover" v-model="layout.hero.show_cover" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="h-cover">Show cover</label>
              </div>
              <div class="form-check form-switch">
                <input id="h-save" v-model="layout.hero.show_save_btn" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="h-save">Save button</label>
              </div>
              <div class="form-check form-switch">
                <input id="h-meta" v-model="layout.hero.show_meta" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="h-meta">Category / age</label>
              </div>
              <div class="form-check form-switch">
                <input id="h-crumb" v-model="layout.hero.show_breadcrumb" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="h-crumb">Breadcrumb</label>
              </div>
            </div>
          </div>

          <!-- About -->
          <div v-else-if="blockId === 'about'" class="row g-3">
            <div class="col-12">
              <label class="admin-form-label">Section title</label>
              <input v-model="layout.about.title" class="form-control" />
            </div>
            <p class="col-12 text-muted small mb-0">
              This text comes from the "What is in this file" field on the Content tab.
            </p>
          </div>

          <!-- Gallery -->
          <div v-else-if="blockId === 'gallery'">
            <div class="d-flex justify-content-between mb-2">
              <label class="admin-form-label mb-0">Extra images on the page</label>
              <button type="button" class="btn btn-sm btn-outline-primary" @click="addGalleryImage">
                <i class="bi bi-plus-lg"></i> Add image
              </button>
            </div>
            <div v-for="(img, gi) in layout.gallery.images" :key="gi" class="appearance-activity-row mb-2 p-2 border rounded">
              <div class="row g-2 align-items-center">
                <div class="col-md-6">
                  <div class="input-group input-group-sm">
                    <input v-model="img.url" class="form-control" placeholder="URL" />
                    <label class="btn btn-outline-secondary mb-0">
                      <i class="bi bi-upload"></i>
                      <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, `gallery.${gi}`)" />
                    </label>
                  </div>
                </div>
                <div class="col-md-5">
                  <input v-model="img.caption" class="form-control form-control-sm" placeholder="Caption (optional)" />
                </div>
                <div class="col-md-1 text-end">
                  <button type="button" class="btn btn-sm btn-outline-danger admin-action-btn" @click="removeGalleryImage(gi)">
                    <i class="bi bi-trash3"></i>
                  </button>
                </div>
              </div>
              <img v-if="img.url" :src="mediaUrl(img.url)" alt="" class="appearance-thumb mt-2" />
            </div>
          </div>

          <!-- Grid -->
          <div v-else-if="blockId === 'grid'" class="row g-3">
            <div class="col-12">
              <label class="admin-form-label">Grid title</label>
              <input v-model="layout.grid.title" class="form-control" />
            </div>
            <div class="col-12">
              <label class="admin-form-label">Supporting text</label>
              <textarea v-model="layout.grid.subtitle" class="form-control" rows="2"></textarea>
            </div>
          </div>

          <!-- Viewer -->
          <div v-else-if="blockId === 'viewer'" class="row g-3">
            <div class="col-12">
              <label class="admin-form-label">Viewer title (optional)</label>
              <input v-model="layout.viewer.title" class="form-control" placeholder="Preview" />
            </div>
          </div>

          <!-- Sidebar -->
          <div v-else-if="blockId === 'sidebar'" class="row g-3">
            <div class="col-md-6">
              <label class="admin-form-label">File list title</label>
              <input v-model="layout.sidebar.title" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Title (grid mode)</label>
              <input v-model="layout.sidebar.selected_title" class="form-control" />
            </div>
          </div>

          <!-- CTA -->
          <div v-else-if="blockId === 'cta'" class="row g-3">
            <div class="col-md-6">
              <label class="admin-form-label">Banner title</label>
              <input v-model="layout.cta.title" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Background color</label>
              <div class="input-group">
                <input v-model="layout.cta.bg_color" type="color" class="form-control form-control-color" />
                <input v-model="layout.cta.bg_color" type="text" class="form-control font-monospace small" />
              </div>
            </div>
            <div class="col-12">
              <label class="admin-form-label">Text</label>
              <textarea v-model="layout.cta.text" class="form-control" rows="2"></textarea>
            </div>
            <div class="col-md-4">
              <label class="admin-form-label">Button</label>
              <input v-model="layout.cta.button_text" class="form-control" />
            </div>
            <div class="col-md-4">
              <label class="admin-form-label">Button link</label>
              <input v-model="layout.cta.button_link" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Background image</label>
              <div class="input-group">
                <input v-model="layout.cta.bg_image" class="form-control" />
                <label class="btn btn-outline-secondary mb-0">
                  <i class="bi bi-upload"></i>
                  <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, 'cta.bg_image')" />
                </label>
              </div>
            </div>
            <div class="col-md-6">
              <label class="admin-form-label">Side image</label>
              <div class="input-group">
                <input v-model="layout.cta.image" class="form-control" />
                <label class="btn btn-outline-secondary mb-0">
                  <i class="bi bi-upload"></i>
                  <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, 'cta.image')" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <div class="mt-4 p-3 border rounded resource-page-style-panel">
      <h3 class="h6 mb-1"><i class="bi bi-brush me-1"></i>Full-page background and CSS</h3>
      <p class="text-muted small mb-3">
        Customize the background of the entire resource page and its CSS, just like WordPress (Appearance → Additional CSS).
      </p>
      <div class="row g-3">
        <div class="col-md-4">
          <label class="admin-form-label">Page background color</label>
          <div class="input-group">
            <input v-model="layout.theme.page_bg_color" type="color" class="form-control form-control-color" />
            <input v-model="layout.theme.page_bg_color" type="text" class="form-control font-monospace small" placeholder="#f5f5f5 or blank" />
          </div>
        </div>
        <div class="col-md-4">
          <label class="admin-form-label">Text color</label>
          <div class="input-group">
            <input v-model="layout.theme.text_color" type="color" class="form-control form-control-color" />
            <input v-model="layout.theme.text_color" type="text" class="form-control font-monospace small" placeholder="Blank = default" />
          </div>
        </div>
        <div class="col-md-4">
          <label class="admin-form-label">Accent color (buttons)</label>
          <div class="input-group">
            <input v-model="layout.theme.accent_color" type="color" class="form-control form-control-color" />
            <input v-model="layout.theme.accent_color" type="text" class="form-control font-monospace small" placeholder="Blank = default" />
          </div>
        </div>

        <div class="col-12">
          <label class="admin-form-label">Full-page background image</label>
          <div class="input-group">
            <input v-model="layout.theme.page_bg_image" class="form-control" placeholder="/uploads/covers/background.png" />
            <label class="btn btn-outline-secondary mb-0" :class="{ disabled: uploadingField === 'theme.page_bg_image' }">
              <i class="bi bi-upload"></i>
              <input type="file" accept="image/*" class="d-none" @change="uploadImage($event, 'theme.page_bg_image')" />
            </label>
          </div>
          <img v-if="layout.theme.page_bg_image" :src="mediaUrl(layout.theme.page_bg_image)" alt="" class="appearance-thumb mt-2" />
        </div>

        <div v-if="layout.theme.page_bg_image" class="col-md-4">
          <label class="admin-form-label">Image mode</label>
          <select v-model="layout.theme.page_bg_size" class="form-select">
            <option v-for="opt in PAGE_BG_SIZE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div v-if="layout.theme.page_bg_image" class="col-md-4">
          <label class="admin-form-label">Repeat</label>
          <select v-model="layout.theme.page_bg_repeat" class="form-select">
            <option v-for="opt in PAGE_BG_REPEAT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div v-if="layout.theme.page_bg_image" class="col-md-4">
          <label class="admin-form-label">Position</label>
          <select v-model="layout.theme.page_bg_position" class="form-select">
            <option value="center center">Center</option>
            <option value="top center">Top</option>
            <option value="bottom center">Bottom</option>
            <option value="left center">Left</option>
            <option value="right center">Right</option>
          </select>
        </div>
        <div v-if="layout.theme.page_bg_image" class="col-md-6">
          <label class="admin-form-label">Image overlay</label>
          <input
            v-model="layout.theme.page_bg_overlay"
            class="form-control font-monospace small"
            placeholder="rgba(255,255,255,0.9) — keeps text readable"
          />
        </div>
        <div v-if="layout.theme.page_bg_image" class="col-md-6 d-flex align-items-end">
          <div class="form-check form-switch mb-2">
            <input id="page-bg-fixed" v-model="layout.theme.page_bg_fixed" class="form-check-input" type="checkbox" />
            <label class="form-check-label" for="page-bg-fixed">Fixed background while scrolling (parallax)</label>
          </div>
        </div>

        <div class="col-12">
          <label class="admin-form-label">Custom CSS for this page</label>
          <textarea
            v-model="layout.theme.custom_css"
            class="form-control font-monospace small"
            rows="8"
            placeholder=".resource-detail-page { background: #fff5e6; }
.resource-detail-title { font-size: 2.5rem; color: #1a365d; }
.resource-preview-card { border-radius: 24px; box-shadow: 0 8px 32px rgba(0,0,0,0.12); }
.resource-about-box { background: rgba(255,255,255,0.95); }"
          ></textarea>
          <div class="form-text">
            Useful selectors:
            <code>.resource-detail-page</code>,
            <code>.resource-detail-title</code>,
            <code>.resource-detail-lead</code>,
            <code>.resource-about-box</code>,
            <code>.resource-preview-card</code>,
            <code>.resource-viewer-card</code>,
            <code>.resource-files-card</code>
          </div>
        </div>
      </div>

      <div
        v-if="layout.theme.page_bg_color || layout.theme.page_bg_image"
        class="resource-page-style-preview mt-3"
        :style="{
          backgroundColor: layout.theme.page_bg_color || undefined,
          backgroundImage: layout.theme.page_bg_image ? `url(${mediaUrl(layout.theme.page_bg_image)})` : undefined,
          backgroundSize: layout.theme.page_bg_size,
          backgroundPosition: layout.theme.page_bg_position,
          backgroundRepeat: layout.theme.page_bg_repeat,
          color: layout.theme.text_color || undefined,
        }"
      >
        <div
          v-if="layout.theme.page_bg_overlay"
          class="resource-page-style-preview-overlay"
          :style="{ background: layout.theme.page_bg_overlay }"
        ></div>
        <span class="resource-page-style-preview-label">Page background preview</span>
      </div>
    </div>
  </div>
</template>
