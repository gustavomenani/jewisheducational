<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import api from '@/api';
import { useSettingsStore } from '@/stores';
import { useBuilderStore } from '@/builder/store';
import { categoryVisibleInDraft, materialVisibleInDraft } from '@/builder/contentModel';
import K5CategorySidebar from '@/components/K5CategorySidebar.vue';
import EditableSetting from '@/builder/EditableSetting.vue';
import EditableContentText from '@/builder/EditableContentText.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { buildCategoryTree, visibleCategoriesForVisitors } from '@/utils/categoryTree';
import { parseMaterialTypes } from '@/utils/materialTypes';
import { mediaUrl } from '@/utils/media';
import { gradeLevelLabel } from '@/utils/gradeLevels';
import { shouldShowLibraryCatalog } from '@/utils/libraryCatalogMode';
import {
  buildCollectionPageSchema,
  buildOrganizationSchema,
  buildWebSiteSchema,
  setSeo,
} from '@/utils/seo';
import {
  CATALOG_BATCH_SIZE,
  hasMoreResources,
  mergeUniqueResources,
} from '@/utils/catalogPagination';

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const builder = useBuilderStore();
const resources = ref([]);
const categories = ref([]);
const categoryError = ref('');
const pagination = ref({ page: 1, limit: CATALOG_BATCH_SIZE, total: 0 });
const search = ref('');
const selectedCategory = ref('');
const fileType = ref('');
const sortBy = ref('featured');
const accessFilter = ref('');
const gradeLevel = ref('');
const gradeLevels = ref([]);
const materialType = ref('');
const materialTypes = ref([]);
const loading = ref(false);
const loadingMore = ref(false);
const catalogError = ref('');
const filtersOpen = ref(false);
const suppressAutoFilter = ref(true);
const paymentsEnabled = ref(false);
let searchDebounceTimer;
let catalogRequestId = 0;
let catalogAbortController = null;
let materialTypesRequestId = 0;
let materialTypesAbortController = null;

const siteSettings = computed(() => ({
  ...settings.settings,
  ...(builder.editMode && builder.canEdit ? builder.pendingSettings : {}),
}));
const editableCategories = computed(() => {
  const draft = builder.contentDraft?.categories;
  const source = builder.editMode && builder.canEdit && Array.isArray(draft)
    ? draft.filter((category) => categoryVisibleInDraft(category, draft))
    : categories.value;
  return visibleCategoriesForVisitors(source);
});
const displayResources = computed(() => {
  const draft = builder.contentDraft?.materials;
  if (!builder.editMode || !builder.canEdit || !Array.isArray(draft)) return resources.value;
  const byId = new Map(draft.map((item) => [String(item.id), item]));
  const merged = resources.value
    .map((item) => ({ ...item, ...(byId.get(String(item.id)) || {}) }))
    .filter((item) => !item.is_archived && (!item.category_id || categoryVisibleInDraft(item, builder.contentDraft.categories)));
  const serverIds = new Set(resources.value.map((item) => String(item.id)));
  const additions = draft
    .filter((item) => !serverIds.has(String(item.id)) && !item.is_archived && (!item.category_id || categoryVisibleInDraft(builder.contentDraft.categories.find((category) => String(category.id) === String(item.category_id)), builder.contentDraft.categories)))
    .map((item) => ({ ...item, category_name: builder.contentDraft.categories.find((category) => String(category.id) === String(item.category_id))?.name || '' }));
  return [...merged, ...additions];
});
function settingText(key, fallback) {
  return builder.settingValue(key, fallback);
}

function settingVisible(key, fallback = true) {
  const value = settingText(key, fallback ? 'true' : 'false');
  return value !== false && String(value).toLowerCase() !== 'false';
}

const showLibraryPageIcon = computed(() => settingVisible('library_page_head_icon_show', false));
const showCategorySubtitle = computed(() => settingVisible('library_category_subtitle_show', false));
const showSubtopicsHeading = computed(() => settingVisible('library_subtopics_show', false));
const showResultsHeading = computed(() => settingVisible('library_results_heading_show', false));
const showMaterialTypes = computed(() => settingVisible('library_material_types_show', true));
const showRootCatalog = computed(() => settingVisible('library_root_catalog_show', false));
const hasSearchFilters = computed(() => Boolean(
  search.value.trim()
  || fileType.value
  || accessFilter.value
  || gradeLevel.value
  || materialType.value
  || sortBy.value !== 'featured'
));
const isGradeLanding = computed(() => Boolean(
  !selectedCategory.value
  && gradeLevel.value
  && !search.value.trim()
  && !fileType.value
  && !accessFilter.value
  && !materialType.value
  && sortBy.value === 'featured'
));
const showCatalogOnCurrentRoute = computed(() => shouldShowLibraryCatalog({
  categorySlug: selectedCategory.value,
  hasSearchFilters: hasSearchFilters.value,
  gradeLanding: isGradeLanding.value,
  rootCatalogEnabled: showRootCatalog.value,
}));

function selectContentFromCanvas(event, entity, item) {
  if (!builder.editMode || !builder.canEdit) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('editor:content-select', { detail: { entity, id: item?.id } }));
}

const fileTypeOptions = [
  { value: '', label: 'All types', icon: 'bi bi-files' },
  { value: 'pdf', label: 'PDF', icon: 'bi bi-file-pdf' },
  { value: 'docx', label: 'Word (DOCX)', icon: 'bi bi-file-word' },
  { value: 'presentation', label: 'Presentations', icon: 'bi bi-file-ppt' },
  { value: 'ppt', label: 'PPT', icon: 'bi bi-file-ppt' },
  { value: 'pptx', label: 'PPTX', icon: 'bi bi-file-ppt' },
  { value: 'other', label: 'Other', icon: 'bi bi-file-earmark' },
];

const sortOptions = [
  { value: 'featured', label: 'Featured order' },
  { value: 'newest', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'views', label: 'Most viewed' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
];

const accessOptions = [
  { value: '', label: 'Free and Premium' },
  { value: 'free', label: 'Free only' },
  { value: 'premium', label: 'Premium only' },
];

const quickTypeChips = [
  { value: 'pdf', label: 'PDF', icon: 'bi bi-file-pdf' },
  { value: 'docx', label: 'Worksheets', icon: 'bi bi-file-word' },
  { value: 'presentation', label: 'Slides', icon: 'bi bi-easel' },
];

async function loadCategories() {
  categoryError.value = '';
  try {
    const { data } = await api.get('/categories');
    categories.value = data.categories || [];
  } catch (e) {
    categories.value = [];
    categoryError.value = e.response?.data?.error || 'Could not load categories. The catalog is still available.';
  }
}

function syncFromRoute() {
  search.value = route.query.q?.toString() || '';
  fileType.value = route.query.type?.toString() || '';
  sortBy.value = route.query.sort?.toString() || 'featured';
  accessFilter.value = route.query.access?.toString() || '';
  gradeLevel.value = route.query.grade?.toString() || '';
  materialType.value = route.query.material_type?.toString() || '';
  selectedCategory.value = route.params.slug?.toString() || route.query.category?.toString() || '';
  pagination.value.page = 1;
  pagination.value.limit = CATALOG_BATCH_SIZE;
  // Dashboard de busca/filtros fica fechado por padrão — só abre ao clicar na lupa.
}

function toggleFilters() {
  filtersOpen.value = !filtersOpen.value;
}

function selectGradeLevel(level) {
  gradeLevel.value = gradeLevel.value === level ? '' : level;
}

function buildQuery() {
  const query = {};
  if (search.value.trim()) query.q = search.value.trim();
  if (fileType.value) query.type = fileType.value;
  if (sortBy.value !== 'featured') query.sort = sortBy.value;
  if (accessFilter.value) query.access = accessFilter.value;
  if (gradeLevel.value) query.grade = gradeLevel.value;
  if (materialType.value) query.material_type = materialType.value;
  if (selectedCategory.value && !route.params.slug) query.category = selectedCategory.value;
  return query;
}

const categoryLinkQuery = computed(() => {
  const query = buildQuery();
  delete query.category;
  return query;
});

function categoryPath(slug) {
  const query = categoryLinkQuery.value;
  const queryString = new URLSearchParams(query).toString();
  return `/library/category/${slug}${queryString ? `?${queryString}` : ''}`;
}

function libraryPath() {
  return selectedCategory.value
    ? `/library/category/${selectedCategory.value}`
    : '/library';
}

async function load({ append = false, page = 1 } = {}) {
  if (!showCatalogOnCurrentRoute.value) {
    catalogRequestId += 1;
    catalogAbortController?.abort();
    resources.value = [];
    pagination.value = { page: 1, limit: CATALOG_BATCH_SIZE, total: 0 };
    catalogError.value = '';
    loading.value = false;
    loadingMore.value = false;
    return;
  }
  const requestId = ++catalogRequestId;
  catalogAbortController?.abort();
  const controller = new AbortController();
  catalogAbortController = controller;
  if (append) loadingMore.value = true;
  else {
    loading.value = true;
    resources.value = [];
    pagination.value = { page: 1, limit: CATALOG_BATCH_SIZE, total: 0 };
  }
  catalogError.value = '';
  try {
    const params = {
      page,
      limit: CATALOG_BATCH_SIZE,
      q: search.value.trim() || undefined,
      category: selectedCategory.value || undefined,
      type: fileType.value || undefined,
      sort: sortBy.value !== 'featured' ? sortBy.value : undefined,
      access: accessFilter.value || undefined,
      grade: gradeLevel.value || undefined,
      material_type: materialType.value || undefined,
    };
    const { data } = await api.get('/resources', { params, signal: controller.signal });
    if (requestId !== catalogRequestId) return;
    const incoming = data.resources || [];
    resources.value = append ? mergeUniqueResources(resources.value, incoming) : incoming;
    pagination.value = {
      page,
      limit: CATALOG_BATCH_SIZE,
      total: Number(data.pagination?.total) || resources.value.length,
    };
  } catch (error) {
    if (controller.signal.aborted || requestId !== catalogRequestId) return;
    catalogError.value = error.response?.data?.error || 'Could not load materials. Please try again.';
  } finally {
    if (requestId === catalogRequestId) {
      if (append) loadingMore.value = false;
      else loading.value = false;
    }
  }
}

const hasMore = computed(() => hasMoreResources(resources.value, pagination.value.total));

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  await load({ append: true, page: pagination.value.page + 1 });
}

async function retryCatalog() {
  if (resources.value.length) await loadMore();
  else await load({ page: 1 });
}

// Só mostra botões de "Tipo de material" que têm pelo menos um material
// publicado no assunto atual — evita botões vazios/sem função.
const availableMaterialTypes = ref([]);
let lastTypesCategory = null;
async function loadAvailableMaterialTypes() {
  if (!showCatalogOnCurrentRoute.value) {
    materialTypesRequestId += 1;
    materialTypesAbortController?.abort();
    availableMaterialTypes.value = [];
    lastTypesCategory = null;
    return;
  }
  const cat = selectedCategory.value || '';
  if (cat === lastTypesCategory) return;
  const requestId = ++materialTypesRequestId;
  materialTypesAbortController?.abort();
  const controller = new AbortController();
  materialTypesAbortController = controller;
  lastTypesCategory = cat;
  try {
    const { data } = await api.get('/resources', {
      params: { category: cat || undefined, limit: 100 },
      signal: controller.signal,
    });
    if (requestId !== materialTypesRequestId) return;
    availableMaterialTypes.value = [
      ...new Set((data.resources || []).map((r) => r.material_type).filter(Boolean)),
    ];
  } catch {
    if (controller.signal.aborted || requestId !== materialTypesRequestId) return;
    availableMaterialTypes.value = [];
    lastTypesCategory = null;
  }
}
const visibleMaterialTypes = computed(() => {
  if (!showMaterialTypes.value) return [];
  if (!showCatalogOnCurrentRoute.value) return [];
  return materialTypes.value.filter((mt) => availableMaterialTypes.value.includes(mt.label));
});

async function applyFilters(resetPage = true) {
  if (resetPage) pagination.value.page = 1;
  pagination.value.limit = CATALOG_BATCH_SIZE;
  await router.push({ path: libraryPath(), query: buildQuery() });
}

function scheduleAutoFilter() {
  if (suppressAutoFilter.value) return;
  applyFilters();
}

function onSearchInput() {
  if (suppressAutoFilter.value) return;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => applyFilters(), 400);
}

function clearFilters() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = null;
  search.value = '';
  selectedCategory.value = '';
  fileType.value = '';
  sortBy.value = 'featured';
  accessFilter.value = '';
  gradeLevel.value = '';
  materialType.value = '';
  pagination.value.page = 1;
  pagination.value.limit = CATALOG_BATCH_SIZE;
  router.push({ path: '/library', query: {} });
}

function removeFilter(key) {
  if (key === 'q') search.value = '';
  if (key === 'category') {
    selectedCategory.value = '';
    applyFilters();
    return;
  }
  if (key === 'type') fileType.value = '';
  if (key === 'access') accessFilter.value = '';
  if (key === 'grade') gradeLevel.value = '';
  if (key === 'material_type') materialType.value = '';
  if (key === 'sort') sortBy.value = 'featured';
  applyFilters();
}

function setQuickType(type) {
  fileType.value = fileType.value === type ? '' : type;
  applyFilters();
}

// Material de apresentação (PPT/PPTX): no card ele abre o visualizador de
// slides em vez de baixar — "somente para assistir", passando com a seta.
function isPresentationItem(item) {
  const types = (item.file_types || '').toLowerCase();
  return !!item.canva_url || types.includes('ppt') || types.includes('presentation');
}

function toggleMaterialType(mt) {
  materialType.value = materialType.value === mt ? '' : mt;
  applyFilters();
}


const activeFilters = computed(() => {
  const items = [];
  if (search.value.trim()) items.push({ key: 'q', label: `Search: “${search.value.trim()}”` });
  if (selectedCategory.value) {
    const cat = editableCategories.value.find((c) => c.slug === selectedCategory.value);
    items.push({ key: 'category', label: cat?.name || selectedCategory.value });
  }
  if (fileType.value) {
    const opt = fileTypeOptions.find((o) => o.value === fileType.value);
    items.push({ key: 'type', label: opt?.label || fileType.value });
  }
  if (accessFilter.value) {
    const opt = accessOptions.find((o) => o.value === accessFilter.value);
    items.push({ key: 'access', label: opt?.label || accessFilter.value });
  }
  if (gradeLevel.value) {
    items.push({ key: 'grade', label: `Grade: ${gradeLevel.value}` });
  }
  if (materialType.value) {
    items.push({ key: 'material_type', label: `Type: ${materialType.value}` });
  }
  if (sortBy.value !== 'featured') {
    const opt = sortOptions.find((o) => o.value === sortBy.value);
    items.push({ key: 'sort', label: opt?.label || sortBy.value });
  }
  return items;
});

const hasActiveFilters = computed(
  () =>
    activeFilters.value.length > 0 ||
    sortBy.value !== 'featured'
);

const currentCategory = computed(() =>
  selectedCategory.value
    ? editableCategories.value.find((c) => c.slug === selectedCategory.value) || null
    : null
);

function getCategoryAncestors(cat) {
  if (!cat) return [];
  const chain = [];
  let pid = cat.parent_id;
  while (pid) {
    const parent = editableCategories.value.find((c) => Number(c.id) === Number(pid));
    if (!parent) break;
    chain.unshift(parent);
    pid = parent.parent_id;
  }
  return chain;
}

const rootCategory = computed(() => {
  if (!currentCategory.value) return null;
  const ancestors = getCategoryAncestors(currentCategory.value);
  return ancestors[0] || currentCategory.value;
});

const breadcrumbItems = computed(() => {
  const items = [{ name: 'Library', to: '/library', active: false }];
  if (!currentCategory.value) {
    if (search.value.trim() || hasActiveFilters.value) {
      items.push({ name: 'Results', to: null, active: true });
    } else {
      items[0].active = true;
    }
    return items;
  }
  const chain = [...getCategoryAncestors(currentCategory.value), currentCategory.value];
  chain.forEach((cat) => {
    items.push({
      name: cat.name,
      category: cat,
      to: categoryPath(cat.slug),
      active: false,
    });
  });
  items[items.length - 1].active = true;
  return items;
});

const childCategories = computed(() => {
  const tree = buildCategoryTree(editableCategories.value);
  if (!currentCategory.value) {
    return tree;
  }
  // Recursive search to find node at any depth in the tree
  function findNode(nodes) {
    for (const n of nodes) {
      if (Number(n.id) === Number(currentCategory.value.id)) return n;
      if (n.children?.length) {
        const found = findNode(n.children);
        if (found) return found;
      }
    }
    return null;
  }
  const node = findNode(tree);
  return node?.children || [];
});

const sidebarTitle = computed(() => {
  if (rootCategory.value) return rootCategory.value.name;
  return settingText('drawer_subjects_title', 'Subjects');
});

const browseMode = computed(
  () =>
    !search.value.trim() &&
    !fileType.value &&
    !accessFilter.value &&
    !gradeLevel.value &&
    !materialType.value &&
    sortBy.value === 'featured'
);

const pageTitle = computed(() => {
  if (currentCategory.value) return currentCategory.value.name;
  if (search.value.trim()) return `Search: ${search.value.trim()}`;
  return settingText('library_page_title', 'Resource Library');
});

const pageSubtitle = computed(() => {
  if (currentCategory.value?.description) return currentCategory.value.description;
  if (currentCategory.value) {
    return 'Educational resources in this category and its subtopics.';
  }
  return settingText('library_page_subtitle', 'Find materials by subject, file type, and grade.');
});

function libraryBreadcrumbs() {
  const items = [{ name: 'Library', path: '/library' }];
  if (!currentCategory.value) return items;
  const chain = [...getCategoryAncestors(currentCategory.value), currentCategory.value];
  chain.forEach((category, index) => {
    items.push({
      name: category.name,
      path: index === chain.length - 1 ? undefined : `/library/category/${category.slug}`,
    });
  });
  return items;
}

function updateLibrarySeo() {
  const category = currentCategory.value;
  const path = category ? `/library/category/${category.slug}` : '/library';
  const siteName = settingText('site_name', 'Jewish Educational Resources');
  const description = category?.description
    || (category
      ? `Browse Jewish educational resources in ${category.name} and related subtopics.`
      : 'Explore printable Jewish educational resources by subject, file type, grade, and age group.');
  setSeo({
    title: category ? `${category.name} Resources` : pageTitle.value,
    siteName,
    description,
    canonical: path,
    robots: hasSearchFilters.value ? 'noindex,follow' : 'index,follow',
    type: 'website',
    jsonLd: [
      buildWebSiteSchema(siteName, description),
      buildOrganizationSchema(siteName, description),
      buildCollectionPageSchema({
        name: category ? `${category.name} Resources` : 'Resource Library',
        description,
        path,
        breadcrumbs: libraryBreadcrumbs(),
        items: displayResources.value.slice(0, 50).map((item) => ({
          name: item.title,
          path: `/resource/${item.slug}`,
        })),
      }),
    ],
  });
}

watch(
  [currentCategory, pageTitle, pageSubtitle, displayResources, () => siteSettings.value.site_name, hasSearchFilters],
  updateLibrarySeo,
  { immediate: true, deep: true }
);

onMounted(async () => {
  const categoryRequest = loadCategories();
  try {
    const { data: settingsData } = await api.get('/settings');
    paymentsEnabled.value = settingsData.settings?.paypal_enabled === 'true';
    gradeLevels.value = (settingsData.settings?.grade_levels || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    materialTypes.value = parseMaterialTypes(settingsData.settings?.material_types);
  } catch { /* níveis e tipos são opcionais */ }
  syncFromRoute();
  try {
    await Promise.all([categoryRequest, load(), loadAvailableMaterialTypes()]);
  } finally {
    await nextTick();
    suppressAutoFilter.value = false;
  }
});

watch(
  () => [route.params.slug, route.query],
  async () => {
    suppressAutoFilter.value = true;
    syncFromRoute();
    try {
      await Promise.all([load(), loadAvailableMaterialTypes()]);
    } finally {
      await nextTick();
      suppressAutoFilter.value = false;
    }
  },
  { deep: true }
);

watch([selectedCategory, fileType, sortBy, accessFilter, gradeLevel, materialType], scheduleAutoFilter);

onUnmounted(() => {
  clearTimeout(searchDebounceTimer);
  catalogRequestId += 1;
  materialTypesRequestId += 1;
  catalogAbortController?.abort();
  materialTypesAbortController?.abort();
});
</script>

<template>
  <div class="library-k5-page">
    <SiteContentSlot page-id="library" zone="before-library" label="Content before the library" />
    <div class="container k5-container">
      <div class="k5-page-shell" :class="{ 'k5-page-shell-has-types': visibleMaterialTypes.length }">
        <div class="k5-page-shell-sidebar">
          <K5CategorySidebar
            :categories="editableCategories"
            :active-slug="selectedCategory"
            :anchor-category="rootCategory"
            :link-query="categoryLinkQuery"
            :title-item="rootCategory"
            title-setting-key="drawer_subjects_title"
            title-default="Subjects"
          />

          <section
            v-if="showCatalogOnCurrentRoute && gradeLevels.length"
            id="library-grade-filter-sidebar"
            class="k5-grade-filter"
            aria-labelledby="library-grade-filter-sidebar-title"
          >
            <h2 id="library-grade-filter-sidebar-title" class="k5-grade-filter-title">
              <EditableSetting tag="span" setting-key="library_grade_label" :default="'Class level'" />
            </h2>
            <div class="k5-grade-filter-options" role="group" aria-label="Class levels">
              <button
                type="button"
                class="k5-grade-filter-option"
                :class="{ active: !gradeLevel }"
                :aria-pressed="!gradeLevel"
                @click="selectGradeLevel('')"
              >
                All levels
              </button>
              <button
                v-for="level in gradeLevels"
                :key="level"
                type="button"
                class="k5-grade-filter-option"
                :class="{ active: gradeLevel === level }"
                :aria-pressed="gradeLevel === level"
                @click="selectGradeLevel(level)"
              >
                {{ gradeLevelLabel(level) }}
              </button>
            </div>
          </section>
        </div>

        <div class="k5-page-shell-body">
          <nav v-if="showCatalogOnCurrentRoute" aria-label="breadcrumb" class="k5-breadcrumb k5-breadcrumb-inline">
            <ol class="breadcrumb mb-0">
              <li
                v-for="(crumb, index) in breadcrumbItems"
                :key="`${crumb.name}-${index}`"
                class="breadcrumb-item"
                :class="{ active: crumb.active }"
              >
                <RouterLink v-if="crumb.to && !crumb.active" :to="crumb.to">
                  <EditableContentText v-if="crumb.category" entity="category" :item="crumb.category" field="name" tag="span" placeholder="Category name…" />
                  <span v-else>{{ crumb.name }}</span>
                </RouterLink>
                <EditableContentText v-else-if="crumb.category" entity="category" :item="crumb.category" field="name" tag="span" placeholder="Category name…" />
                <span v-else>{{ crumb.name }}</span>
              </li>
            </ol>
          </nav>

          <div v-if="showCatalogOnCurrentRoute" class="k5-library-toolbar">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm library-search-toggle"
          :class="{ active: filtersOpen }"
          @click="toggleFilters"
        >
          <i class="bi bi-search me-1"></i>
          <EditableSetting tag="span" :setting-key="filtersOpen ? 'library_search_hide_label' : 'library_search_toggle_label'" :default="filtersOpen ? 'Hide search' : 'Search and filter'" />
        </button>
      </div>

          <div v-if="categoryError" class="alert alert-warning py-2 mb-3" role="alert">
            <span>{{ categoryError }}</span>
            <button type="button" class="btn btn-sm btn-outline-dark ms-2" @click="loadCategories">Retry categories</button>
          </div>

          <div v-if="showCatalogOnCurrentRoute" v-show="filtersOpen" class="search-panel library-filters mb-4">
        <form class="library-filters-form" @submit.prevent="applyFilters()">
          <div class="row g-3">
            <div class="col-lg-5">
              <label class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_search_label" :default="'Search'" /></label>
              <div class="input-group library-input-group">
                <span class="input-group-text"><i class="bi bi-search text-muted"></i></span>
                <input
                  v-model="search"
                  type="search"
                  class="form-control"
                  :aria-label="settingText('library_search_label', 'Search')"
                  :placeholder="settingText('library_search_placeholder', 'Title, description, or keyword...')"
                  @input="onSearchInput"
                />
              </div>
            </div>

            <div class="col-lg-4 col-md-6">
              <label for="library-category-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_category_label" :default="'Category'" /></label>
              <select id="library-category-filter" v-model="selectedCategory" class="form-select">
                <option value="">{{ settingText('library_all_categories_label', 'All categories') }}</option>
                <option v-for="cat in editableCategories" :key="cat.id" :value="cat.slug">
                  {{ cat.parent_id ? '↳ ' : '' }}{{ cat.name }}
                  <template v-if="cat.resource_count"> ({{ cat.resource_count }})</template>
                </option>
              </select>
            </div>

            <div class="col-lg-3 col-md-6">
              <label for="library-file-type-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_file_type_label" :default="'File type'" /></label>
              <select id="library-file-type-filter" v-model="fileType" class="form-select">
                <option v-for="opt in fileTypeOptions" :key="opt.value || 'all'" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div v-if="gradeLevels.length" class="col-md-4 col-sm-6">
              <label for="library-grade-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_grade_label" :default="'Grade'" /></label>
              <select id="library-grade-filter" v-model="gradeLevel" class="form-select">
                <option value="">{{ settingText('library_all_grades_label', 'All grades') }}</option>
                <option v-for="g in gradeLevels" :key="g" :value="g">{{ gradeLevelLabel(g) }}</option>
              </select>
            </div>

            <div v-if="materialTypes.length" class="col-md-4 col-sm-6">
              <label for="library-material-type-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_resource_type_label" :default="'Resource type'" /></label>
              <select id="library-material-type-filter" v-model="materialType" class="form-select">
                <option value="">All types</option>
                <option v-for="mt in materialTypes" :key="mt.label" :value="mt.label">{{ mt.label }}</option>
              </select>
            </div>

            <div class="col-md-4 col-sm-6">
              <label for="library-sort-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_sort_label" :default="'Sort by'" /></label>
              <select id="library-sort-filter" v-model="sortBy" class="form-select">
                <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="col-md-4 col-sm-6">
              <label for="library-access-filter" class="form-label small fw-bold"><EditableSetting tag="span" setting-key="library_access_label" :default="'Access'" /></label>
              <select id="library-access-filter" v-model="accessFilter" class="form-select">
                <option v-for="opt in accessOptions" :key="opt.value || 'all'" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

          </div>

          <div class="library-quick-filters">
            <EditableSetting tag="span" class="library-quick-label" setting-key="library_quick_filters_label" :default="'Quick filters:'" />
            <button
              v-for="chip in quickTypeChips"
              :key="chip.value"
              type="button"
              class="library-chip"
              :class="{ active: fileType === chip.value }"
              @click="setQuickType(chip.value)"
            >
              <i :class="chip.icon"></i>
              {{ chip.label }}
            </button>
          </div>

          <div class="library-filter-actions">
            <button type="submit" class="btn-edu-pill btn-edu-pill-sm">
              <i class="bi bi-funnel me-1"></i>
              <EditableSetting tag="span" setting-key="library_filter_submit_label" :default="'Filter'" />
            </button>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="btn btn-link library-clear-btn"
              @click="clearFilters"
            >
              <EditableSetting tag="span" setting-key="library_clear_filters_label" :default="'Clear filters'" />
            </button>
          </div>
        </form>

        <div v-if="activeFilters.length" class="library-active-filters">
          <EditableSetting tag="span" class="small text-muted me-1" setting-key="library_active_filters_label" :default="'Active filters:'" />
          <button
            v-for="item in activeFilters"
            :key="item.key"
            type="button"
            class="library-active-tag"
            @click="removeFilter(item.key)"
          >
            {{ item.label }}
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>

          <div class="k5-main">
          <div v-if="showCatalogOnCurrentRoute" class="k5-page-head">
            <i v-if="showLibraryPageIcon" class="bi bi-journal-bookmark k5-page-head-icon" aria-hidden="true"></i>
            <div>
              <h1 class="k5-title mb-0" @click="currentCategory && selectContentFromCanvas($event, 'category', currentCategory)">
                <EditableSetting v-if="!currentCategory && !search.trim()" tag="span" setting-key="library_page_title" :default="'Resource Library'" />
                <EditableContentText v-else-if="currentCategory" entity="category" :item="currentCategory" field="name" tag="span" placeholder="Category name…" />
                <span v-else>{{ pageTitle }}</span>
              </h1>
              <p v-if="pageSubtitle && (!currentCategory || showCategorySubtitle)" class="k5-subtitle mb-0">
                <EditableSetting v-if="!currentCategory" tag="span" setting-key="library_page_subtitle" :default="'Find materials by subject, file type, and grade.'" />
                <EditableContentText
                  v-else-if="currentCategory.description || (builder.editMode && builder.canEdit)"
                  entity="category"
                  :item="currentCategory"
                  field="description"
                  tag="span"
                  placeholder="Category description…"
                />
                <EditableSetting v-else tag="span" setting-key="library_category_subtitle_fallback" :default="'Educational resources in this category and its subtopics.'" />
              </p>
            </div>
          </div>

          <SiteContentSlot v-if="showCatalogOnCurrentRoute" page-id="library" zone="before-catalog" label="Content before the catalog" />

          <div v-if="showCatalogOnCurrentRoute && loading" class="text-center py-5">
            <div class="spinner-border" style="color: var(--edu-teal)"></div>
          </div>

          <template v-else>
            <section v-if="childCategories.length && (browseMode || !showCatalogOnCurrentRoute)" class="k5-library-section k5-subtopics-section">
              <h2 v-if="showSubtopicsHeading" class="k5-section-title"><EditableSetting tag="span" setting-key="library_subtopics_title" :default="'Subtopics:'" /></h2>
              <div class="k5-subtopic-buttons">
                <RouterLink
                  v-for="child in childCategories"
                  :key="child.id"
                  :to="categoryPath(child.slug)"
                  class="k5-subtopic-btn"
                  @click="selectContentFromCanvas($event, 'category', child)"
                >
                  <EditableContentText entity="category" :item="child" field="name" tag="span" placeholder="Category name…" />
                </RouterLink>
              </div>
            </section>

            <template v-if="showCatalogOnCurrentRoute">
            <div v-if="catalogError && !displayResources.length" class="alert alert-warning library-catalog-error" role="alert">
              <span>{{ catalogError }}</span>
              <button type="button" class="btn btn-sm btn-outline-dark" @click="retryCatalog"><EditableSetting tag="span" setting-key="library_retry_label" :default="'Retry'" /></button>
            </div>

            <section v-if="displayResources.length" class="k5-library-section">
              <h2 v-if="showResultsHeading" class="k5-section-title">
                <EditableSetting tag="span" :setting-key="currentCategory || hasActiveFilters ? 'library_materials_found_title' : 'library_results_title'" :default="currentCategory || hasActiveFilters ? 'Materials found:' : 'All materials:'" />
                <span class="k5-section-count text-muted fw-normal">({{ pagination.total }})</span>
              </h2>
              <p class="k5-catalog-progress" aria-live="polite">
                {{ settingText('library_progress_label', 'Showing {shown} of {total} materials').replace('{shown}', displayResources.length).replace('{total}', pagination.total) }}
              </p>
              <div class="k5-catalog-grid">
                <article v-for="item in displayResources" :key="item.id" class="k5-catalog-card">
                  <RouterLink :to="`/resource/${item.slug}`" class="k5-catalog-thumb" :aria-label="item.title" @click="selectContentFromCanvas($event, 'material', item)">
                    <img v-if="item.cover_image && (!item.cover_hidden || (builder.editMode && builder.canEdit))" :src="mediaUrl(item.cover_image)" :alt="item.title" loading="lazy" />
                    <i v-else class="bi bi-file-earmark-text k5-catalog-thumb-icon" aria-hidden="true"></i>
                    <span
                      v-if="paymentsEnabled"
                      class="badge k5-catalog-badge"
                      :class="item.is_premium ? 'badge-access-paid' : 'badge-access-free'"
                    >
                      {{ item.is_premium ? 'Premium' : 'Free' }}
                    </span>
                  </RouterLink>
                  <div class="k5-catalog-body">
                    <RouterLink :to="`/resource/${item.slug}`" class="k5-catalog-title" @click="selectContentFromCanvas($event, 'material', item)"><EditableContentText entity="material" :item="item" field="title" tag="span" placeholder="Material title…" /></RouterLink>
                    <div class="k5-catalog-meta-list">
                      <EditableContentText v-if="item.material_type || (builder.editMode && builder.canEdit)" class="k5-catalog-meta" entity="material" :item="item" field="material_type" tag="span" placeholder="Material type…" />
                      <EditableContentText v-if="builder.editMode && builder.canEdit" class="k5-catalog-meta" entity="material" :item="item" field="grade_level" tag="span" placeholder="Grade level…" />
                      <span v-else-if="item.grade_level" class="k5-catalog-meta">{{ gradeLevelLabel(item.grade_level) }}</span>
                    </div>
                    <RouterLink
                      v-if="isPresentationItem(item)"
                      :to="{ name: 'presentation-play', params: { slug: item.slug, fileId: item.canva_url ? 'canva' : item.primary_file_id } }"
                      class="k5-catalog-action k5-catalog-present"
                      aria-label="View slides"
                    >
                      <i class="bi bi-play-fill"></i><EditableSetting tag="span" setting-key="library_view_slides_label" :default="'View slides'" />
                    </RouterLink>
                    <RouterLink
                      v-else-if="item.primary_file_id"
                      :to="{ name: 'download', params: { slug: item.slug, fileId: item.primary_file_id } }"
                      class="k5-catalog-action"
                      aria-label="Download material"
                    >
                      <i class="bi bi-download"></i><EditableSetting tag="span" setting-key="library_download_label" :default="'Download'" />
                    </RouterLink>
                    <RouterLink
                      v-else
                      :to="`/resource/${item.slug}`"
                      class="k5-catalog-action k5-catalog-details"
                      aria-label="View material details"
                    >
                      <i class="bi bi-arrow-right"></i><EditableSetting tag="span" setting-key="library_view_details_label" :default="'View details'" />
                    </RouterLink>
                  </div>
                </article>
              </div>

              <div v-if="catalogError" class="alert alert-warning library-catalog-error mt-3" role="alert">
                <span>{{ catalogError }}</span>
                <button type="button" class="btn btn-sm btn-outline-dark" @click="retryCatalog"><EditableSetting tag="span" setting-key="library_retry_label" :default="'Retry'" /></button>
              </div>

              <div v-if="hasMore && !catalogError" class="k5-catalog-load-more">
                <button type="button" class="btn-edu-pill" :disabled="loadingMore" @click="loadMore">
                  <span v-if="loadingMore" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                  <EditableSetting tag="span" :setting-key="loadingMore ? 'library_loading_label' : 'library_load_more_label'" :default="loadingMore ? 'Loading materials...' : 'Load more materials'" />
                </button>
              </div>
            </section>

            <div v-else-if="!catalogError && !(childCategories.length && browseMode)" class="k5-library-empty">
              <i class="bi bi-search opacity-25 fs-2 d-block mb-2"></i>
              <EditableSetting tag="p" class="mb-2" setting-key="library_empty_msg" :default="'No materials found.'" />
              <button v-if="hasActiveFilters" type="button" class="btn-edu-pill btn-edu-pill-sm" @click="clearFilters">
                <EditableSetting tag="span" setting-key="library_clear_filters_label" :default="'Clear filters'" />
              </button>
            </div>
            </template>

          </template>
        </div>
        <SiteContentSlot v-if="showCatalogOnCurrentRoute" page-id="library" zone="after-catalog" label="Content after the catalog" />
        </div>

        <div v-if="visibleMaterialTypes.length" class="k5-page-shell-types">
          <button
            v-for="mt in visibleMaterialTypes"
            :key="mt.label"
            type="button"
            class="k5-type-btn"
            :class="{ active: materialType === mt.label }"
            :style="{ '--mt-color': mt.color }"
            @click="toggleMaterialType(mt.label)"
          >
            <i :class="['bi', mt.icon]" aria-hidden="true"></i>
            <span>{{ mt.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
