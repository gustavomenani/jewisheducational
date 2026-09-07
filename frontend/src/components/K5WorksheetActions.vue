<script setup>

import { ref, computed } from 'vue';

import { useRouter } from 'vue-router';

import { useI18n } from '@/i18n';

import { useSettingsStore } from '@/stores';
import EditableSetting from '@/builder/EditableSetting.vue';

import K5PreviewModal from '@/components/K5PreviewModal.vue';

import {

  pickWorksheetFile,

  pickBundleFile,

  pickAnswersFile,

  classroomShareUrl,

} from '@/utils/resourceFiles';

import { pinterestPinUrl } from '@/utils/pinterest';

import { isMaterialActionEnabled } from '@/utils/materialActions';
import { trackInteraction } from '@/analytics';



const props = defineProps({

  slug: { type: String, required: true },

  title: { type: String, default: '' },

  resourceId: { type: [Number, String], default: null },

  coverImage: { type: String, default: '' },

  files: { type: Array, default: () => [] },

  isFavorited: { type: Boolean, default: false },

  favoriteLoading: { type: Boolean, default: false },

  showBookmark: { type: Boolean, default: true },

  showLabels: { type: Boolean, default: true },

  compact: { type: Boolean, default: false },

  mini: { type: Boolean, default: false },

  checkAuth: { type: Function, default: null },

  canPreviewPdf: { type: Boolean, default: false },

  isPresentation: { type: Boolean, default: false },

  externalPreview: { type: Boolean, default: false },

  externalDownload: { type: Boolean, default: false },

  // Optional per-material action overrides. Missing keys fall back to the
  // global settings so older resources keep their existing behaviour.
  actionVisibility: { type: Object, default: () => ({}) },

});



const emit = defineEmits(['auth-required', 'favorite', 'unfavorite', 'open-preview', 'open-presentation', 'download']);



const router = useRouter();

const { t } = useI18n();

const settingsStore = useSettingsStore();



const showPreviewModal = ref(false);
const showBundlePreviewModal = ref(false);



const worksheetFile = computed(() => pickWorksheetFile(props.files));

const bundleFile = computed(() => pickBundleFile(props.files));

const answersFile = computed(() => pickAnswersFile(props.files));



// Em apresentação a lupa de "preview" é redundante (a capa já abre o
// visualizador de slides), então some — pedido da cliente.
function actionEnabled(actionId) {
  let overrides = props.actionVisibility || {};
  if (typeof overrides === 'string') {
    try { overrides = JSON.parse(overrides) || {}; } catch { overrides = {}; }
  }
  const value = overrides[actionId]
    ?? (actionId === 'worksheet' ? overrides.download : undefined)
    ?? overrides[`${actionId}_visible`]
    ?? overrides[`show_${actionId}`];
  if (value !== undefined && value !== null && value !== '') {
    return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
  }
  return isMaterialActionEnabled(settingsStore.settings, actionId);
}

const showPreview = computed(() => actionEnabled('preview') && !!(worksheetFile.value || bundleFile.value) && !props.isPresentation);

const showWorksheet = computed(() => (
  actionEnabled('worksheet')
  && !!(worksheetFile.value || bundleFile.value)
));

// Keep the original complete PDF visible as a separate premium action after
// a multi-page file has been split into individual free pages.
const showBundle = computed(() => actionEnabled('worksheet') && !!bundleFile.value && !props.isPresentation);

// Button "Answers" escondido a pedido da cliente (mesmo padrão de showClassroom).
// Optional actions are enabled per material first, then by global settings.
// Do not render an action when its required file/integration is unavailable.
const classroomUrl = computed(() => classroomShareUrl(
  props.slug,
  props.title,
  settingsStore.settings,
));
const pinterestUrl = computed(() => pinterestPinUrl(
  props.slug,
  props.title,
  props.coverImage,
  settingsStore.settings,
));
const showAnswers = computed(() => actionEnabled('answers') && !!answersFile.value);
const showClassroom = computed(() => actionEnabled('classroom') && !!classroomUrl.value);
const showPinterest = computed(() => actionEnabled('pinterest') && !!pinterestUrl.value);

const showBookmarkAction = computed(

  () => props.showBookmark && actionEnabled('bookmark')

);



const hasAnyAction = computed(

  () =>

    showPreview.value ||

    showWorksheet.value ||

    showBundle.value ||

    showAnswers.value ||

    showClassroom.value ||

    showPinterest.value ||

    showBookmarkAction.value

);



function ensureAuth(action = null) {

  if (props.checkAuth && !props.checkAuth(action)) {

    emit('auth-required', action);

    return false;

  }

  return true;

}

function trackResourceEvent(eventName, file) {
  if (!file || !props.resourceId) return;
  trackInteraction(eventName, {
    resourceId: props.resourceId,
    resourceTitle: props.title,
    fileId: file.id,
    fileLabel: file.label || file.original_name,
  });
}



function openDownload(file) {

  if (!ensureAuth({ type: 'download', file })) return;

  if (!file) {

    router.push(`/resource/${props.slug}`);

    return;

  }

  const url = router.resolve({

    name: 'download',

    params: { slug: props.slug, fileId: file.id },

  }).href;

  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  // Browsers can block a new tab even when the click itself is valid. Keep
  // the action usable by falling back to the same-tab router navigation.
  if (!opened) router.push(url);

}

function requestFileDownload(file) {
  if (!file) return;
  if (!ensureAuth({ type: 'download', file })) return;
  if (props.externalDownload) {
    emit('download', file);
    return;
  }
  openDownload(file);
}



function onPreview() {

  const file = worksheetFile.value || bundleFile.value;
  if (!ensureAuth({ type: 'preview', file })) return;

  if (props.externalPreview) {

    emit('open-preview');

    return;

  }

  trackResourceEvent('resource_preview_open', worksheetFile.value || bundleFile.value);
  showPreviewModal.value = true;

}



function onWorksheet() {

  if (props.isPresentation) {

    if (!ensureAuth({ type: 'presentation', file: worksheetFile.value })) return;

    emit('open-presentation');

    return;

  }

  const file = worksheetFile.value || bundleFile.value;

  requestFileDownload(file);

}

function onBundle() {
  if (!bundleFile.value) return;
  if (!ensureAuth({ type: 'preview', file: bundleFile.value })) return;
  trackResourceEvent('resource_preview_open', bundleFile.value);
  showBundlePreviewModal.value = true;
}

// The preview modal's Download button uses the same auth and download path as
// the primary action, so paywalls and external-download integrations remain
// consistent.
function onModalDownload(file) {
  const primaryFile = worksheetFile.value || bundleFile.value;
  if (file && primaryFile && String(file.id) !== String(primaryFile.id)) return;
  requestFileDownload(primaryFile);
}

function onBundleModalDownload(file) {
  const fullFile = bundleFile.value;
  if (!fullFile || (file && String(file.id) !== String(fullFile.id))) return;
  requestFileDownload(fullFile);
}



function onAnswers() {

  requestFileDownload(answersFile.value);

}



function onClassroom() {

  const url = classroomUrl.value;

  if (!url) return;

  window.open(url, '_blank', 'noopener,noreferrer');

}



function onPinterest() {

  const url = pinterestUrl.value;

  if (!url) return;

  window.open(url, '_blank', 'noopener,noreferrer,width=750,height=600');

}



function onBookmark() {

  if (props.favoriteLoading || !ensureAuth()) return;

  if (props.isFavorited) emit('unfavorite');

  else emit('favorite');

}

</script>



<template>

  <div v-if="hasAnyAction" class="k5-ws-actions" :class="{ 'k5-ws-actions-compact': compact, 'k5-ws-actions-mini': mini }">

    <K5PreviewModal

      v-if="!externalPreview && showPreview"

      v-model="showPreviewModal"

      :title="title"

      :cover-image="coverImage"

      :resource-id="resourceId"

      :worksheet-file="worksheetFile || bundleFile"

      :can-load-pdf="canPreviewPdf"

      @download="onModalDownload"

      @auth-required="(action) => emit('auth-required', action)"

    />



    <K5PreviewModal
      v-if="showBundle"
      v-model="showBundlePreviewModal"
      :title="`${title} — Full PDF`"
      :cover-image="coverImage"
      :resource-id="resourceId"
      :worksheet-file="bundleFile"
      :can-load-pdf="canPreviewPdf"
      :prefer-pdf="true"
      @download="onBundleModalDownload"
      @auth-required="(action) => emit('auth-required', action)"
    />

    <div v-if="showPreview" class="k5-demo-action">

      <button type="button" class="k5-ws-action-btn" :title="t('preview')" :aria-label="t('preview')" @click="onPreview">

        <span class="k5-demo-icon k5-demo-preview"><i class="bi bi-search"></i></span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">
        <EditableSetting
          tag="span"
          setting-key="resource_preview_label"
          :default="t('preview')"
          label="Preview action label"
        />
      </span>

    </div>



    <div v-if="showWorksheet" class="k5-demo-action">

      <button

        type="button"

        class="k5-ws-action-btn"

        :title="isPresentation ? t('viewPresentation') : t('worksheet')"

        :aria-label="isPresentation ? t('viewPresentation') : t('worksheet')"

        :disabled="!worksheetFile && !bundleFile"

        @click="onWorksheet"

      >

        <span v-if="isPresentation" class="k5-demo-icon k5-demo-preview"><i class="bi bi-play-fill"></i></span>

        <span v-else class="k5-demo-icon k5-demo-doc k5-demo-worksheet">W</span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">
        <EditableSetting
          tag="span"
          setting-key="resource_download_label"
          :default="isPresentation ? t('presentation') : 'Download'"
          label="Download action label"
        />
      </span>

    </div>



    <div v-if="showBundle" class="k5-demo-action k5-demo-action-premium">

      <button

        type="button"

        class="k5-ws-action-btn"

        title="Preview full PDF (Premium)"

        aria-label="Preview full PDF (Premium)"

        :disabled="!bundleFile"

        @click="onBundle"

      >

        <span class="k5-demo-icon k5-demo-doc k5-demo-bundle"><i class="bi bi-file-earmark-pdf"></i></span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">
        <EditableSetting
          tag="span"
          setting-key="resource_full_pdf_label"
          :default="'Preview full PDF (Premium)'"
          label="Full PDF action label"
        />
      </span>

    </div>



    <div v-if="showAnswers" class="k5-demo-action" :class="{ 'k5-demo-action-disabled': !answersFile }">

      <button

        type="button"

        class="k5-ws-action-btn"

        :title="t('answers')"

        :aria-label="t('answers')"

        :disabled="!answersFile"

        @click="onAnswers"

      >

        <span class="k5-demo-icon k5-demo-doc k5-demo-answers">A</span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">{{ t('answers') }}</span>

    </div>



    <div v-if="showClassroom" class="k5-demo-action">

      <button type="button" class="k5-ws-action-btn" :title="t('classroom')" :aria-label="t('classroom')" @click="onClassroom">

        <span class="k5-demo-icon k5-demo-classroom"><i class="bi bi-people-fill"></i></span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">{{ t('classroom') }}</span>

    </div>



    <div v-if="showPinterest" class="k5-demo-action">

      <button type="button" class="k5-ws-action-btn" :title="t('pinterest')" :aria-label="t('pinterest')" @click="onPinterest">

        <span class="k5-demo-icon k5-demo-pinterest"><i class="bi bi-pinterest"></i></span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">{{ t('pinterest') }}</span>

    </div>



    <div v-if="showBookmarkAction" class="k5-demo-action">

      <button

        type="button"

        class="k5-ws-action-btn"

        :title="isFavorited ? t('removeBookmark') : t('bookmark')"

        :aria-label="isFavorited ? t('removeBookmark') : t('bookmark')"

        :disabled="favoriteLoading"

        @click="onBookmark"

      >

        <span class="k5-demo-icon k5-demo-bookmark" :class="{ 'is-saved': isFavorited }">

          <i :class="isFavorited ? 'bi bi-bookmark-fill' : 'bi bi-bookmark-plus'"></i>

        </span>

      </button>

      <span v-if="showLabels" class="k5-demo-label">
        <EditableSetting
          tag="span"
          setting-key="resource_favorite_label"
          :default="t('bookmark')"
          label="Favorite action label"
        />
      </span>

    </div>

  </div>

</template>


