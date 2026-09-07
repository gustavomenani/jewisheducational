<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { init } from 'pptx-preview';
import api from '@/api';
import { useI18n } from '@/i18n';
import { googleSlidesEmbedUrlForFile } from '@/utils/googleSlides';
import { canvaEmbedUrl, canvaPresentationFile } from '@/utils/canva';
import { useBuilderStore } from '@/builder/store';
import EditableContentText from '@/builder/EditableContentText.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const builder = useBuilderStore();

const containerRef = ref(null);
const loading = ref(true);
const error = ref('');
const currentSlide = ref(1);
const totalSlides = ref(0);
const resource = ref(null);
const file = ref(null);

const editableResource = computed(() => {
  if (!resource.value || !builder.editMode || !builder.canEdit) return resource.value;
  const draft = builder.contentDraft?.materials?.find((item) => String(item.id) === String(resource.value.id));
  return draft ? { ...resource.value, ...draft } : resource.value;
});

const googleSlidesEmbedUrl = computed(() =>
  googleSlidesEmbedUrlForFile(file.value, resource.value?.google_slides_url)
);
const canvaPresentationEmbedUrl = computed(() =>
  String(route.params.fileId) === 'canva' ? canvaEmbedUrl(resource.value?.canva_url) : ''
);
const externalPresentationEmbedUrl = computed(() =>
  canvaPresentationEmbedUrl.value || googleSlidesEmbedUrl.value
);
const externalPresentationTitle = computed(() =>
  canvaPresentationEmbedUrl.value ? 'Canva presentation' : 'Google Slides presentation'
);

let previewer = null;
let presentationRequestId = 0;

const slideLabel = computed(() =>
  t('slideCounter')
    .replace('{current}', String(currentSlide.value))
    .replace('{total}', String(totalSlides.value || '—'))
);

const canGoPrev = computed(() => currentSlide.value > 1);
const canGoNext = computed(() => totalSlides.value > 0 && currentSlide.value < totalSlides.value);

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', handleResize);
  loadPresentation();
});

watch(
  () => [route.params.slug, route.params.fileId],
  () => loadPresentation()
);

onUnmounted(() => {
  presentationRequestId += 1;
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', handleResize);
  destroyPreviewer();
});

async function loadPresentation() {
  const requestId = ++presentationRequestId;
  loading.value = true;
  error.value = '';
  resource.value = null;
  file.value = null;
  currentSlide.value = 1;
  totalSlides.value = 0;
  destroyPreviewer();
  try {
    // 1. Fetch resource and find the file
    const { data: resourceData } = await api.get(`/resources/${route.params.slug}`);
    if (requestId !== presentationRequestId) return;
    resource.value = resourceData.resource;

    if (canvaPresentationEmbedUrl.value) {
      file.value = canvaPresentationFile(resource.value.canva_url);
      loading.value = false;
      return;
    }
    
    const match = (resource.value?.files || []).find(
      (f) => String(f.id) === String(route.params.fileId)
    );
    if (!match) {
      error.value = 'Presentation not found for this material.';
      loading.value = false;
      return;
    }
    file.value = match;

    if (googleSlidesEmbedUrl.value) {
      loading.value = false;
      return;
    }

    // 2. Fetch file content as arraybuffer
    const { data } = await api.get(
      `/downloads/view/${resource.value.id}/${file.value.id}`,
      { responseType: 'arraybuffer' }
    );
    if (requestId !== presentationRequestId) return;
    
    destroyPreviewer();
    
    // Set loading to false before rendering, so containerRef is visible and gets actual clientWidth/clientHeight
    loading.value = false;
    await nextTick();
    if (!containerRef.value) return;

    // 3. Render slides
    const mount = document.createElement('div');
    mount.className = 'k5-presentation-mount';
    containerRef.value.innerHTML = '';
    containerRef.value.appendChild(mount);

    renderSlides(data, mount, requestId);
  } catch (e) {
    if (requestId !== presentationRequestId) return;
    loading.value = false;
    if (e.response?.status === 401) {
      error.value = t('presentationLoginRequired');
    } else {
      error.value = e.response?.data?.error || t('presentationLoadError');
    }
  }
}

function renderSlides(data, mount, requestId) {
  if (!containerRef.value) return;
  const containerWidth = containerRef.value.clientWidth;
  const containerHeight = containerRef.value.clientHeight;
  
  // Fit to screen with 16:9 ratio
  let width = containerWidth - 32;
  let height = Math.round(width * 9 / 16);
  
  if (height > containerHeight - 32) {
    height = containerHeight - 32;
    width = Math.round(height * 16 / 9);
  }

  width = Math.max(320, width);
  height = Math.max(180, height);

  previewer = init(mount, { mode: 'slide', width, height });
  previewer.preview(data).then(() => {
    if (requestId !== presentationRequestId) return;
    totalSlides.value = previewer.slideCount || 0;
    currentSlide.value = (previewer.currentIndex ?? 0) + 1;
  }).catch(() => {
    if (requestId !== presentationRequestId) return;
    error.value = t('presentationLoadError');
  });
}

function handleResize() {
  if (externalPresentationEmbedUrl.value) return;
  // Yesple reload presentation view on window resize to re-fit slides
  if (previewer && file.value && resource.value) {
    loadPresentation();
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
}

function goBack() {
  if (resource.value) {
    router.push(`/resource/${resource.value.slug}`);
  } else {
    router.push('/library');
  }
}

function toggleFullScreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') goBack();
  if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevSlide();
  if (e.key === 'ArrowRight' || e.key === ' ' || e.code === 'Space' || e.key === 'PageDown') nextSlide();
}
</script>

<template>
  <div class="presentation-play-view" @contextmenu.prevent>
    <!-- Header -->
    <header class="presentation-header">
      <div class="header-left">
        <button type="button" class="exit-btn" @click="goBack" title="Back (Esc)" aria-label="Back to resource">
          <i class="bi bi-arrow-left"></i>
        </button>
        <EditableContentText v-if="editableResource" entity="material" :item="editableResource" field="title" tag="h1" class="presentation-title" placeholder="Material title…" />
        <h1 v-else class="presentation-title">Loading…</h1>
      </div>
      <div class="header-right">
        <button type="button" class="control-btn" @click="toggleFullScreen" title="Full screen" aria-label="Full screen">
          <i class="bi bi-fullscreen"></i>
        </button>
        <button type="button" class="control-btn close-x-btn" @click="goBack" title="Close" aria-label="Close">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
    </header>

    <!-- Slide Stage -->
    <main class="presentation-main">
      <div v-show="loading" class="state-container">
        <div class="spinner-border text-light"></div>
        <p class="mt-3">Preparing presentation...</p>
      </div>

      <div v-show="error && !loading" class="state-container">
        <i class="bi bi-exclamation-triangle-fill text-warning fs-1"></i>
        <p class="mt-3">{{ error }}</p>
        <button type="button" class="btn btn-outline-light mt-3" @click="goBack">Back</button>
      </div>

      <iframe
        v-if="externalPresentationEmbedUrl && !loading && !error"
        :src="externalPresentationEmbedUrl"
        class="google-slides-embed"
        :title="externalPresentationTitle"
        allow="autoplay; fullscreen"
        allowfullscreen
      ></iframe>
      <div v-else-if="!loading && !error" ref="containerRef" class="presentation-stage"></div>
    </main>

    <!-- Footer Toolbar -->
    <footer v-if="!loading && !error && totalSlides > 0" class="presentation-footer">
      <div class="navigation-controls">
        <button
          type="button"
          class="nav-btn"
          :disabled="!canGoPrev"
          @click="prevSlide"
          :aria-label="t('prevSlide')"
          title="Slide Previous (←)"
        >
          <i class="bi bi-chevron-left"></i>
        </button>
        
        <span class="slide-indicator">{{ slideLabel }}</span>
        
        <button
          type="button"
          class="nav-btn"
          :disabled="!canGoNext"
          @click="nextSlide"
          :aria-label="t('nextSlide')"
          title="Next slide (→ / Space)"
        >
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.presentation-play-view {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background-color: #090d16;
  color: #f8fafc;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  user-select: none;
}

/* Header styling */
.presentation-header {
  height: 60px;
  background-color: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  z-index: 10;
}
.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.exit-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}
.exit-btn:hover {
  color: #f8fafc;
  background-color: rgba(255, 255, 255, 0.08);
}
.presentation-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
  max-width: 50vw;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #f1f5f9;
}
.control-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}
.control-btn:hover {
  color: #f8fafc;
  background-color: rgba(255, 255, 255, 0.08);
}
.close-x-btn:hover {
  background-color: #ef4444;
  color: #fff;
}

/* Stage styling */
.presentation-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 1rem;
}
.presentation-stage {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.google-slides-embed {
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: 0;
  background: #fff;
}
.state-container {
  text-align: center;
}

/* Footer Toolbar styling */
.presentation-footer {
  height: 64px;
  background-color: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.navigation-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  background-color: rgba(255, 255, 255, 0.05);
  padding: 0.45rem 1.25rem;
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.nav-btn {
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 1.2rem;
  cursor: pointer;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: all 0.2s;
}
.nav-btn:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.15);
}
.nav-btn:disabled {
  color: #475569;
  cursor: not-allowed;
}
.slide-indicator {
  font-size: 0.95rem;
  font-weight: 600;
  color: #cbd5e1;
  min-width: 100px;
  text-align: center;
}

@media (fullscreen) {
  .presentation-header,
  .presentation-footer {
    display: none !important;
  }
  .presentation-main {
    padding: 0 !important;
    height: 100vh !important;
    width: 100vw !important;
    background-color: #000 !important;
  }
}
</style>

<style>
/* Global PPTX rendering overrides for fullscreen view */
.k5-presentation-mount {
  display: flex;
  align-items: center;
  justify-content: center;
}
.k5-presentation-mount > div {
  margin: 0 auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  overflow: hidden;
  background-color: #fff;
}
.presentation-stage div,
.presentation-stage section,
.presentation-stage span {
  overflow: hidden !important;
}
</style>
