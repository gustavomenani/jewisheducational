<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import AuthModal from '@/components/AuthModal.vue';
import K5WorksheetActions from '@/components/K5WorksheetActions.vue';
import { useAuthStore } from '@/stores';
import { useI18n } from '@/i18n';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { useBuilderStore } from '@/builder/store';
import EditableContentText from '@/builder/EditableContentText.vue';
import { canvaPresentationFile } from '@/utils/canva';
import { isPresentationResource, pickWorksheetFile } from '@/utils/resourceFiles';

const auth = useAuthStore();
const router = useRouter();
const builder = useBuilderStore();
const { t } = useI18n();
const favorites = ref([]);
const folders = ref([]);
const selectedFolderId = ref(null);
const loading = ref(true);
const error = ref('');
const showAuthModal = ref(false);
const showNewFolder = ref(false);
const newFolderName = ref('');
let favoriteRequestSequence = 0;
let favoriteController = null;
let suppressFolderWatch = false;

function isCanceledRequest(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

const filteredFavorites = computed(() => {
  if (!selectedFolderId.value) return favorites.value;
  return favorites.value.filter((f) => Number(f.folder_id) === Number(selectedFolderId.value));
});

// The selected folder request is intentionally filtered. Use the counts
// returned with the folder list for the global empty state, otherwise an
// empty folder could incorrectly make the whole account look bookmark-free.
const totalCount = computed(() => {
  if (!folders.value.length) return favorites.value.length;
  return folders.value.reduce((sum, folder) => sum + (Number(folder.item_count) || 0), 0);
});

function editableMaterial(item) {
  if (!builder.editMode || !builder.canEdit) return item;
  const draft = builder.contentDraft?.materials?.find((material) => String(material.id) === String(item?.id));
  return draft ? { ...item, ...draft } : item;
}

function editableCategory(item) {
  if (!builder.editMode || !builder.canEdit) return null;
  return builder.contentDraft?.categories?.find((category) => (
    String(category.id) === String(item?.category_id)
    || (item?.category_slug && category.slug === item.category_slug)
  )) || null;
}

function favoriteActionFiles(item) {
  const linkedCanva = canvaPresentationFile(item?.canva_url);
  return linkedCanva ? [linkedCanva, ...(item?.files || [])] : (item?.files || []);
}

function favoriteIsPresentation(item) {
  return isPresentationResource(favoriteActionFiles(item));
}

function openPresentationView(item) {
  const file = canvaPresentationFile(item?.canva_url) || pickWorksheetFile(item?.files || []);
  if (!file) return;
  const url = router.resolve({
    name: 'presentation-play',
    params: { slug: item.slug, fileId: file.id },
  }).href;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) router.push(url);
}

function folderLabel(folder) {
  return folder.is_default ? t('defaultFolder') : folder.name;
}

onMounted(loadAll);
onUnmounted(() => favoriteController?.abort());

watch(selectedFolderId, (value, previous) => {
  if (suppressFolderWatch || value === previous) return;
  void loadFavorites();
});

async function loadAll() {
  if (!auth.isLoggedIn) {
    loading.value = false;
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data: folderData } = await api.get('/favorites/folders');
    folders.value = folderData.folders || [];
    if (!selectedFolderId.value && folders.value.length) {
      suppressFolderWatch = true;
      selectedFolderId.value = folders.value.find((f) => f.is_default)?.id || folders.value[0].id;
      await nextTick();
      suppressFolderWatch = false;
    }
    await loadFavorites();
  } catch (e) {
    favorites.value = [];
    folders.value = [];
    error.value = e.response?.data?.error || 'Could not load your favorites. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function loadFavorites() {
  if (!auth.isLoggedIn) return;
  const requestSequence = ++favoriteRequestSequence;
  favoriteController?.abort();
  const controller = new AbortController();
  favoriteController = controller;
  try {
    const params = selectedFolderId.value ? { folder: selectedFolderId.value } : {};
    const { data } = await api.get('/favorites', { params, signal: controller.signal });
    if (requestSequence !== favoriteRequestSequence) return;
    favorites.value = data.favorites || [];
    error.value = '';
  } catch (e) {
    if (isCanceledRequest(e) || requestSequence !== favoriteRequestSequence) return;
    favorites.value = [];
    error.value = e.response?.data?.error || 'Could not load your favorites. Please try again.';
  } finally {
    if (favoriteController === controller) favoriteController = null;
  }
}

async function removeFavorite(id) {
  error.value = '';
  try {
    await api.delete(`/favorites/${id}`);
    favorites.value = favorites.value.filter((f) => f.id !== id);
    const folderData = await api.get('/favorites/folders');
    folders.value = folderData.data.folders || [];
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not remove this favorite. Please try again.';
  }
}

async function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  error.value = '';
  try {
    const { data } = await api.post('/favorites/folders', { name });
    folders.value = [...folders.value, data.folder];
    selectedFolderId.value = data.folder.id;
    newFolderName.value = '';
    showNewFolder.value = false;
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not create the folder. Please try again.';
  }
}

function onAuthSuccess() {
  loadAll();
}
</script>

<template>
  <div class="container py-4 k5-bookmarks-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before saved materials" />
    <AuthModal v-model="showAuthModal" @success="onAuthSuccess" />

    <h1 class="k5-bookmarks-title">{{ t('myBookmarks') }}</h1>
    <div v-if="error" class="alert alert-warning" role="alert">{{ error }}</div>

    <div v-if="!auth.isLoggedIn" class="k5-bookmarks-empty">
      <p class="k5-bookmarks-empty-text">{{ t('bookmarksLogin') }}</p>
      <button type="button" class="btn btn-primary" @click="showAuthModal = true">{{ t('login') }}</button>
    </div>

    <div v-else-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <template v-else>
      <div class="k5-bookmarks-layout">
        <aside class="k5-bookmarks-folders">
          <h2 class="k5-bookmarks-folders-title">{{ t('folders') }}</h2>
          <ul class="k5-bookmarks-folder-list">
            <li v-for="folder in folders" :key="folder.id">
              <button
                type="button"
                class="k5-bookmarks-folder-btn"
                :class="{ active: selectedFolderId === folder.id }"
                @click="selectedFolderId = folder.id"
              >
                <i class="bi bi-folder-fill"></i>
                <span>{{ folderLabel(folder) }}</span>
                <small>{{ folder.item_count }}</small>
              </button>
            </li>
          </ul>
          <div v-if="showNewFolder" class="k5-bookmarks-new-folder">
            <input v-model="newFolderName" type="text" class="form-control form-control-sm" :placeholder="t('folderNamePlaceholder')" />
            <button type="button" class="btn btn-sm btn-primary mt-1" @click="createFolder">{{ t('createFolder') }}</button>
          </div>
          <button v-else type="button" class="k5-bookmarks-add-folder" @click="showNewFolder = true">
            <i class="bi bi-folder-plus"></i> {{ t('addNewFolder') }}
          </button>
        </aside>

        <div class="k5-bookmarks-main">
          <template v-if="!totalCount">
            <p class="k5-bookmarks-empty-text">{{ t('bookmarksEmpty') }}</p>
            <p class="k5-bookmarks-hint">{{ t('bookmarksHintFolders') }}</p>
            <div class="k5-bookmarks-demo" aria-hidden="true">
              <p class="k5-bookmarks-demo-label">{{ t('saveBookmarks') }}</p>
              <div class="k5-bookmark-demo-row">
                <div class="k5-bookmark-demo-thumb"><i class="bi bi-file-earmark-text"></i></div>
                <K5WorksheetActions
                  slug="demo"
                  title="Demo"
                  :show-bookmark="true"
                  :is-favorited="false"
                  compact
                />
              </div>
            </div>
            <RouterLink to="/library" class="btn btn-outline-primary mt-4">{{ t('exploreLibrary') }}</RouterLink>
          </template>

          <template v-else-if="!filteredFavorites.length">
            <p class="k5-bookmarks-empty-text">{{ t('folderEmpty') }}</p>
            <RouterLink to="/library" class="btn btn-outline-primary mt-3">{{ t('exploreLibrary') }}</RouterLink>
          </template>

          <template v-else>
            <p class="k5-bookmarks-count">{{ filteredFavorites.length }} {{ t('bookmarksSaved') }}</p>
            <ul class="k5-bookmarks-list">
              <li v-for="item in filteredFavorites" :key="item.id" class="k5-bookmark-row">
                <RouterLink :to="`/resource/${item.slug}`" class="k5-bookmark-thumb">
                  <img v-if="item.cover_image && !item.cover_hidden" :src="mediaUrl(item.cover_image)" :alt="item.title" />
                  <div v-else class="k5-bookmark-thumb-placeholder"><i class="bi bi-file-earmark"></i></div>
                </RouterLink>
                <div class="k5-bookmark-info">
                  <RouterLink :to="`/resource/${item.slug}`" class="k5-bookmark-title"><EditableContentText entity="material" :item="editableMaterial(item)" field="title" tag="span" placeholder="Material title…" /></RouterLink>
                  <EditableContentText v-if="editableCategory(item)" class="k5-bookmark-cat" entity="category" :item="editableCategory(item)" field="name" tag="span" placeholder="Category name…" />
                  <span v-else-if="item.category_name" class="k5-bookmark-cat">{{ item.category_name }}</span>
                </div>
                <K5WorksheetActions
                  :slug="item.slug"
                  :title="item.title"
                  :resource-id="item.id"
                  :cover-image="item.cover_hidden ? '' : item.cover_image"
                  :files="favoriteActionFiles(item)"
                  :is-presentation="favoriteIsPresentation(item)"
                  :is-favorited="true"
                  :can-preview-pdf="true"
                  compact
                  :check-auth="() => true"
                  @open-presentation="openPresentationView(item)"
                  @unfavorite="removeFavorite(item.id)"
                />
              </li>
            </ul>
          </template>
        </div>
      </div>
    </template>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after saved materials" />
  </div>
</template>
