<script setup>
import { ref, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue';
import { useRoute, RouterLink, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { parseResourcePageLayout } from '@/utils/resourcePage';
import K5CategorySidebar from '@/components/K5CategorySidebar.vue';
import AuthModal from '@/components/AuthModal.vue';
import DownloadPaywallModal from '@/components/DownloadPaywallModal.vue';
import SelectFolderModal from '@/components/SelectFolderModal.vue';
import K5WorksheetActions from '@/components/K5WorksheetActions.vue';
import K5PreviewModal from '@/components/K5PreviewModal.vue';
import EditableSetting from '@/builder/EditableSetting.vue';
import EditableContentText from '@/builder/EditableContentText.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';

const SlideViewerModal = defineAsyncComponent(() => import('@/components/SlideViewerModal.vue'));
import { useAuthStore } from '@/stores';
import { useI18n } from '@/i18n';
import { extraWorksheetFiles, pickWorksheetFile, pickBundleFile, isPresentationResource, isPresentationFile } from '@/utils/resourceFiles';
import { setResourceMeta } from '@/utils/seo';
import { isMaterialActionEnabled } from '@/utils/materialActions';
import { trackInteraction } from '@/analytics';
import { useSettingsStore } from '@/stores';
import { useBuilderStore } from '@/builder/store';
import { categoryVisibleInDraft } from '@/builder/contentModel';
import { visibleCategoriesForVisitors } from '@/utils/categoryTree';
import { canvaEmbedUrl, canvaPresentationFile } from '@/utils/canva';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const settingsStore = useSettingsStore();
const builder = useBuilderStore();
const { t, isEn } = useI18n();
const { isLoggedIn } = storeToRefs(auth);

const resource = ref(null);
const categories = ref([]);
const loading = ref(true);
const resourceError = ref('');
const showAuthModal = ref(false);
const authModalTab = ref('login');
const isFavorited = ref(false);
const favoriteLoading = ref(false);
const favoriteError = ref('');
const downloadQuota = ref(null);
const downloadError = ref('');
const paywallSettings = ref({});
const showPaywallModal = ref(false);
const showFolderModal = ref(false);
const paywallModalType = ref('limit');
const paywallResetMessage = ref('');
const paywallErrorMessage = ref('');
const isPremiumUser = ref(false);
const showPreviewModal = ref(false);
const previewPreferPdf = ref(false);
const previewFile = ref(null);
const showSlideViewer = ref(false);
const slideViewerFile = ref(null);
const pendingAuthAction = ref(null);

let resourceRequestId = 0;
let resourceAbortController = null;
let quotaRequestId = 0;

const editableCategories = computed(() => {
  const draft = builder.contentDraft?.categories;
  const source = builder.editMode && builder.canEdit && Array.isArray(draft)
    ? draft.filter((category) => categoryVisibleInDraft(category, draft))
    : categories.value;
  return visibleCategoriesForVisitors(source);
});

const contentParagraphs = computed(() => {
  const text = editableResource.value?.content_description || '';
  return text.split(/\n\n+/).filter(Boolean);
});

const visibleMaterialFiles = computed(() => (editableResource.value?.files || []).filter((file) => {
  // Archived files remain visible to an administrator in the editor, but
  // never leak into the public preview/download surface.
  return (builder.editMode && builder.canEdit) || !file.is_archived;
}));

const linkedCanvaFile = computed(() => canvaPresentationFile(editableResource.value?.canva_url));
const canvaInlineEmbedUrl = computed(() => canvaEmbedUrl(editableResource.value?.canva_url));
const actionMaterialFiles = computed(() => linkedCanvaFile.value
  ? [linkedCanvaFile.value, ...visibleMaterialFiles.value]
  : visibleMaterialFiles.value
);

const moreWorksheetFiles = computed(() => extraWorksheetFiles(visibleMaterialFiles.value));

const bundleFile = computed(() => pickBundleFile(visibleMaterialFiles.value));

// A material made only from one complete PDF still needs a working preview.
// When split pages exist, the regular worksheet remains the free primary file
// and the complete PDF is exposed by K5WorksheetActions as a separate action.
const previewWorksheetFile = computed(() => pickWorksheetFile(actionMaterialFiles.value) || bundleFile.value);

const isPresentation = computed(() => isPresentationResource(actionMaterialFiles.value));

const materialActionVisibility = computed(() => {
  const raw = editableResource.value?.action_visibility
    ?? editableResource.value?.actionVisibility;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
});

function materialActionEnabled(actionId) {
  const overrides = materialActionVisibility.value || {};
  const value = overrides[actionId]
    ?? (actionId === 'worksheet' ? overrides.download : undefined)
    ?? overrides[`${actionId}_visible`]
    ?? overrides[`show_${actionId}`];
  if (value !== undefined && value !== null && value !== '') {
    return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
  }
  return isMaterialActionEnabled(settingsStore.settings, actionId);
}

const previewActionEnabled = computed(() => materialActionEnabled('preview') && !!previewWorksheetFile.value);

// The protected API object remains intact for downloads/favorites. In edit
// mode the Content tab overlays its draft fields so the page updates live.
const editableResource = computed(() => {
  const base = resource.value;
  if (!base || !builder.editMode || !builder.canEdit) return base;
  const draft = builder.contentDraft?.materials?.find((item) =>
    String(item.id) === String(base.id) || item.slug === base.slug
  );
  return draft ? { ...base, ...draft, files: draft.files?.length ? draft.files : base.files } : base;
});
const pageLayout = computed(() => parseResourcePageLayout(editableResource.value?.page_layout));
const displayCover = computed(() => {
  const item = editableResource.value;
  return item?.cover_image && (!item.cover_hidden || (builder.editMode && builder.canEdit)) ? item.cover_image : '';
});
const displayTitle = computed(() => pageLayout.value.hero.title || editableResource.value?.title || '');
const displaySubtitle = computed(() => pageLayout.value.hero.subtitle || editableResource.value?.description || '');
const resourceCategory = computed(() => editableCategories.value.find((category) =>
  Number(category.id) === Number(editableResource.value?.category_id)
  || category.slug === editableResource.value?.category_slug
) || null);
const parentResourceCategory = computed(() => editableCategories.value.find((category) => (
  category.slug === resource.value?.parent_category_slug
  || Number(category.id) === Number(resource.value?.parent_category_id)
)) || null);
const titleBinding = computed(() => ({
  entity: 'material',
  field: pageLayout.value.hero.title ? 'page_layout.hero.title' : 'title',
}));
const subtitleBinding = computed(() => ({
  entity: 'material',
  field: pageLayout.value.hero.subtitle ? 'page_layout.hero.subtitle' : 'description',
}));

const isGallery = computed(() => editableResource.value?.display_mode === 'gallery');

function selectMaterialFromCanvas(event) {
  if (!builder.editMode || !builder.canEdit || !resource.value) return false;
  event?.preventDefault();
  event?.stopPropagation();
  window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { entity: 'material', id: resource.value.id },
  }));
  return true;
}

function selectMaterialFromCanvasKeyboard(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectMaterialFromCanvas(event);
}

function fileDisplayName(file) {
  return file.label || file.original_name;
}

// Card da galeria: usa a miniatura do próprio arquivo; se não houver,
// cai na capa do material e, por último, num ícone genérico.
function fileThumb(file) {
  if (file.thumbnail) return mediaUrl(file.thumbnail);
  if (displayCover.value) return mediaUrl(displayCover.value);
  return '';
}

onMounted(async () => {
  await Promise.all([loadResource(), loadCategories()]);
});

async function loadCategories() {
  try {
    const { data } = await api.get('/categories');
    categories.value = data.categories || [];
  } catch { /* sidebar de categorys é opcional */ }
}

const sidebarRootCategory = computed(() => {
  if (!editableCategories.value.length || !resource.value) return null;
  let cat = editableCategories.value.find((c) => c.slug === resource.value.category_slug);
  if (!cat && resource.value.parent_category_slug) {
    cat = editableCategories.value.find((c) => c.slug === resource.value.parent_category_slug);
  }
  if (!cat) return null;
  let root = cat;
  while (root.parent_id) {
    const parent = editableCategories.value.find((c) => Number(c.id) === Number(root.parent_id));
    if (!parent) break;
    root = parent;
  }
  return root;
});

const activeCategorySlug = computed(
  () => resource.value?.category_slug || resource.value?.parent_category_slug || ''
);

function worksheetLabel(file, index) {
  return file.label || file.original_name?.replace(/\.[^.]+$/, '') || `Worksheet #${index + 1}`;
}

function isPremiumFile(file) {
  return !!(file.premium_only || Number(file.premium_only) === 1 || file.is_bundle || Number(file.is_bundle) === 1);
}

watch(resource, (r) => {
  if (!r) return;
  const breadcrumbs = [{ name: 'Library', path: '/library' }];
  if (r.parent_category_name && r.parent_category_slug) {
    breadcrumbs.push({ name: r.parent_category_name, path: `/library/category/${r.parent_category_slug}` });
  }
  if (r.category_name && r.category_slug && r.category_slug !== r.parent_category_slug) {
    breadcrumbs.push({ name: r.category_name, path: `/library/category/${r.category_slug}` });
  }
  breadcrumbs.push({ name: r.title });
  setResourceMeta({
    title: pageLayout.value.hero.title || r.title,
    description: r.description || r.content_description?.slice(0, 200) || '',
    image: r.cover_image && (!r.cover_hidden || (builder.editMode && builder.canEdit)) ? r.cover_image : '',
    url: `/resource/${r.slug}`,
    keywords: r.keywords || '',
    resource: r,
    breadcrumbs,
  });
});

watch(() => route.params.slug, loadResource);

watch(
  () => [resource.value, route.query.assistir, isLoggedIn.value],
  () => {
    if (!resource.value || !isPresentation.value || !isLoggedIn.value) return;
    const fileId = route.query.assistir;
    if (!fileId) return;
    const file = (resource.value.files || []).find((f) => String(f.id) === String(fileId));
    if (file && isPresentationFile(file)) {
      openSlideViewer(file);
      router.replace({ name: 'resource', params: { slug: resource.value.slug } });
    }
  },
  { flush: 'post' }
);

watch(isLoggedIn, async (loggedIn) => {
  if (loggedIn) {
    await loadQuota();
  } else {
    downloadQuota.value = null;
  }
});

async function loadResource() {
  const requestId = ++resourceRequestId;
  resourceAbortController?.abort();
  const controller = new AbortController();
  resourceAbortController = controller;
  loading.value = true;
  resourceError.value = '';
  resource.value = null;
  previewFile.value = null;
  showPreviewModal.value = false;
  showSlideViewer.value = false;
  slideViewerFile.value = null;
  isFavorited.value = false;
  favoriteError.value = '';
  try {
    // A selected extra file belongs to the previous route; never reuse it for
    // the next material's preview modal.
    const { data } = await api.get(`/resources/${route.params.slug}`, {
      signal: controller.signal,
    });
    if (requestId !== resourceRequestId) return;
    resource.value = data.resource;
    isFavorited.value = !!data.resource.is_favorited;
    if (isLoggedIn.value) {
      await loadQuota(data.resource);
    }
  } catch (e) {
    if (controller.signal.aborted || requestId !== resourceRequestId) return;
    resourceError.value = e.response?.data?.error || 'Could not load this material. Please try again.';
  } finally {
    if (requestId === resourceRequestId) loading.value = false;
  }
}

async function loadQuota(targetResource = resource.value) {
  const requestId = ++quotaRequestId;
  if (!isLoggedIn.value || !targetResource) return;
  try {
    const { data } = await api.get('/downloads/quota', {
      params: { resource_id: targetResource.id },
    });
    if (requestId !== quotaRequestId || resource.value?.id !== targetResource.id) return;
    downloadQuota.value = data.quota;
    paywallSettings.value = data.paywall || {};
    isPremiumUser.value = !!data.quota?.premium || !!data.quota?.unlimited;
    downloadError.value = '';
  } catch {
    if (requestId === quotaRequestId) downloadQuota.value = null;
  }
}

function openPaywallModal(payload = {}) {
  paywallModalType.value = payload.type || 'limit';
  paywallResetMessage.value = payload.resetMessage || '';
  paywallErrorMessage.value = payload.errorMessage || '';
  if (payload.quota) downloadQuota.value = payload.quota;
  if (payload.paywall) paywallSettings.value = payload.paywall;
  showPaywallModal.value = true;
}

async function onPaywallUpgraded() {
  isPremiumUser.value = true;
  downloadError.value = '';
  await loadQuota();
}

function handleDownloadError(e) {
  if (e.response?.status === 401) {
    openAuthModal();
    return;
  }
  const data = e.response?.data || {};
  if (e.response?.status === 429) {
    downloadError.value = data.error || 'Download limit reached.';
    openPaywallModal({
      type: 'limit',
      quota: data.quota,
      resetMessage: data.resetMessage,
      paywall: data.paywall,
      errorMessage: data.error,
    });
  } else if (e.response?.status === 402) {
    openPaywallModal({
      type: data.code === 'SCHOOL_REQUIRED' ? 'school' : 'premium',
      paywall: data.paywall,
      errorMessage: data.error,
    });
  } else {
    downloadError.value = data.error || 'Could not download the file.';
  }
}

function openAuthModal(tab = 'login', action = null) {
  if (tab && typeof tab === 'object') {
    action = tab;
    tab = 'login';
  }
  if (action) pendingAuthAction.value = action;
  authModalTab.value = tab;
  showAuthModal.value = true;
}

function requireAuth(action = null) {
  if (isLoggedIn.value) return true;
  openAuthModal('login', action);
  return false;
}

function openDownloadPage(file) {
  if (!file || !requireAuth({ type: 'download', file })) return;
  if (isPresentationFile(file)) {
    openSlideViewer(file);
    return;
  }
  const url = router.resolve({
    name: 'download',
    params: { slug: resource.value.slug, fileId: file.id },
  }).href;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  // Browsers may block the deferred popup after a login modal. Keep the
  // action intact by falling back to the same tab instead of dropping it.
  if (!opened) router.push(url);
}

function onPageClick(file, index) {
  if (!requireAuth({ type: 'preview', file, pageIndex: index })) return;
  trackInteraction('resource_page_click', {
    resourceId: resource.value?.id,
    resourceTitle: resource.value?.title,
    fileId: file?.id,
    fileLabel: file?.label || file?.original_name,
    pageIndex: index,
  });
  if (isPresentationFile(file)) openPresentationView(file);
  else openPreviewModal(true, file);
}

function onPageDownload(file, index) {
  openDownloadPage(file);
}

async function toggleFavorite() {
  if (!requireAuth()) return;
  favoriteError.value = '';
  if (isFavorited.value) {
    favoriteLoading.value = true;
    try {
      await api.delete(`/favorites/${resource.value.id}`);
      isFavorited.value = false;
    } catch (e) {
      if (e.response?.status === 401) openAuthModal();
      favoriteError.value = e.response?.data?.error || 'Could not update your favorites. Please try again.';
    } finally {
      favoriteLoading.value = false;
    }
    return;
  }
  showFolderModal.value = true;
}

function onFavoriteClick() {
  toggleFavorite();
}

function onUnfavoriteClick() {
  toggleFavorite();
}

// Baixa o arquivo direto (1 clique, sem tela intermediária), mantendo as
// regras de limite/paywall através do endpoint de download.
function onPreviewDownload(file) {
  openDownloadPage(file);
}

// Atalho da caixa de prévia: abre o PDF completo quando o material possui
// um bundle; materiais com apenas um PDF continuam usando o arquivo principal.
function goToDownloadScreen() {
  openPreviewModal(true, bundleFile.value || previewWorksheetFile.value);
}

function openPreviewModal(preferPdf = true, file = null) {
  const targetFile = file || previewWorksheetFile.value;
  if (!targetFile || !requireAuth({ type: 'preview', file: targetFile })) return;
  if (isPresentationFile(targetFile)) {
    openPresentationView(targetFile);
    return;
  }
  previewPreferPdf.value = preferPdf;
  previewFile.value = targetFile;
  trackInteraction('resource_preview_open', {
    resourceId: resource.value?.id,
    resourceTitle: resource.value?.title,
    fileId: targetFile?.id,
    fileLabel: targetFile?.label || targetFile?.original_name,
  });
  showPreviewModal.value = true;
}

function openSlideViewer(file = null) {
  const targetFile = file || previewWorksheetFile.value;
  if (!targetFile || !requireAuth({ type: 'presentation', file: targetFile })) return;
  slideViewerFile.value = targetFile;
  showSlideViewer.value = true;
}

function openPresentationView(file = null) {
  const targetFile = file || previewWorksheetFile.value;
  if (!targetFile || !requireAuth({ type: 'presentation', file: targetFile })) return;
  const url = router.resolve({
    name: 'presentation-play',
    params: { slug: resource.value.slug, fileId: targetFile.id },
  }).href;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) router.push(url);
}

function onFolderSaved() {
  isFavorited.value = true;
  favoriteError.value = '';
}

async function onAuthSuccess() {
  await loadQuota();
  if (resource.value) {
    await api.get(`/resources/${resource.value.slug}`).then(({ data }) => {
      isFavorited.value = !!data.resource.is_favorited;
    }).catch(() => {});
  }
  const action = pendingAuthAction.value;
  pendingAuthAction.value = null;
  if (!action) return;
  if (action.type === 'download') openDownloadPage(action.file);
  else if (action.type === 'presentation') openPresentationView(action.file);
  else if (action.type === 'preview' && action.file) {
    openPreviewModal(true, action.file);
  }
}

onUnmounted(() => {
  resourceRequestId += 1;
  quotaRequestId += 1;
  resourceAbortController?.abort();
  resourceAbortController = null;
});
</script>

<template>
  <div class="resource-k5-page">
    <AuthModal v-model="showAuthModal" :initial-tab="authModalTab" @success="onAuthSuccess" />
    <SelectFolderModal
      v-model="showFolderModal"
      :resource-id="resource?.id"
      @saved="onFolderSaved"
    />
    <K5PreviewModal
      v-if="resource && previewActionEnabled && !isPresentation"
      v-model="showPreviewModal"
      :title="displayTitle"
              :cover-image="displayCover"
      :resource-id="resource.id"
      :worksheet-file="previewFile || previewWorksheetFile"
      :can-load-pdf="isLoggedIn"
      :prefer-pdf="previewPreferPdf"
      @download="onPreviewDownload"
      @auth-required="openAuthModal"
    />
    <SlideViewerModal
      v-if="resource && isPresentation"
      v-model="showSlideViewer"
      :title="displayTitle"
      :resource-id="resource.id"
      :slug="resource.slug"
      :file="slideViewerFile"
      :google-slides-url="resource.google_slides_url || resource.googleSlidesUrl"
      :can-load="isLoggedIn"
      @auth-required="openAuthModal"
    />
    <DownloadPaywallModal
      v-model="showPaywallModal"
      :type="paywallModalType"
      :quota="downloadQuota"
      :reset-message="paywallResetMessage"
      :paywall="paywallSettings"
      :error-message="paywallErrorMessage"
      @upgraded="onPaywallUpgraded"
    />

    <div v-if="loading" class="container text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <div v-else-if="resourceError" class="container k5-container py-5">
      <div class="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-3" role="alert">
        <span>{{ resourceError }}</span>
        <button type="button" class="btn btn-sm btn-outline-dark" @click="loadResource">Retry</button>
      </div>
    </div>

    <div v-else-if="resource" class="container k5-container">
      <div class="k5-page-shell">
        <div class="k5-page-shell-sidebar">
          <K5CategorySidebar
            :categories="editableCategories"
            :active-slug="activeCategorySlug"
            :anchor-category="sidebarRootCategory"
            :title-item="sidebarRootCategory"
            title-setting-key="resource_materials_sidebar_title"
            title-default="Materials"
          />
        </div>

        <div class="k5-page-shell-body">
          <nav aria-label="breadcrumb" class="k5-breadcrumb k5-breadcrumb-inline">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item"><router-link to="/library"><EditableSetting tag="span" setting-key="resource_breadcrumb_library" :default="'Library'" placeholder="Library" /></router-link></li>
              <li v-if="resource.parent_category_name" class="breadcrumb-item">
                <router-link :to="`/library/category/${resource.parent_category_slug}`">
                  <EditableContentText v-if="parentResourceCategory" entity="category" :item="parentResourceCategory" field="name" tag="span" placeholder="Category name…" />
                  <span v-else>{{ resource.parent_category_name }}</span>
                </router-link>
              </li>
              <li v-if="resourceCategory?.name || resource.category_name" class="breadcrumb-item">
                <router-link :to="`/library/category/${resourceCategory?.slug || resource.category_slug}`">
                  <EditableContentText v-if="resourceCategory" entity="category" :item="resourceCategory" field="name" tag="span" placeholder="Category name…" />
                  <span v-else>{{ resource.category_name }}</span>
                </router-link>
              </li>
              <li class="breadcrumb-item active"><EditableContentText v-bind="titleBinding" :item="editableResource" tag="span" placeholder="Material title…" /></li>
            </ol>
          </nav>

          <!-- Heading: só o título/subtítulo (cards de promo removidos a pedido da cliente) -->
          <SiteContentSlot page-id="resource" zone="before-resource" label="Content before the resource" />

          <div class="k5-resource-header">
            <div class="k5-resource-intro">
              <EditableContentText v-bind="titleBinding" :item="editableResource" tag="h1" class="k5-title" placeholder="Material title…" />
              <EditableContentText v-if="displaySubtitle || (builder.editMode && builder.canEdit)" v-bind="subtitleBinding" :item="editableResource" tag="p" class="k5-subtitle" placeholder="Short description…" />
            </div>
          </div>

          <!-- Preview + botões em largura total -->
          <div class="k5-worksheet-row">
            <div
              v-if="canvaInlineEmbedUrl"
              class="k5-preview k5-preview-canva"
              @contextmenu.prevent
            >
              <iframe
                :src="canvaInlineEmbedUrl"
                class="k5-preview-canva-frame"
                title="Canva presentation preview"
                tabindex="-1"
                aria-hidden="true"
                allow="autoplay; fullscreen"
              ></iframe>
              <button
                v-if="previewActionEnabled || (builder.editMode && builder.canEdit)"
                type="button"
                class="k5-preview-canva-open"
                title="Watch"
                aria-label="Watch presentation"
                @click="builder.editMode && builder.canEdit ? selectMaterialFromCanvas($event) : openPresentationView()"
              >
                <span class="k5-preview-zoom" aria-hidden="true"><i class="bi bi-play-fill"></i></span>
              </button>
            </div>
            <button
              v-else-if="previewActionEnabled"
              type="button"
              class="k5-preview k5-preview-clickable"
              :title="isPresentation ? 'Watch' : 'Preview full PDF'"
              :aria-label="isPresentation ? 'Watch presentation' : 'Preview full PDF'"
              :tabindex="builder.editMode && builder.canEdit ? 0 : undefined"
              :role="builder.editMode && builder.canEdit ? 'button' : undefined"
              @click="builder.editMode && builder.canEdit ? selectMaterialFromCanvas($event) : (isPresentation ? openPresentationView() : goToDownloadScreen())"
              @keydown="selectMaterialFromCanvasKeyboard"
            >
              <img
                v-if="displayCover"
                :src="mediaUrl(displayCover)"
                :alt="displayTitle"
                draggable="false"
                @contextmenu.prevent
              />
              <div v-else class="k5-preview-placeholder">
                <i class="bi" :class="isPresentation ? 'bi-file-earmark-slides' : 'bi-file-earmark-text'"></i>
                <EditableSetting v-if="isPresentation" tag="span" setting-key="resource_preview_presentation_label" :default="'Presentation (PPTX)'" />
                <EditableSetting v-else tag="span" setting-key="resource_preview_pdf_label" :default="'PDF document'" />
              </div>
              <span class="k5-preview-zoom" aria-hidden="true"><i class="bi" :class="isPresentation ? 'bi-play-fill' : 'bi-search'"></i></span>
            </button>
            <div v-else class="k5-preview" @contextmenu.prevent>
              <img
                v-if="displayCover"
                :src="mediaUrl(displayCover)"
                :alt="displayTitle"
                draggable="false"
                @contextmenu.prevent
              />
              <div v-else class="k5-preview-placeholder">
                <i class="bi" :class="isPresentation ? 'bi-file-earmark-slides' : 'bi-file-earmark-text'"></i>
                <EditableSetting v-if="isPresentation" tag="span" setting-key="resource_preview_presentation_label" :default="'Presentation (PPTX)'" />
                <EditableSetting v-else tag="span" setting-key="resource_preview_pdf_label" :default="'PDF document'" />
              </div>
            </div>

            <div class="k5-resource-actions-wrap" :class="{ 'k5-actions-below': isPresentation }">
              <K5WorksheetActions
                :slug="resource.slug"
                :title="displayTitle"
                :resource-id="resource.id"
                :cover-image="displayCover"
              :files="actionMaterialFiles"
                :action-visibility="materialActionVisibility"
                :is-favorited="isFavorited"
                :favorite-loading="favoriteLoading"
                :is-presentation="isPresentation"
                :mini="isPresentation"
                :can-preview-pdf="isLoggedIn"
                external-preview
                external-download
                :check-auth="requireAuth"
                @auth-required="openAuthModal"
                @open-preview="openPreviewModal(true, previewWorksheetFile)"
                @open-presentation="openPresentationView()"
                @download="openDownloadPage"
                @favorite="onFavoriteClick"
                @unfavorite="onUnfavoriteClick"
              />
              <div v-if="favoriteError" class="alert alert-warning py-2 px-3 mt-2 mb-0 small" role="alert">
                {{ favoriteError }}
              </div>
              <div v-if="moreWorksheetFiles.length && !isGallery" class="k5-extra-letters">
                <p class="k5-extra-letters-label"><EditableSetting tag="span" setting-key="resource_more_pages_label" :default="'Files and pages'" /></p>
                <div class="k5-pages">
                  <article
                    v-for="(file, i) in moreWorksheetFiles"
                    :key="file.id"
                    class="k5-page-card"
                    :class="{ 'k5-page-card--nothumb': !file.thumbnail }"
                    :title="fileDisplayName(file)"
                  >
                    <span v-if="file.thumbnail" class="k5-page-card-thumb">
                      <img
                        :src="mediaUrl(file.thumbnail)"
                        :alt="worksheetLabel(file, i + 1)"
                        loading="lazy"
                        draggable="false"
                        @contextmenu.prevent
                      />
                    </span>
                    <span
                      class="k5-page-card-bar"
                      :class="isPremiumFile(file) ? 'k5-page-bar-premium' : 'k5-page-bar-free'"
                    >
                      <i v-if="isPresentationFile(file)" class="bi bi-play-circle me-1"></i>
                      <i v-else-if="isPremiumFile(file) && !isPremiumUser" class="bi bi-lock-fill me-1"></i>
                      <i v-else class="bi bi-file-earmark-text me-1"></i>
                      <span>{{ worksheetLabel(file, i + 1) }}</span>
                    </span>
                    <span class="k5-page-card-actions">
                      <button type="button" class="k5-file-action k5-file-action-preview" @click="onPageClick(file, i + 1)">
                        <i :class="isPresentationFile(file) ? 'bi bi-play-fill' : 'bi bi-eye'"></i> {{ isPresentationFile(file) ? 'Open' : 'Preview' }}
                      </button>
                      <button v-if="!isPresentationFile(file)" type="button" class="k5-file-action" @click="onPageDownload(file, i + 1)">
                        <i class="bi bi-download"></i> Download
                      </button>
                    </span>
                  </article>
                </div>
              </div>
            </div>
          </div>

          <section v-if="isGallery && moreWorksheetFiles.length" class="k5-gallery-grid" :aria-label="builder.settingValue('resource_gallery_label', 'Material files')">
            <article
              v-for="(file, i) in moreWorksheetFiles"
              :key="file.id"
              class="k5-gallery-card"
              :title="fileDisplayName(file)"
            >
              <span class="k5-gallery-thumb">
                <img
                  v-if="fileThumb(file)"
                  :src="fileThumb(file)"
                  :alt="worksheetLabel(file, i + 1)"
                  loading="lazy"
                  draggable="false"
                  @contextmenu.prevent
                />
                <i v-else class="bi bi-file-earmark-text"></i>
                <span v-if="isPremiumFile(file) && !isPremiumUser" class="k5-gallery-lock">
                  <i class="bi bi-lock-fill"></i>
                </span>
              </span>
              <span class="k5-gallery-label">{{ worksheetLabel(file, i + 1) }}</span>
              <span class="k5-gallery-actions">
                <button type="button" class="k5-file-action k5-file-action-preview" @click="onPageClick(file, i + 1)">
                  <i :class="isPresentationFile(file) ? 'bi bi-play-fill' : 'bi bi-eye'"></i> {{ isPresentationFile(file) ? 'Open' : 'Preview' }}
                </button>
                <button v-if="!isPresentationFile(file)" type="button" class="k5-file-action" @click="onPageDownload(file, i + 1)">
                  <i class="bi bi-download"></i> Download
                </button>
              </span>
            </article>
          </section>

          <SiteContentSlot page-id="resource" zone="after-preview" label="Content after the preview" />

          <div v-if="downloadError" class="alert alert-warning border-0 py-2 px-3 mt-2 small">
            <i class="bi bi-exclamation-triangle me-1"></i>{{ downloadError }}
          </div>

          <!-- Texto explicativo em largura total (2 colunas no desktop) -->
          <EditableContentText
            v-if="builder.editMode && builder.canEdit"
            entity="material"
            :item="editableResource"
            field="content_description"
            tag="div"
            class="k5-desc k5-desc-wide mt-4"
            placeholder="What is in this file…"
          />
          <div v-else-if="contentParagraphs.length" class="k5-desc k5-desc-wide mt-4">
            <p v-for="(para, i) in contentParagraphs" :key="i">{{ para }}</p>
          </div>

          <SiteContentSlot page-id="resource" zone="after-resource" label="Content after the resource" />

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Galeria de capas: cada arquivo vira um card com a miniatura da 1ª página. */
.k5-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1.1rem;
  margin-top: 1.75rem;
}
.k5-gallery-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: center;
}
.k5-gallery-thumb {
  position: relative;
  aspect-ratio: 3 / 4;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  border: 2px solid #e2e8f0;
  background: #f1f5f9;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.k5-gallery-card:hover .k5-gallery-thumb,
.k5-gallery-card:focus-visible .k5-gallery-thumb {
  transform: translateY(-3px);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.16);
  border-color: var(--resource-accent, #3bafb8);
}
.k5-gallery-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.k5-gallery-thumb > i {
  font-size: 2.4rem;
  color: #94a3b8;
}
.k5-gallery-lock {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.62);
  color: #fff;
  font-size: 0.85rem;
}
.k5-gallery-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1e293b;
  word-break: break-word;
}
.k5-page-card-actions,
.k5-gallery-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.55rem 0.65rem 0.7rem;
  background: #fff;
}
.k5-gallery-actions {
  padding: 0;
}
.k5-file-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 1px solid #cde3ea;
  border-radius: 999px;
  background: #fff;
  color: #2e7d9a;
  padding: 0.3rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}
.k5-file-action:hover,
.k5-file-action:focus-visible {
  background: #eef8fa;
  border-color: #2e7d9a;
}
.k5-file-action-preview {
  background: #2e7d9a;
  border-color: #2e7d9a;
  color: #fff;
}
.k5-file-action-preview:hover,
.k5-file-action-preview:focus-visible {
  background: #23677d;
  color: #fff;
}
/* Preview sem capa: mostra o tipo do arquivo em vez de uma caixa vazia. */
.k5-preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
  padding: 1rem;
  color: #64748b;
}
.k5-preview-placeholder-text {
  font-size: 0.9rem;
  font-weight: 600;
  color: #64748b;
}
.k5-preview-canva {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: 0;
  background: #f8fafc;
}
.k5-preview-canva-frame {
  width: 100%;
  height: 100%;
  display: block;
  border: 0;
  pointer-events: none;
}
.k5-preview-canva-open {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}
.k5-preview-canva-open:focus-visible {
  outline: 3px solid var(--resource-accent, #3bafb8);
  outline-offset: -3px;
}
</style>
