<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useAuthStore } from '@/stores';
import { trackDownload, trackInteraction } from '@/analytics';
import DownloadPaywallModal from '@/components/DownloadPaywallModal.vue';
import { isPresentationFile } from '@/utils/resourceFiles';
import EditableSetting from '@/builder/EditableSetting.vue';
import EditableContentText from '@/builder/EditableContentText.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { useBuilderStore } from '@/builder/store';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const builder = useBuilderStore();
const { isLoggedIn } = storeToRefs(auth);

const loading = ref(true);
const downloading = ref(false);
const error = ref('');
const resource = ref(null);
const file = ref(null);
const quota = ref(null);
const paywall = ref({});
const showPaywallModal = ref(false);
const paywallModalType = ref('limit');
const paywallResetMessage = ref('');
const paywallErrorMessage = ref('');
const downloadPageOpenTracked = ref(false);
const downloadRequestId = ref('');
let pageRequestSequence = 0;
let pageController = null;

function isCanceledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

function handleAuthExpired() {
  router.replace({ name: 'login', query: { redirect: route.fullPath } });
}

const fileLabel = computed(() => file.value?.label || file.value?.original_name || 'File');
const isPdf = computed(() => (file.value?.mime_type || '').includes('pdf'));
const previewBlobUrl = ref('');
const quotaLabel = computed(() => {
  const template = builder.settingValue('download_quota_label', 'Downloads remaining: {remaining} of {max} {period}.');
  return String(template || '').replace('{remaining}', quota.value?.remaining ?? '').replace('{max}', quota.value?.max ?? '').replace('{period}', quota.value?.periodLabel ?? '');
});

const editableResource = computed(() => {
  if (!resource.value || !builder.editMode || !builder.canEdit) return resource.value;
  const draft = builder.contentDraft?.materials?.find((item) => String(item.id) === String(resource.value.id));
  return draft ? { ...resource.value, ...draft } : resource.value;
});

function selectMaterialFromCanvas(event) {
  if (!builder.editMode || !builder.canEdit || !resource.value) return;
  event?.preventDefault();
  event?.stopPropagation();
  window.dispatchEvent(new CustomEvent('editor:content-select', { detail: { entity: 'material', id: resource.value.id } }));
}

function selectMaterialFromCanvasKeyboard(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectMaterialFromCanvas(event);
}

onMounted(async () => {
  window.addEventListener('auth:expired', handleAuthExpired);
  if (!isLoggedIn.value) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }
  await loadPage();
});

watch(
  () => [route.params.slug, route.params.fileId],
  () => {
    if (isLoggedIn.value) void loadPage();
  }
);

onUnmounted(() => {
  window.removeEventListener('auth:expired', handleAuthExpired);
  pageController?.abort();
  if (previewBlobUrl.value) URL.revokeObjectURL(previewBlobUrl.value);
});

async function loadPage() {
  const requestSequence = ++pageRequestSequence;
  pageController?.abort();
  const controller = new AbortController();
  pageController = controller;
  loading.value = true;
  error.value = '';
  resource.value = null;
  file.value = null;
  quota.value = null;
  paywall.value = {};
  downloadPageOpenTracked.value = false;
  downloading.value = false;
  if (previewBlobUrl.value) {
    URL.revokeObjectURL(previewBlobUrl.value);
    previewBlobUrl.value = '';
  }
  try {
    const requestConfig = { signal: controller.signal };
    const { data: resourceData } = await api.get(`/resources/${route.params.slug}`, requestConfig);
    if (requestSequence !== pageRequestSequence) return;
    const match = (resourceData.resource?.files || []).find(
      (f) => String(f.id) === String(route.params.fileId)
    );
    if (!match) {
      error.value = 'File not found for this material.';
      return;
    }
    const { data } = await api.get(`/downloads/prepare/${resourceData.resource.id}/${match.id}`, requestConfig);
    if (requestSequence !== pageRequestSequence) return;
    resource.value = data.resource;
    file.value = data.file;
    quota.value = data.quota;
    paywall.value = data.paywall || {};
    if (isPresentationFile(file.value)) {
      router.replace({
        name: 'resource',
        params: { slug: resource.value.slug },
        query: { assistir: String(file.value.id) },
      });
      return;
    }
    // Do not pass an explicit null body: Express treats it as malformed JSON
    // under the JSON parser. The intent endpoint only needs the URL params.
    await api.post(`/downloads/intent/${resource.value.id}/${file.value.id}`, undefined, requestConfig).catch((requestError) => {
      if (isCanceledRequest(requestError)) throw requestError;
    });
    if (requestSequence !== pageRequestSequence) return;
    if (!downloadPageOpenTracked.value) {
      downloadPageOpenTracked.value = true;
      trackInteraction('download_page_open', {
        resourceId: resource.value.id,
        resourceTitle: resource.value.title,
        fileId: file.value.id,
        fileLabel: file.value.label || file.value.original_name,
      });
    }
    if (isPdf.value) await loadPdfPreview(requestSequence, controller.signal);
  } catch (e) {
    if (isCanceledRequest(e) || requestSequence !== pageRequestSequence) return;
    error.value = e.response?.data?.error || 'Could not load the download.';
  } finally {
    if (requestSequence === pageRequestSequence) loading.value = false;
    if (pageController === controller) pageController = null;
  }
}

async function loadPdfPreview(requestSequence = pageRequestSequence, signal = pageController?.signal) {
  if (!resource.value || !file.value) return;
  const resourceId = resource.value.id;
  const fileId = file.value.id;
  try {
    const { data } = await api.get(
      `/downloads/view/${resourceId}/${fileId}`,
      { responseType: 'blob', signal }
    );
    if (requestSequence !== pageRequestSequence || resource.value?.id !== resourceId || file.value?.id !== fileId) return;
    if (previewBlobUrl.value) URL.revokeObjectURL(previewBlobUrl.value);
    previewBlobUrl.value = URL.createObjectURL(data);
  } catch (e) {
    if (!isCanceledRequest(e) && requestSequence === pageRequestSequence) previewBlobUrl.value = '';
  }
}

function openPaywallModal(payload = {}) {
  paywallModalType.value = payload.type || 'limit';
  paywallResetMessage.value = payload.resetMessage || '';
  paywallErrorMessage.value = payload.errorMessage || '';
  if (payload.quota) quota.value = payload.quota;
  if (payload.paywall) paywall.value = payload.paywall;
  showPaywallModal.value = true;
}

function handleDownloadError(e) {
  const data = e.response?.data || {};
  if (e.response?.status === 429) {
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
    error.value = data.error || 'Could not download the file.';
  }
}

async function confirmDownload() {
  if (!resource.value || !file.value) return;
  const eventPayload = {
    resourceId: resource.value.id,
    resourceTitle: resource.value.title,
    fileId: file.value.id,
    fileLabel: file.value.label || file.value.original_name,
  };
  trackInteraction('resource_download_click', eventPayload);
  downloading.value = true;
  error.value = '';
  downloadRequestId.value = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const { data } = await api.get(
      `/downloads/${resource.value.id}/${file.value.id}`,
      {
        responseType: 'blob',
        headers: { 'X-Download-Request-Id': downloadRequestId.value },
      }
    );
    // The protected endpoint has returned the complete file, so these GA4
    // events represent a real delivery and are not duplicated in the server
    // interaction report (which records the authoritative delivery events).
    trackInteraction('download_started', eventPayload, { persist: false });
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.value.original_name || 'download';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    trackInteraction('download_completed', eventPayload, { persist: false });
    trackDownload({
      resourceId: resource.value.id,
      resourceTitle: resource.value.title,
      fileId: file.value.id,
      fileLabel: file.value.label,
      fileName: file.value.original_name,
      userEmail: auth.user?.email,
    });
    const prep = await api.get(`/downloads/prepare/${resource.value.id}/${file.value.id}`);
    quota.value = prep.data.quota;
  } catch (e) {
    handleDownloadError(e);
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="download-page">
    <DownloadPaywallModal
      v-model="showPaywallModal"
      :type="paywallModalType"
      :quota="quota"
      :reset-message="paywallResetMessage"
      :paywall="paywall"
      :error-message="paywallErrorMessage"
    />

    <div class="container download-page-inner">
      <nav aria-label="breadcrumb" class="k5-breadcrumb">
        <ol class="breadcrumb mb-0">
          <li class="breadcrumb-item">
            <RouterLink to="/library">
              <EditableSetting tag="span" setting-key="download_breadcrumb_library" :default="'Library'" />
            </RouterLink>
          </li>
          <li v-if="resource" class="breadcrumb-item">
            <RouterLink :to="`/resource/${resource.slug}`"><EditableContentText entity="material" :item="editableResource" field="title" tag="span" placeholder="Material title…" /></RouterLink>
          </li>
          <li class="breadcrumb-item active">
            <EditableSetting tag="span" setting-key="download_breadcrumb_current" :default="'Download'" />
          </li>
        </ol>
      </nav>

      <SiteContentSlot page-id="download" zone="before-download" label="Content before the download" />

      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary"></div>
      </div>

      <div v-else-if="error && !resource" class="download-card text-center py-5">
        <i class="bi bi-exclamation-circle text-warning fs-1 d-block mb-3"></i>
        <p class="mb-3">{{ error }}</p>
        <RouterLink to="/library" class="btn btn-outline-primary">
          <EditableSetting tag="span" setting-key="download_error_back_cta" :default="'Back to library'" />
        </RouterLink>
      </div>

      <div v-else-if="resource && file" class="download-card">
        <div class="row g-4 align-items-start">
          <div :class="isPdf ? 'col-lg-7' : 'col-lg-5'">
            <iframe
              v-if="isPdf && previewBlobUrl"
              :src="previewBlobUrl"
              class="download-preview-frame"
              title="Full PDF preview"
            ></iframe>
            <div v-else-if="editableResource.cover_image && (!editableResource.cover_hidden || (builder.editMode && builder.canEdit))" class="download-preview" :tabindex="builder.editMode && builder.canEdit ? 0 : undefined" :role="builder.editMode && builder.canEdit ? 'button' : undefined" @click="selectMaterialFromCanvas($event)" @keydown="selectMaterialFromCanvasKeyboard">
              <img :src="mediaUrl(editableResource.cover_image)" :alt="editableResource.title" />
            </div>
            <div v-else class="download-preview-placeholder">
              <i class="bi bi-file-earmark-arrow-down"></i>
            </div>
          </div>

          <div :class="isPdf ? 'col-lg-5' : 'col-lg-7'">
            <EditableContentText entity="material" :item="editableResource" field="title" tag="h1" class="download-title" placeholder="Material title…" />
            <p class="download-file-name">
              <i class="bi bi-file-earmark me-1"></i>{{ fileLabel }}
            </p>
            <EditableSetting
              tag="p"
              class="text-muted small mb-4"
              setting-key="download_lead"
              :default="'Click the button below to download the file. The download will be recorded in your account.'"
            />

            <p v-if="quota && !quota.unlimited && quota.enabled" class="small text-muted mb-3">
              {{ quotaLabel }}
            </p>

            <div v-if="error" class="alert alert-warning py-2 small">{{ error }}</div>

            <div class="d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-lg download-btn"
                :disabled="downloading"
                @click="confirmDownload"
              >
                <span v-if="downloading" class="spinner-border spinner-border-sm me-2"></span>
                <i v-else class="bi bi-download me-2"></i>
                <EditableSetting tag="span" setting-key="download_button_label" :default="'Download file'" />
              </button>
              <RouterLink :to="`/resource/${resource.slug}`" class="btn btn-outline-secondary btn-lg">
                <EditableSetting tag="span" setting-key="download_back_to_material_cta" :default="'Back to resource'" />
              </RouterLink>
            </div>
          </div>
        </div>
      </div>

      <SiteContentSlot page-id="download" zone="after-download" label="Content after the download" />
    </div>
  </div>
</template>

<style scoped>
.download-page {
  background: #f8fafb;
  min-height: 60vh;
  padding: 1.5rem 0 3rem;
}
.download-page-inner {
  max-width: 1180px;
}
.download-card {
  background: #fff;
  border: 1px solid var(--edu-border, #e2e8f0);
  border-radius: 16px;
  padding: 1.75rem;
  margin-top: 1rem;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
}
.download-title {
  font-size: 1.65rem;
  font-weight: 800;
  color: #8a8c2e;
  margin-bottom: 0.35rem;
}
.download-file-name {
  font-weight: 700;
  color: #2e7d9a;
  margin-bottom: 1rem;
}
.download-preview,
.download-preview-placeholder {
  border: 2px solid #bcd7e0;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.download-preview img {
  width: 100%;
  display: block;
}
.download-preview-frame {
  width: 100%;
  min-height: 680px;
  height: min(78vh, 900px);
  border: 0;
  border-radius: 10px;
}
.download-preview-placeholder {
  aspect-ratio: 3/4;
  display: grid;
  place-items: center;
  font-size: 3rem;
  color: #94a3b8;
}
.download-btn {
  background: linear-gradient(180deg, #93d156 0%, #79bb3e 100%);
  border: none;
  color: #fff;
  font-weight: 800;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
.download-btn:hover:not(:disabled) {
  filter: brightness(1.05);
  color: #fff;
}
@media (max-width: 991px) {
  .download-preview-frame { min-height: 520px; height: 68vh; }
}
</style>
