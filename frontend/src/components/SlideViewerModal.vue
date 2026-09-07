<script setup>
import { ref, watch, computed, onUnmounted, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { init } from 'pptx-preview';
import api from '@/api';
import { useI18n } from '@/i18n';
import { googleSlidesEmbedUrlForFile } from '@/utils/googleSlides';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  resourceId: { type: [Number, String], default: null },
  file: { type: Object, default: null },
  canLoad: { type: Boolean, default: false },
  slug: { type: String, default: '' },
  googleSlidesUrl: { type: String, default: '' },
});

const emit = defineEmits(['update:modelValue', 'auth-required']);

const route = useRoute();
const routeSlug = computed(() => props.slug || route.params.slug);

const { t } = useI18n();
const containerRef = ref(null);
const modalRef = ref(null);
const closeButtonRef = ref(null);
const loading = ref(false);
const error = ref('');
const currentSlide = ref(1);
const totalSlides = ref(0);

const googleSlidesEmbedUrl = computed(() =>
  googleSlidesEmbedUrlForFile(props.file, props.googleSlidesUrl)
);

let previewer = null;
let previousActiveElement = null;
let presentationRequestSequence = 0;
let presentationController = null;

function isCanceledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

const slideLabel = computed(() =>
  t('slideCounter')
    .replace('{current}', String(currentSlide.value))
    .replace('{total}', String(totalSlides.value || '—'))
);

const canGoPrev = computed(() => currentSlide.value > 1);
const canGoNext = computed(() => totalSlides.value > 0 && currentSlide.value < totalSlides.value);

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      cancelPresentationLoad();
      destroyPreviewer();
      restoreFocus();
      return;
    }
    previousActiveElement = document.activeElement;
    currentSlide.value = 1;
    totalSlides.value = 0;
    error.value = '';
    await nextTick();
    if (closeButtonRef.value) closeButtonRef.value.focus();
    else modalRef.value?.focus();
    await loadPresentation();
  }
);

watch(
  () => [props.resourceId, props.file?.id, props.googleSlidesUrl],
  async ([resourceId, fileId], [previousResourceId, previousFileId] = []) => {
    if (!props.modelValue || (String(resourceId) === String(previousResourceId) && String(fileId) === String(previousFileId))) return;
    cancelPresentationLoad();
    destroyPreviewer();
    currentSlide.value = 1;
    totalSlides.value = 0;
    error.value = '';
    await loadPresentation();
  }
);

async function loadPresentation() {
  if (!props.resourceId || !props.file) return;
  if (!props.canLoad) {
    error.value = t('presentationLoginRequired');
    return;
  }
  const requestSequence = ++presentationRequestSequence;
  presentationController?.abort();
  const controller = new AbortController();
  presentationController = controller;
  const resourceId = props.resourceId;
  const fileId = props.file.id;
  loading.value = true;
  error.value = '';
  if (googleSlidesEmbedUrl.value) {
    loading.value = false;
    return;
  }
  try {
    const { data } = await api.get(
      `/downloads/view/${resourceId}/${fileId}`,
      { responseType: 'arraybuffer', signal: controller.signal }
    );
    if (requestSequence !== presentationRequestSequence || !props.modelValue || String(props.file?.id) !== String(fileId)) return;
    destroyPreviewer();
    
    // Set loading to false before rendering, so containerRef is visible and gets actual clientWidth/clientHeight
    loading.value = false;
    await nextTick();
    if (!containerRef.value) return;

    const mount = document.createElement('div');
    mount.className = 'k5-slide-viewer-mount';
    containerRef.value.innerHTML = '';
    containerRef.value.appendChild(mount);

    const width = Math.min(960, containerRef.value.clientWidth - 8 || 960);
    previewer = init(mount, { mode: 'slide', width, height: Math.round(width * 9 / 16) });
    await previewer.preview(data);
    totalSlides.value = previewer.slideCount || 0;
    currentSlide.value = (previewer.currentIndex ?? 0) + 1;
  } catch (e) {
    if (isCanceledRequest(e) || requestSequence !== presentationRequestSequence) return;
    loading.value = false;
    if (e.response?.status === 401) {
      error.value = t('presentationLoginRequired');
      emit('auth-required');
    } else {
      error.value = e.response?.data?.error || t('presentationLoadError');
    }
  } finally {
    if (requestSequence === presentationRequestSequence) loading.value = false;
    if (presentationController === controller) presentationController = null;
  }
}

function syncSlideIndex() {
  if (!previewer) return;
  currentSlide.value = (previewer.currentIndex ?? 0) + 1;
}

function prevSlide() {
  if (!previewer || !canGoPrev.value) return;
  previewer.renderPreSlide();
  syncSlideIndex();
}

function nextSlide() {
  if (!previewer || !canGoNext.value) return;
  previewer.renderNextSlide();
  syncSlideIndex();
}

function destroyPreviewer() {
  if (previewer) {
    previewer.destroy();
    previewer = null;
  }
  if (containerRef.value) containerRef.value.innerHTML = '';
  loading.value = false;
}

function close() {
  emit('update:modelValue', false);
}

function cancelPresentationLoad() {
  presentationRequestSequence += 1;
  presentationController?.abort();
  presentationController = null;
}

function focusableElements() {
  return Array.from(modalRef.value?.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

function onKeydown(e) {
  if (!props.modelValue) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  if (e.key === 'Tab') trapFocus(e);
  if (e.key === 'ArrowLeft') prevSlide();
  if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'Space' || e.key === 'PageDown') {
    e.preventDefault();
    nextSlide();
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  cancelPresentationLoad();
  destroyPreviewer();
  restoreFocus();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="k5-preview-fade">
      <div v-if="modelValue" class="k5-preview-modal-backdrop" role="presentation" @click.self="close">
        <div
          ref="modalRef"
          class="k5-slide-viewer-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`k5-slide-title-${resourceId || 'modal'}`"
          tabindex="-1"
        >
          <div class="k5-preview-modal-head">
            <h2 :id="`k5-slide-title-${resourceId || 'modal'}`" class="k5-preview-modal-title">{{ title || t('presentation') }}</h2>
            <div class="d-flex align-items-center">
              <a
                v-if="file && routeSlug"
                :href="`/resource/${routeSlug}/present/${file.id}`"
                target="_blank"
                rel="noopener noreferrer"
                class="k5-slide-external-btn me-3"
                title="Open in a new tab"
              >
                <i class="bi bi-box-arrow-up-right me-1"></i>
                <span>New tab</span>
              </a>
              <button ref="closeButtonRef" type="button" class="k5-preview-modal-close" :aria-label="t('close')" @click="close">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          <div class="k5-slide-viewer-body" @contextmenu.prevent>
            <div v-show="loading" class="k5-preview-modal-loading">
              <div class="spinner-border text-primary"></div>
              <p>{{ t('previewLoading') }}</p>
            </div>

            <div v-show="error && !loading" class="k5-preview-modal-empty">
              <i class="bi bi-lock"></i>
              <p>{{ error }}</p>
            </div>

            <iframe
              v-if="googleSlidesEmbedUrl && !loading && !error"
              :src="googleSlidesEmbedUrl"
              class="k5-google-slides-embed"
              title="Google Slides presentation"
              allow="autoplay; fullscreen"
              allowfullscreen
            ></iframe>
            <div v-else-if="!loading && !error" ref="containerRef" class="k5-slide-viewer-stage"></div>
          </div>

          <div v-if="!loading && !error && totalSlides > 0" class="k5-slide-viewer-toolbar">
            <button
              type="button"
              class="k5-slide-nav-btn"
              :disabled="!canGoPrev"
              :aria-label="t('prevSlide')"
              @click="prevSlide"
            >
              <i class="bi bi-chevron-left"></i>
            </button>
            <span class="k5-slide-counter">{{ slideLabel }}</span>
            <button
              type="button"
              class="k5-slide-nav-btn"
              :disabled="!canGoNext"
              :aria-label="t('nextSlide')"
              @click="nextSlide"
            >
              <i class="bi bi-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.k5-slide-external-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
  transition: all 0.2s ease;
  border: 1px solid #e2e8f0;
}
.k5-slide-external-btn:hover {
  background-color: #e2e8f0;
  color: #1e293b;
}
</style>
