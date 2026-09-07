<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useAuthStore } from '@/stores';
import { useI18n } from '@/i18n';
import PayPalCheckout from '@/components/PayPalCheckout.vue';
import StripeCheckout from '@/components/StripeCheckout.vue';
import K5WorksheetActions from '@/components/K5WorksheetActions.vue';
import SelectFolderModal from '@/components/SelectFolderModal.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { useBuilderStore } from '@/builder/store';
import EditableContentText from '@/builder/EditableContentText.vue';
import { canvaPresentationFile } from '@/utils/canva';
import { isPresentationResource, pickWorksheetFile } from '@/utils/resourceFiles';

const auth = useAuthStore();
const builder = useBuilderStore();
const router = useRouter();
const route = useRoute();
const { t, isEn } = useI18n();
const checkoutNotice = ref('');
const tab = ref('overview');
const loading = ref(true);
const favorites = ref([]);
const folders = ref([]);
const selectedFolderId = ref(null);
const showNewFolder = ref(false);
const newFolderName = ref('');
const downloads = ref([]);
const subscription = ref(null);
const isPremium = ref(false);
const paywall = ref({});
const paymentError = ref('');
const favoriteError = ref('');
const showFolderModal = ref(false);
const folderResourceId = ref(null);
const favoriteLoadingId = ref(null);

const paymentsEnabled = computed(
  () => !!paywall.value.paymentsEnabled && !!paywall.value.paypalClientId
);

const stripeEnabled = computed(() => !!paywall.value.stripeEnabled);

const savedCount = computed(() => favorites.value.length);
const downloadCount = computed(() => downloads.value.length);

const filteredFavorites = computed(() => {
  if (!selectedFolderId.value) return favorites.value;
  return favorites.value.filter((f) => Number(f.folder_id) === Number(selectedFolderId.value));
});

const favoriteIdSet = computed(() => new Set(favorites.value.map((f) => Number(f.id))));

function editableMaterial(item) {
  if (!builder.editMode || !builder.canEdit) return item;
  const draft = builder.contentDraft?.materials?.find((material) => String(material.id) === String(item?.id));
  return draft ? { ...item, ...draft } : item;
}

function isFavorited(resourceId) {
  return favoriteIdSet.value.has(Number(resourceId));
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

async function loadFolders() {
  try {
    const { data } = await api.get('/favorites/folders');
    folders.value = data.folders || [];
    if (!selectedFolderId.value && folders.value.length) {
      selectedFolderId.value = folders.value.find((f) => f.is_default)?.id || folders.value[0].id;
    }
    favoriteError.value = '';
  } catch (e) {
    favoriteError.value = e.response?.data?.error || 'Could not load your favorite folders. Please try again.';
  }
}

async function loadFavorites() {
  try {
    const params = selectedFolderId.value ? { folder: selectedFolderId.value } : {};
    const { data } = await api.get('/favorites', { params });
    favorites.value = data.favorites || [];
    favoriteError.value = '';
  } catch (e) {
    favoriteError.value = e.response?.data?.error || 'Could not load your favorites. Please try again.';
  }
}

watch(selectedFolderId, loadFavorites);

const displayName = computed(() => auth.user?.name === 'Administrador' ? 'Administrator' : (auth.user?.name || '—'));
const maskedPassword = '••••••••••••';

function goToProfile() {
  router.push('/perfil');
}

const planLabel = computed(() => {
  if (isPremium.value) return subscription.value?.planName || t('planPremium');
  return t('planFree');
});

const renewalText = computed(() => {
  if (!isPremium.value) return t('noRenewal');
  const ends = subscription.value?.endsAt;
  if (!ends) return t('noRenewal');
  const d = new Date(ends);
  if (Number.isNaN(d.getTime())) return t('noRenewal');
  const locale = isEn.value ? 'en-US' : 'pt-BR';
  const dateStr = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const price = subscription.value?.price;
  if (price != null && price > 0) {
    const amount = new Intl.NumberFormat(locale, { style: 'currency', currency: paywall.value.paypalCurrency || 'USD' }).format(price);
    return isEn.value ? `${dateStr} for ${amount}` : `${dateStr} — ${amount}`;
  }
  return dateStr;
});

onMounted(async () => {
  loading.value = true;
  favoriteError.value = '';
  try {
    await auth.fetchMe();
  } catch { /* sessão local */ }
  const [fav, dl, sub, folderRes] = await Promise.allSettled([
    api.get('/favorites', { params: {} }),
    api.get('/downloads/history'),
    api.get('/subscriptions/me'),
    api.get('/favorites/folders'),
  ]);
  if (folderRes.status === 'fulfilled') {
    folders.value = folderRes.value.data.folders || [];
    if (folders.value.length) {
      selectedFolderId.value = folders.value.find((f) => f.is_default)?.id || folders.value[0].id;
    }
  } else {
    favoriteError.value = 'Could not load your favorite folders. Please try again.';
  }
  if (selectedFolderId.value) {
    await loadFavorites();
  } else if (fav.status === 'fulfilled') {
    favorites.value = fav.value.data.favorites || [];
  } else {
    favoriteError.value = 'Could not load your favorites. Please try again.';
  }
  if (dl.status === 'fulfilled') downloads.value = dl.value.data.downloads || [];
  if (sub.status === 'fulfilled') {
    subscription.value = sub.value.data.subscription || null;
    isPremium.value = !!sub.value.data.isPremium;
    paywall.value = sub.value.data.paywall || {};
  }
  loading.value = false;
  await handleCheckoutReturn();
});

// After returning from Stripe Checkout, reflect the result. The subscription is
// activated server-side by the webhook, so we re-fetch to pick up premium status.
async function handleCheckoutReturn() {
  const status = route.query.checkout;
  if (!status) return;
  if (status === 'success') {
    checkoutNotice.value = t('checkoutSuccess');
    try {
      const { data } = await api.get('/subscriptions/me');
      subscription.value = data.subscription || subscription.value;
      isPremium.value = !!data.isPremium;
      await auth.fetchMe();
    } catch { /* webhook may still be processing */ }
  } else if (status === 'cancel') {
    checkoutNotice.value = t('checkoutCancelled');
  }
  router.replace({ query: {} });
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const locale = isEn.value ? 'en-US' : 'pt-BR';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

async function removeFavorite(id) {
  favoriteLoadingId.value = id;
  favoriteError.value = '';
  try {
    await api.delete(`/favorites/${id}`);
    favorites.value = favorites.value.filter((f) => f.id !== id);
    await loadFolders();
  } catch (e) {
    favoriteError.value = e.response?.data?.error || 'Could not remove this favorite. Please try again.';
  } finally {
    favoriteLoadingId.value = null;
  }
}

async function addFavorite(resourceId) {
  folderResourceId.value = resourceId;
  showFolderModal.value = true;
}

function onFolderSaved() {
  loadFavorites();
  loadFolders();
}

function openDownloadPage(item) {
  if (!item.last_file_id) {
    router.push(`/resource/${item.slug}`);
    return;
  }
  const url = router.resolve({
    name: 'download',
    params: { slug: item.slug, fileId: item.last_file_id },
  }).href;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) router.push(url);
}

async function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  favoriteError.value = '';
  try {
    const { data } = await api.post('/favorites/folders', { name });
    folders.value = [...folders.value, data.folder];
    selectedFolderId.value = data.folder.id;
    newFolderName.value = '';
    showNewFolder.value = false;
    await loadFavorites();
  } catch (e) {
    favoriteError.value = e.response?.data?.error || 'Could not create the folder. Please try again.';
  }
}

async function onPayPalSuccess(data) {
  paymentError.value = '';
  isPremium.value = true;
  subscription.value = data.subscription || subscription.value;
  await auth.fetchMe();
}
</script>

<template>
  <div class="container py-4 k5-account-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before account" />
    <SelectFolderModal
      v-model="showFolderModal"
      :resource-id="folderResourceId"
      @saved="onFolderSaved"
    />
    <h1 class="k5-account-title">{{ t('myAccount') }}</h1>
    <div v-if="favoriteError" class="alert alert-warning" role="alert">{{ favoriteError }}</div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <template v-else>
      <!-- User info -->
      <section class="k5-account-section">
        <div class="k5-account-section-head">
          <h2 class="k5-account-section-title">{{ t('userInfo') }}</h2>
          <button type="button" class="k5-account-action-btn" @click="goToProfile">
            {{ t('updateUserInfo') }}
          </button>
        </div>
        <div class="k5-account-row">
          <span class="k5-account-label">{{ t('name') }}</span>
          <span class="k5-account-value">{{ displayName }}</span>
          <span class="k5-account-action-spacer"></span>
        </div>
        <div class="k5-account-row">
          <span class="k5-account-label">{{ t('email') }}</span>
          <span class="k5-account-value">{{ auth.user?.email }}</span>
          <span class="k5-account-action-spacer"></span>
        </div>
        <div class="k5-account-row">
          <span class="k5-account-label">{{ t('password') }}</span>
          <span class="k5-account-value k5-account-masked">{{ maskedPassword }}</span>
          <span class="k5-account-action-spacer"></span>
        </div>
      </section>

      <!-- Subscription info -->
      <section class="k5-account-section">
        <h2 class="k5-account-section-title">{{ t('subscriptionInfo') }}</h2>
        <div class="k5-account-row">
          <span class="k5-account-label">{{ t('plan') }}</span>
          <span class="k5-account-value">{{ planLabel }}</span>
          <span class="k5-account-action-spacer"></span>
        </div>
        <div class="k5-account-row">
          <span class="k5-account-label">{{ t('nextPayment') }}</span>
          <span class="k5-account-value">
            {{ renewalText }}
            <em v-if="isPremium && subscription?.endsAt" class="k5-account-reminder">{{ t('reminderNote') }}</em>
          </span>
          <span class="k5-account-action-spacer"></span>
        </div>
        <p v-if="checkoutNotice" class="alert alert-info py-2 mt-3 mb-0">{{ checkoutNotice }}</p>
        <div v-if="!isPremium && (paymentsEnabled || stripeEnabled)" class="k5-account-upgrade mt-3" style="max-width: 320px">
          <PayPalCheckout
            v-if="paymentsEnabled"
            :client-id="paywall.paypalClientId"
            :currency="paywall.paypalCurrency || 'USD'"
            @success="onPayPalSuccess"
            @error="paymentError = $event"
          />
          <StripeCheckout
            v-if="stripeEnabled"
            :class="{ 'mt-2': paymentsEnabled }"
            @error="paymentError = $event"
          />
          <p v-if="paymentError" class="small text-danger mt-2 mb-0">{{ paymentError }}</p>
        </div>
        <div v-else-if="!isPremium && paywall.upgradeUrl" class="k5-account-upgrade mt-3">
          <a :href="paywall.upgradeUrl" target="_blank" rel="noopener" class="btn btn-warning">
            <i class="bi bi-star me-1"></i>{{ t('upgradePremium') }}
          </a>
        </div>
      </section>

      <!-- Saved materials / downloads -->
      <ul class="nav nav-pills account-tabs mb-3 mt-4">
        <li class="nav-item">
          <button type="button" class="nav-link" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">
            <i class="bi bi-bookmark me-1"></i>{{ t('savedMaterials') }} ({{ savedCount }})
          </button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link" :class="{ active: tab === 'downloads' }" @click="tab = 'downloads'">
            <i class="bi bi-download me-1"></i>{{ t('myDownloads') }} ({{ downloadCount }})
          </button>
        </li>
      </ul>

      <section v-show="tab === 'overview'">
        <div class="d-flex justify-content-end mb-2">
          <RouterLink to="/minha-lista" class="small text-decoration-none">
            <i class="bi bi-bookmark me-1"></i>{{ t('myBookmarks') }}
          </RouterLink>
        </div>

        <div v-if="!folders.length && !favorites.length" class="jer-card text-center py-5">
          <i class="bi bi-bookmark display-5 text-muted d-block mb-3"></i>
          <RouterLink to="/biblioteca" class="btn btn-primary">{{ t('exploreLibrary') }}</RouterLink>
        </div>

        <div v-else class="k5-bookmarks-layout k5-account-folders-layout">
          <aside class="k5-bookmarks-folders">
            <h3 class="k5-bookmarks-folders-title">{{ t('folders') }}</h3>
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
            <div v-if="!filteredFavorites.length" class="jer-card text-center py-4">
              <p class="text-muted mb-3">{{ t('folderEmpty') }}</p>
              <RouterLink to="/biblioteca" class="btn btn-primary btn-sm">{{ t('exploreLibrary') }}</RouterLink>
            </div>
            <div v-else class="row g-4">
              <div v-for="item in filteredFavorites" :key="item.id" class="col-md-6 col-lg-4">
                <article class="favorites-card card h-100 border-0 shadow-sm">
                  <RouterLink :to="`/resource/${item.slug}`" class="favorites-card-cover">
                    <img v-if="item.cover_image && !item.cover_hidden" :src="mediaUrl(item.cover_image)" :alt="item.title" />
                    <div v-else class="favorites-card-cover-placeholder"><i class="bi bi-file-earmark"></i></div>
                  </RouterLink>
                  <div class="card-body d-flex flex-column">
                    <h2 class="h6 card-title">
                      <RouterLink :to="`/resource/${item.slug}`" class="text-decoration-none text-dark"><EditableContentText entity="material" :item="editableMaterial(item)" field="title" tag="span" placeholder="Material title…" /></RouterLink>
                    </h2>
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
                      class="mt-2"
                      @unfavorite="removeFavorite(item.id)"
                    />
                    <div class="d-flex gap-2 mt-2">
                      <RouterLink :to="`/resource/${item.slug}`" class="btn btn-sm btn-primary flex-grow-1">Open</RouterLink>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-show="tab === 'downloads'">
        <div v-if="!downloads.length" class="jer-card text-center py-5">
          <i class="bi bi-download display-5 text-muted d-block mb-3"></i>
          <RouterLink to="/biblioteca" class="btn btn-primary">{{ t('exploreLibrary') }}</RouterLink>
        </div>
        <div v-else class="jer-card p-0 overflow-hidden">
          <ul class="list-group list-group-flush account-download-list">
            <li v-for="item in downloads" :key="item.id" class="list-group-item account-download-row">
              <RouterLink :to="`/resource/${item.slug}`" class="account-dl-thumb">
                <img v-if="item.cover_image && !item.cover_hidden" :src="mediaUrl(item.cover_image)" :alt="item.title" />
                <div v-else class="account-dl-thumb-placeholder"><i class="bi bi-file-earmark"></i></div>
              </RouterLink>
              <div class="account-download-main flex-grow-1 min-w-0">
                <RouterLink :to="`/resource/${item.slug}`" class="fw-semibold text-decoration-none text-dark d-block text-truncate">
                  <EditableContentText entity="material" :item="editableMaterial(item)" field="title" tag="span" placeholder="Material title…" />
                </RouterLink>
                <small class="text-muted">{{ formatDate(item.downloaded_at) }}</small>
                <K5WorksheetActions
                  :slug="item.slug"
                  :title="item.title"
                  :resource-id="item.id"
                  :cover-image="item.cover_hidden ? '' : item.cover_image"
                  :files="item.files || []"
                  :is-favorited="isFavorited(item.id)"
                  :favorite-loading="favoriteLoadingId === item.id"
                  :can-preview-pdf="true"
                  compact
                  :check-auth="() => true"
                  class="mt-2"
                  @favorite="addFavorite(item.id)"
                  @unfavorite="removeFavorite(item.id)"
                />
              </div>
              <div class="account-download-btns">
                <RouterLink :to="`/resource/${item.slug}`" class="btn btn-sm btn-outline-primary">
                  Open
                </RouterLink>
                <button type="button" class="btn btn-sm btn-primary" @click="openDownloadPage(item)">
                  <i class="bi bi-download me-1"></i>{{ t('download') }}
                </button>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </template>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after account" />
  </div>
</template>

<style scoped>
.k5-account-title {
  color: #3d5c3d;
  font-weight: 800;
  font-size: 2rem;
  margin-bottom: 1.5rem;
}
.k5-account-section {
  margin-bottom: 2rem;
}
.k5-account-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--edu-border);
}
.k5-account-section-title {
  color: #1a6f7c;
  font-weight: 800;
  font-size: 1.15rem;
  margin: 0;
}
.k5-account-action-btn {
  border: none;
  background: none;
  color: #2e7d9a;
  text-decoration: underline;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.25rem 0;
  font-family: inherit;
}
.k5-account-action-btn:hover {
  color: #1a6f7c;
}
.k5-account-row {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 0.75rem 1.5rem;
  align-items: baseline;
  padding: 0.5rem 0;
  border-bottom: 1px dashed #e8e8e8;
}
.k5-account-label {
  font-weight: 700;
  color: var(--edu-text);
}
.k5-account-value {
  color: var(--edu-text-muted);
}
.k5-account-masked {
  letter-spacing: 2px;
}
.k5-account-action {
  color: #2e7d9a;
  text-decoration: underline;
  font-size: 0.95rem;
  white-space: nowrap;
  position: relative;
  z-index: 2;
  cursor: pointer;
}
.k5-account-action-spacer {
  min-width: 1px;
}
.k5-account-reminder {
  display: block;
  font-size: 0.85rem;
  color: var(--edu-text-muted);
  margin-top: 0.35rem;
}
.account-dl-thumb {
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--edu-sky-light);
  display: block;
}
.account-dl-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.account-dl-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--edu-border);
  font-size: 1.5rem;
}
.min-w-0 {
  min-width: 0;
}
.account-download-row {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  flex-wrap: wrap;
}
.account-download-main {
  flex: 1;
  min-width: 180px;
}
.account-download-btns {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-shrink: 0;
  align-self: center;
}
@media (max-width: 575px) {
  .account-download-btns {
    flex-direction: row;
    width: 100%;
  }
  .account-download-btns .btn {
    flex: 1;
  }
}
@media (max-width: 767px) {
  .k5-account-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  .k5-account-action {
    justify-self: start;
  }
}
.k5-account-folders-layout {
  margin-top: 0.25rem;
}
</style>
