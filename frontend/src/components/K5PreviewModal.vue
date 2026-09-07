<script setup>
import { ref, watch, computed, onUnmounted, onMounted, nextTick } from 'vue';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useI18n } from '@/i18n';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  resourceId: { type: [Number, String], default: null },
  worksheetFile: { type: Object, default: null },
  canLoadPdf: { type: Boolean, default: false },
  preferPdf: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'auth-required', 'download']);

const { t } = useI18n();
const loading = ref(false);
const error = ref('');
const previewBlobUrl = ref('');
const viewMode = ref('cover');
const modalRef = ref(null);
const closeButtonRef = ref(null);
let previousActiveElement = null;
let previewRequestSequence = 0;
let previewController = null;

function isCanceledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

const isPdfWorksheet = computed(() => {
  const mime = (props.worksheetFile?.mime_type || '').toLowerCase();
  const type = (props.worksheetFile?.file_type || '').toLowerCase();
  return mime.includes('pdf') || type === 'pdf';
});
const hasCover = computed(() => !!props.coverImage);
const canShowPdf = computed(() => isPdfWorksheet.value && props.canLoadPdf);
// The PDF is the default preview when it is available. The cover remains a
// secondary tab so a client can still inspect it without hiding the pages.
const showTabs = computed(() => hasCover.value && isPdfWorksheet.value);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      clearPreview();
      restoreFocus();
      return;
    }
    previousActiveElement = document.activeElement;
    error.value = '';
    viewMode.value = pickInitialMode();
    await nextTick();
    if (closeButtonRef.value) closeButtonRef.value.focus();
    else modalRef.value?.focus();
    if (viewMode.value === 'pdf') await loadPdfPreview();
  }
);

// The modal is reused for extra files. Do not reuse the previous blob after a
// card change or the user may see a different material than the selected one.
watch(
  () => props.worksheetFile?.id,
  async (fileId, previousId) => {
    if (!props.modelValue || fileId === previousId) return;
    clearPreview();
    viewMode.value = pickInitialMode();
    if (viewMode.value === 'pdf') await loadPdfPreview();
  }
);

watch(viewMode, async (mode) => {
  if (!props.modelValue || mode !== 'pdf') return;
  if (!previewBlobUrl.value && !loading.value) await loadPdfPreview();
});

function pickInitialMode() {
  if (isPdfWorksheet.value) return 'pdf';
  if (hasCover.value) return 'cover';
  return 'cover';
}

async function loadPdfPreview() {
  if (!props.resourceId || !props.worksheetFile) return;
  if (!props.canLoadPdf) {
    error.value = t('previewLoginRequired');
    emit('auth-required', { type: 'preview', file: props.worksheetFile });
    return;
  }
  if (previewBlobUrl.value) return;
  const requestSequence = ++previewRequestSequence;
  previewController?.abort();
  const controller = new AbortController();
  previewController = controller;
  const resourceId = props.resourceId;
  const fileId = props.worksheetFile.id;
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(
      `/downloads/view/${resourceId}/${fileId}`,
      { responseType: 'blob', signal: controller.signal }
    );
    if (requestSequence !== previewRequestSequence || !props.modelValue || String(props.worksheetFile?.id) !== String(fileId)) return;
    previewBlobUrl.value = URL.createObjectURL(data);
  } catch (e) {
    if (isCanceledRequest(e) || requestSequence !== previewRequestSequence) return;
    if (e.response?.status === 401) {
      error.value = t('previewLoginRequired');
      emit('auth-required');
      if (hasCover.value) viewMode.value = 'cover';
    } else {
      error.value = e.response?.data?.error || t('previewLoadError');
      if (hasCover.value) viewMode.value = 'cover';
    }
  } finally {
    if (requestSequence === previewRequestSequence) loading.value = false;
    if (previewController === controller) previewController = null;
  }
}

function clearPreview() {
  previewRequestSequence += 1;
  previewController?.abort();
  previewController = null;
  if (previewBlobUrl.value) {
    URL.revokeObjectURL(previewBlobUrl.value);
    previewBlobUrl.value = '';
  }
  loading.value = false;
  error.value = '';
}

function close() {
  emit('update:modelValue', false);
}

function focusableElements() {
  return Array.from(modalRef.value?.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
  ) || []);
}

function trapFocus(event) {
  if (event.key !== 'Tab' || !props.modelValue) return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    modalRef.value?.focus();
    return;
  }
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreFocus() {
  const target = previousActiveElement;
  previousActiveElement = null;
  if (target && target !== document.body && target.isConnected) {
    nextTick(() => target.focus({ preventScroll: true }));
  }
}

function requestDownload() {
  if (props.worksheetFile) emit('download', props.worksheetFile);
}

function onKeydown(e) {
  if (!props.modelValue) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  else if (e.key === 'Tab') trapFocus(e);
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  clearPreview();
  restoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="k5-preview-fade">
      <div v-if="modelValue" class="k5-preview-modal-backdrop" role="presentation" @click.self="close">
        <div
          ref="modalRef"
          class="k5-preview-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`k5-preview-title-${resourceId || 'modal'}`"
          tabindex="-1"
        >
          <div class="k5-preview-modal-head">
            <h2 :id="`k5-preview-title-${resourceId || 'modal'}`" class="k5-preview-modal-title">{{ title || t('preview') }}</h2>
            <div v-if="showTabs" class="k5-preview-modal-tabs">
              <button
                type="button"
                class="k5-preview-tab"
                :class="{ active: viewMode === 'cover' }"
                @click="viewMode = 'cover'"
              >
                {{ t('previewCover') }}
              </button>
              <button
                type="button"
                class="k5-preview-tab"
                :class="{ active: viewMode === 'pdf' }"
                @click="viewMode = 'pdf'"
              >
                {{ t('previewPdf') }}
              </button>
            </div>
            <div class="k5-preview-modal-actions">
              <button
                v-if="worksheetFile"
                type="button"
                class="k5-preview-modal-tool k5-preview-modal-tool-primary"
                title="Download file"
                @click="requestDownload"
              >
                <i class="bi bi-download me-1"></i><span>Download</span>
              </button>
            </div>
            <button ref="closeButtonRef" type="button" class="k5-preview-modal-close" :aria-label="t('close')" @click="close">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div class="k5-preview-modal-body" @contextmenu.prevent>
            <div v-if="loading && viewMode === 'pdf'" class="k5-preview-modal-loading">
              <div class="spinner-border text-primary"></div>
              <p>{{ t('previewLoading') }}</p>
            </div>

            <img
              v-else-if="viewMode === 'cover' && hasCover"
              :src="mediaUrl(coverImage)"
              :alt="title"
              class="k5-preview-modal-img"
              draggable="false"
              @contextmenu.prevent
            />

            <iframe
              v-else-if="viewMode === 'pdf' && previewBlobUrl"
              :src="previewBlobUrl"
              class="k5-preview-modal-frame"
              title="Full PDF preview"
              allow="fullscreen"
            ></iframe>

            <div v-else-if="viewMode === 'pdf' && error" class="k5-preview-modal-empty">
              <i class="bi bi-lock"></i>
              <p>{{ error }}</p>
            </div>

            <div v-else class="k5-preview-modal-empty">
              <i class="bi bi-file-earmark-text"></i>
              <p>{{ t('previewUnavailable') }}</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.k5-preview-modal-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
}
.k5-preview-modal-tool {
  border: 1px solid #cde3ea;
  border-radius: 999px;
  background: #fff;
  color: #2e7d9a;
  padding: 0.3rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.k5-preview-modal-tool:hover,
.k5-preview-modal-tool:focus-visible {
  background: #eef8fa;
}
.k5-preview-modal-tool-primary {
  background: #2e7d9a;
  border-color: #2e7d9a;
  color: #fff;
}
.k5-preview-modal-tool-primary:hover,
.k5-preview-modal-tool-primary:focus-visible {
  background: #23677d;
  color: #fff;
}
@media (max-width: 600px) {
  .k5-preview-modal-head {
    flex-wrap: wrap;
  }
  .k5-preview-modal-title {
    flex: 1 1 55%;
  }
  .k5-preview-modal-tabs {
    order: 3;
    margin-left: 0;
  }
  .k5-preview-modal-actions {
    order: 2;
  }
  .k5-preview-modal-tool span {
    display: none;
  }
  .k5-preview-modal-tool {
    padding: 0.35rem 0.5rem;
  }
}
</style>
