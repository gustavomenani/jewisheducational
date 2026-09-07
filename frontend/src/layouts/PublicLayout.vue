<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { RouterLink, RouterView, useRouter, useRoute } from 'vue-router';
import { useAuthStore, useSettingsStore } from '@/stores';
import { useI18n } from '@/i18n';
import K5TopNavItem from '@/components/K5TopNavItem.vue';
import K5DrawerCategoryTree from '@/components/K5DrawerCategoryTree.vue';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { buildNavTree } from '@/utils/categoryTree';
import { gradeLevelLabel } from '@/utils/gradeLevels';
import EditorWorkspace from '@/builder/EditorWorkspace.vue';
import EditableSetting from '@/builder/EditableSetting.vue';
import EditableContentText from '@/builder/EditableContentText.vue';
import EditableImage from '@/builder/EditableImage.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { useBuilderStore } from '@/builder/store';

const auth = useAuthStore();
const settings = useSettingsStore();
const builder = useBuilderStore();
const { t } = useI18n();
const router = useRouter();
const route = useRoute();

// The builder slug tracks the current page so block layouts are per-page.
const routeSlug = computed(() => (route.name ? String(route.name) : 'home'));

function syncBuilderPage() {
  if (builder.editMode && builder.canEdit) {
    builder.switchPage(routeSlug.value);
  } else {
    builder.loadPage(routeSlug.value);
  }
}

// Open the visual editor automatically when an admin arrives with ?edit=1
// (used by the admin "Editor visual" screen to launch editing in place).
function maybeEnableEditor() {
  if (route.query.edit === '1' && auth.isAdmin) {
    builder.slug = routeSlug.value;
    builder.enable();
  }
}

const searchQuery = ref(route.query.q || '');
const searchOpen = ref(false);
const searchInputRef = ref(null);
const mobileNavToggleRef = ref(null);
const mobileDrawerRef = ref(null);
const categories = ref([]);
const mobileNavOpen = ref(false);
const compactHeader = ref(false);
const expandedDrawer = ref(new Set());
const userMenuOpen = ref(false);
const userMenuRef = ref(null);

const searchPlaceholder = computed(() =>
  siteSettings.value.search_placeholder || t('searchWorksheets')
);

const userFirstName = computed(() => {
  const name = auth.user?.name?.trim();
  if (!name) return '';
  if (name === 'Administrador') return 'Administrator';
  return name.split(/\s+/)[0];
});

// Pending settings are editor-only. Keeping them out of the visitor layout
// prevents an unpublished draft from leaking after the admin closes the editor.
const siteSettings = computed(() => ({
  ...settings.settings,
  ...(builder.editMode && builder.canEdit ? builder.pendingSettings : {}),
}));
const siteName = computed(() => siteSettings.value.site_name || 'Jewish Educational Resources');
const footerTagline = computed(() => {
  const custom = siteSettings.value.footer_tagline;
  if (custom) return custom;
  return siteSettings.value.site_description || 'Digital and printable Jewish educational materials for schools, families, and communities.';
});
const footerCopyright = computed(() => siteSettings.value.footer_copyright || '');
function normalizeConfiguredUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

const footerNewsUrl = computed(() => normalizeConfiguredUrl(siteSettings.value.footer_news_url));
const footerTermsUrl = computed(() => normalizeConfiguredUrl(siteSettings.value.footer_terms_url));
const footerPrivacyUrl = computed(() => normalizeConfiguredUrl(siteSettings.value.footer_privacy_url));
const showFooter = computed(() => {
  const value = siteSettings.value.footer_show;
  return value !== false && String(value ?? 'false').toLowerCase() !== 'false';
});
const shortName = computed(() => {
  const name = siteName.value;
  return name.length > 22 ? 'JER' : name;
});

const seriesOpen = ref(false);
const gradesMenuRef = ref(null);
const gradesButtonRef = ref(null);
const gradeLevels = computed(() => {
  const raw = siteSettings.value.grade_levels;
  if (Array.isArray(raw)) return raw.map((level) => String(level).trim()).filter(Boolean);
  if (raw === undefined || raw === null || String(raw).trim() === '') return [];
  return String(raw)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
});

function toggleGradesMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  if (!gradeLevels.value.length) return;
  seriesOpen.value = !seriesOpen.value;
}

function closeGradesMenu(restoreFocus = false) {
  seriesOpen.value = false;
  if (restoreFocus) nextTick(() => gradesButtonRef.value?.focus());
}

function onGradesKeydown(event) {
  if (event.key === 'Escape') {
    closeGradesMenu(true);
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    seriesOpen.value = true;
    nextTick(() => gradesMenuRef.value?.querySelector('a')?.focus());
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleGradesMenu();
  }
}

const navTree = computed(() => {
  const hideEmpty = siteSettings.value.nav_hide_empty !== 'false';
  const maxTop = Number(siteSettings.value.nav_max_top_level) || 0;
  // Mostra todos os assuntos de 1º nível na barra (mesmo vazios), estilo
  // K5Learning; sub-assuntos vazios continuam ocultos dos dropdowns.
  const draftCategories = builder.contentDraft?.categories;
  const source = builder.editMode && builder.canEdit && Array.isArray(draftCategories) && draftCategories.length
    ? draftCategories.filter((category) => !category.is_archived)
    : categories.value;
  return buildNavTree(source, { hideEmpty, maxTopLevel: maxTop, keepTopLevel: true });
});

const siteTagline = computed(() => {
  const val = siteSettings.value.site_tagline;
  if (!val || val === 'Jewish materials for early education and schools') {
    return 'Jewish materials for early childhood education and schools';
  }
  return val;
});

const logoShort = computed(() => {
  const name = siteName.value;
  const parts = name.split(' ');
  if (parts.length >= 2) return { mark: parts[0], rest: parts.slice(1).join(' ') };
  return { mark: name.slice(0, 3), rest: name.slice(3) || 'Resources' };
});

const navMenus = computed(() => {
  const list = [
    {
      label: 'Subjects',
      settingKey: 'nav_subjects_label',
      icon: 'bi bi-journal-bookmark',
      items: navTree.value.map((c) => ({
        label: c.name,
        desc: c.resource_count ? `${c.resource_count} materials` : undefined,
        icon: 'bi bi-folder2',
        to: `/library/category/${c.slug}`,
      })),
    }
  ];

  if (gradeLevels.value.length) {
    list.push({
      label: siteSettings.value.nav_series_label || 'Grades',
      icon: 'bi bi-mortarboard',
      items: gradeLevels.value.map((g) => ({
        label: gradeLevelLabel(g),
        icon: 'bi bi-book',
        to: `/library?grade=${encodeURIComponent(g)}`,
      })),
    });
  }

  list.push(
    {
      label: 'Types',
      settingKey: 'nav_types_label',
      icon: 'bi bi-collection',
      items: [
        { label: 'PDFs', desc: 'Reading and download', icon: 'bi bi-file-pdf', to: '/library?q=pdf' },
        { label: 'Presentations', desc: 'PPT and PPTX', icon: 'bi bi-easel', to: '/library?q=presentation' },
        { label: 'Worksheets', desc: 'Printable activities', icon: 'bi bi-file-earmark-text', to: '/library?q=worksheet' },
        { label: 'Lesson Plans', desc: 'Structured materials', icon: 'bi bi-journal-check', to: '/library?q=lesson-plan' },
      ],
    },
    {
      label: 'More resources',
      settingKey: 'nav_more_label',
      icon: 'bi bi-three-dots',
      items: [
        { label: 'Sign up free', icon: 'bi bi-person-plus', to: '/sign-up' },
        { label: 'Log in', icon: 'bi bi-box-arrow-in-right', to: '/login' },
      ],
    },
    {
      label: 'Featured',
      settingKey: 'nav_featured_label',
      icon: 'bi bi-star-fill',
      iconClass: 'edu-nav-icon-star',
      to: '/',
      items: [],
    }
  );

  return list;
});

async function onSearch() {
  const query = String(searchQuery.value || '').trim();
  searchQuery.value = query;
  mobileNavOpen.value = false;
  searchOpen.value = false;
  await router.push({ path: '/library', query: query ? { q: query } : {} });
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (searchOpen.value) {
    nextTick(() => searchInputRef.value?.focus());
  }
}

function clearSearch() {
  searchQuery.value = '';
}

function toggleMobileNav() {
  if (mobileNavOpen.value) {
    closeMobileNav();
    return;
  }
  mobileNavOpen.value = true;
  nextTick(() => mobileDrawerRef.value?.querySelector('button, a, input')?.focus());
}

function closeMobileNav(restoreFocus = true) {
  const wasOpen = mobileNavOpen.value;
  mobileNavOpen.value = false;
  expandedDrawer.value = new Set();
  if (wasOpen && restoreFocus) nextTick(() => mobileNavToggleRef.value?.focus());
}

function toggleDrawerGroup(label) {
  const next = new Set(expandedDrawer.value);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  expandedDrawer.value = next;
}

function isDrawerGroupOpen(label) {
  return expandedDrawer.value.has(label);
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    closeMobileNav();
    searchOpen.value = false;
    userMenuOpen.value = false;
    return;
  }
  if (mobileNavOpen.value && e.key === 'Tab') {
    const focusable = Array.from(
      mobileDrawerRef.value?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value;
}

function closeUserMenu() {
  userMenuOpen.value = false;
}

function onDocumentClick(e) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target)) {
    userMenuOpen.value = false;
  }
  if (gradesMenuRef.value && !gradesMenuRef.value.contains(e.target)) {
    seriesOpen.value = false;
  }
}

function logout() {
  closeUserMenu();
  auth.logout();
  router.push('/');
}

watch(mobileNavOpen, (open) => {
  document.body.classList.toggle('edu-mobile-nav-open', open);
});

function updateCompactHeader() {
  compactHeader.value = window.matchMedia('(max-width: 991px)').matches;
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick);
  updateCompactHeader();
  window.addEventListener('resize', updateCompactHeader);
  syncBuilderPage();
  maybeEnableEditor();
  try {
    const { data } = await api.get('/categories');
    categories.value = data.categories;
  } catch {
    /* backend offline */
  }
});

// Keep the builder page in sync with navigation; re-resolve when settings arrive.
watch(() => route.fullPath, syncBuilderPage);
watch(() => settings.settings, () => {
  if (!builder.editMode || !builder.canEdit) builder.loadPage(routeSlug.value);
});
watch(() => route.query.edit, maybeEnableEditor);

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', updateCompactHeader);
  document.body.classList.remove('edu-mobile-nav-open');
});
</script>

<template>
  <div class="editor-preview-stage">
    <div v-if="!settings.ready" class="k5-site-loading" role="status" aria-live="polite">
      <img src="/logo-mark.svg?v=3" alt="" width="52" height="52" />
      <span v-if="settings.loading" class="k5-site-loading-spinner" aria-hidden="true"></span>
      <span v-if="settings.loading" class="visually-hidden">Loading site</span>
      <template v-else-if="settings.loadError">
        <p class="mb-2">The site could not finish loading.</p>
        <button type="button" class="btn btn-primary" @click="settings.load">Try again</button>
      </template>
    </div>
    <div v-else class="d-flex flex-column min-vh-100 k5-site editor-preview-canvas">
    <header class="edu-header">
      <div class="container">
        <div class="k5-header-top">
          <div class="k5-brand">
            <RouterLink class="k5-logo" to="/" @click="closeMobileNav">
              <EditableImage
                v-if="siteSettings.site_logo"
                setting-key="site_logo"
                alt-setting-key="site_logo_alt"
                default-alt="Jewish Educational Resources"
                :default="siteSettings.site_logo"
                img-class="k5-custom-logo"
                loading="eager"
              />
              <template v-else-if="!(builder.editMode && builder.canEdit)">
                <img src="/logo-mark.svg?v=3" alt="" width="36" height="36" />
                <span class="k5-logo-mark">{{ logoShort.mark }}</span>
                <span class="k5-logo-name">{{ logoShort.rest }}</span>
              </template>
              <template v-else>
                <EditableImage
                  setting-key="site_logo"
                  alt-setting-key="site_logo_alt"
                  default="/logo-mark.svg?v=3"
                  default-alt=""
                  img-class="k5-default-logo"
                  loading="eager"
                />
                <EditableSetting
                  tag="span"
                  class="k5-logo-name"
                  setting-key="site_name"
                  :default="siteName"
                  label="Site name"
                />
              </template>
            </RouterLink>
            <EditableSetting
              tag="span"
              class="k5-tagline d-none d-md-inline"
              setting-key="site_tagline"
              :default="siteTagline"
              label="Site tagline"
            />
          </div>

          <div class="k5-header-actions">
            <div class="k5-auth d-none d-sm-flex">
              <template v-if="auth.isLoggedIn">
                <div ref="userMenuRef" class="k5-user-menu">
                  <button
                    type="button"
                    class="k5-user-chip"
                    :class="{ 'is-open': userMenuOpen }"
                    :aria-expanded="userMenuOpen"
                    aria-haspopup="true"
                    @click.stop="toggleUserMenu"
                  >
                    <i class="bi bi-person-circle"></i>
                    <span>{{ userFirstName || t('myAccountLink') }}</span>
                    <i class="bi bi-chevron-down k5-user-chevron"></i>
                  </button>
                  <div v-show="userMenuOpen" class="k5-user-dropdown" role="menu">
                    <RouterLink
                      to="/my-account"
                      class="k5-user-dropdown-item"
                      role="menuitem"
                      :class="{ active: route.name === 'account' || route.name === 'profile' }"
                      @click="closeUserMenu"
                    >
                      {{ t('myAccount') }}
                    </RouterLink>
                    <RouterLink
                      to="/my-list"
                      class="k5-user-dropdown-item"
                      role="menuitem"
                      :class="{ active: route.name === 'favorites' }"
                      @click="closeUserMenu"
                    >
                      {{ t('myBookmarks') }}
                    </RouterLink>
                    <RouterLink v-if="auth.isAdmin" to="/admin" class="k5-user-dropdown-item" role="menuitem" @click="closeUserMenu">
                      <EditableSetting tag="span" setting-key="nav_user_panel" :default="'Dashboard'" />
                    </RouterLink>
                    <button type="button" class="k5-user-dropdown-item k5-user-dropdown-logout" role="menuitem" @click="logout">
                      {{ t('logout') }}
                    </button>
                  </div>
                </div>
              </template>
              <template v-else>
                <RouterLink class="k5-btn-signup" to="/sign-up"><EditableSetting tag="span" setting-key="nav_signup_label" :default="'Sign up'" /></RouterLink>
                <RouterLink class="k5-btn-login" to="/login"><EditableSetting tag="span" setting-key="nav_login_label" :default="'Log in'" /></RouterLink>
              </template>
            </div>

            <button
              type="button"
              class="k5-search-toggle d-lg-none"
              :class="{ 'is-active': searchOpen }"
              aria-label="Open search"
              :aria-expanded="searchOpen"
              aria-controls="site-search-form"
              @click="toggleSearch"
            >
              <i class="bi bi-search"></i>
            </button>

            <form
              id="site-search-form"
              class="k5-search-form"
              :class="{ 'is-open': searchOpen }"
              @submit.prevent="onSearch"
            >
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="search"
                class="k5-search-input"
                aria-label="Search the library"
                :placeholder="searchPlaceholder"
              />
              <button type="submit" class="k5-search-submit" aria-label="Search">
                <i class="bi bi-search"></i>
              </button>
            </form>

            <button
              type="button"
              class="edu-mobile-nav-toggle d-lg-none"
              ref="mobileNavToggleRef"
              aria-label="Menu"
              :aria-expanded="mobileNavOpen"
              aria-controls="mobile-navigation-drawer"
              @click="toggleMobileNav"
            >
              <i :class="mobileNavOpen ? 'bi bi-x-lg' : 'bi bi-list'"></i>
            </button>
          </div>
        </div>

        <nav class="k5-nav-bar d-none d-lg-flex">
          <div
            v-if="gradeLevels.length"
            ref="gradesMenuRef"
            class="k5-top-nav-item"
            :class="{ 'is-open': seriesOpen }"
          >
            <button
              type="button"
              class="k5-nav-link"
              id="grades-menu-trigger"
              ref="gradesButtonRef"
              style="cursor: pointer; border: 0; background: transparent;"
              :aria-expanded="seriesOpen"
              aria-controls="grades-menu"
              @click.stop="toggleGradesMenu"
              @keydown="onGradesKeydown"
            >
              <EditableSetting tag="span" setting-key="nav_series_label" :default="'Grades'" /> <i class="bi bi-chevron-down ms-1" style="font-size: 0.75rem;"></i>
            </button>
            <div
              id="grades-menu"
              v-show="seriesOpen"
              class="k5-top-nav-dropdown"
              role="menu"
              aria-labelledby="grades-menu-trigger"
              @click.stop
              @keydown.esc.prevent="closeGradesMenu(true)"
            >
              <RouterLink
                v-for="g in gradeLevels"
                :key="g"
                :to="`/library?grade=${encodeURIComponent(g)}`"
                class="k5-top-nav-dropdown-item"
                role="menuitem"
                @click="seriesOpen = false"
                @keydown.esc.prevent="closeGradesMenu(true)"
              >
                <span>{{ gradeLevelLabel(g) }}</span>
              </RouterLink>
            </div>
          </div>
          <span v-if="gradeLevels.length" class="k5-nav-sep" aria-hidden="true">|</span>

          <template v-for="node in navTree" :key="node.id">
            <K5TopNavItem
              v-if="node.children?.length"
              :node="node"
              :active-slug="route.params.slug?.toString() || ''"
            />
            <RouterLink
              v-else
              :to="`/library/category/${node.slug}`"
              class="k5-nav-link"
            >
              <EditableContentText entity="category" :item="node" field="name" tag="span" placeholder="Category name…" />
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <SiteContentSlot page-id="global" zone="after-header" label="Header content" />

    <!-- Drawer mobile — overlay, não empurra o conteúdo -->
    <Teleport to="body">
      <Transition name="edu-drawer-fade">
        <div
          v-if="mobileNavOpen"
          class="edu-drawer-backdrop d-lg-none"
          aria-hidden="true"
          @click="closeMobileNav"
        />
      </Transition>
      <Transition name="edu-drawer-slide">
        <div
          v-if="mobileNavOpen"
          ref="mobileDrawerRef"
          id="mobile-navigation-drawer"
          class="edu-drawer d-lg-none"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div class="edu-drawer-header">
            <RouterLink class="edu-logo edu-drawer-logo" to="/" @click="closeMobileNav">
              <EditableImage
                v-if="siteSettings.site_logo"
                setting-key="site_logo"
                alt-setting-key="site_logo_alt"
                default-alt="Jewish Educational Resources"
                :default="siteSettings.site_logo"
                img-class="edu-logo-icon"
                loading="eager"
              />
              <img v-else src="/logo-mark.svg?v=3" alt="" class="edu-logo-icon" width="36" height="36" />
              <span>{{ shortName }}</span>
            </RouterLink>
            <div class="edu-drawer-auth">
              <template v-if="auth.isLoggedIn">
                <RouterLink class="edu-auth-link" to="/my-account" @click="closeMobileNav">{{ t('myAccount') }}</RouterLink>
                <RouterLink class="edu-auth-link" to="/my-list" @click="closeMobileNav">{{ t('myBookmarks') }}</RouterLink>
              </template>
              <template v-else>
                <RouterLink class="edu-auth-link" to="/login" @click="closeMobileNav"><EditableSetting tag="span" setting-key="drawer_login_label" :default="'Log in'" /></RouterLink>
                <RouterLink class="btn-edu-signup btn-edu-signup-sm" to="/sign-up" @click="closeMobileNav"><EditableSetting tag="span" setting-key="drawer_signup_label" :default="'Sign up'" /></RouterLink>
              </template>
            </div>
            <button type="button" class="edu-drawer-close" aria-label="Close menu" @click="closeMobileNav">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <nav class="edu-drawer-nav">
            <div class="edu-drawer-group open">
              <button type="button" class="edu-drawer-item edu-drawer-item-heading" aria-expanded="true">
                <span class="edu-drawer-item-label"><i class="bi bi-journal-bookmark"></i> <EditableSetting tag="span" setting-key="drawer_subjects_title" :default="'Subjects'" /></span>
              </button>
              <div class="edu-drawer-sublist">
                <K5DrawerCategoryTree v-if="navTree.length" :nodes="navTree" @navigate="closeMobileNav" />
                <RouterLink v-else to="/library" class="edu-drawer-sublink" @click="closeMobileNav"><EditableSetting tag="span" setting-key="drawer_library_fallback" :default="'Library'" /></RouterLink>
              </div>
            </div>

            <template v-for="menu in navMenus.slice(1)" :key="'m-' + menu.label">
              <RouterLink
                v-if="menu.to && !menu.items.length"
                :to="menu.to"
                class="edu-drawer-item"
                @click="closeMobileNav"
              >
                <span class="edu-drawer-item-label">
                  <i v-if="menu.icon" :class="[menu.icon, menu.iconClass]"></i>
                  <EditableSetting v-if="menu.settingKey" tag="span" :setting-key="menu.settingKey" :default="menu.label" />
                  <span v-else>{{ menu.label }}</span>
                </span>
                <i class="bi bi-chevron-right edu-drawer-chevron"></i>
              </RouterLink>
              <div v-else class="edu-drawer-group" :class="{ open: isDrawerGroupOpen(menu.label) }">
                <button
                  type="button"
                  class="edu-drawer-item edu-drawer-item-heading"
                  :aria-expanded="isDrawerGroupOpen(menu.label)"
                  @click="toggleDrawerGroup(menu.label)"
                >
                  <span class="edu-drawer-item-label">
                    <i v-if="menu.icon" :class="[menu.icon, menu.iconClass]"></i>
                    <EditableSetting v-if="menu.settingKey" tag="span" :setting-key="menu.settingKey" :default="menu.label" />
                    <span v-else>{{ menu.label }}</span>
                  </span>
                  <i class="bi bi-chevron-down edu-drawer-chevron"></i>
                </button>
                <div v-show="isDrawerGroupOpen(menu.label)" class="edu-drawer-sublist">
                  <RouterLink
                    v-for="item in menu.items"
                    :key="item.label"
                    :to="item.to"
                    class="edu-drawer-sublink"
                    @click="closeMobileNav"
                  >
                    <i v-if="item.icon" :class="item.icon"></i>
                    {{ item.label }}
                  </RouterLink>
                </div>
              </div>
            </template>
          </nav>
        </div>
      </Transition>
    </Teleport>

    <main class="flex-grow-1">
      <RouterView />
    </main>

    <SiteContentSlot page-id="global" zone="before-footer" label="Footer content" />

    <footer v-if="showFooter || (builder.editMode && builder.canEdit)" class="k5-footer border-top">
      <div class="container k5-footer-inner py-5">
        <div class="k5-footer-grid">
          <RouterLink to="/" class="k5-footer-logo" aria-label="Jewish Educational Resources">
            <EditableImage
              v-if="siteSettings.site_logo"
              setting-key="site_logo"
              alt-setting-key="site_logo_alt"
              default-alt="Jewish Educational Resources"
              :default="siteSettings.site_logo"
              img-class="k5-footer-custom-logo"
            />
            <img v-else src="/logo-mark.svg?v=3" alt="" width="48" height="48" />
          </RouterLink>

          <div class="k5-footer-col k5-footer-col-wide">
            <EditableSetting tag="h2" setting-key="footer_subjects_title" :default="'Subjects'" />
            <div class="k5-footer-split">
              <ul>
                <li v-for="cat in navTree.slice(0, 4)" :key="cat.id">
                  <RouterLink :to="`/library/category/${cat.slug}`"><EditableContentText entity="category" :item="cat" field="name" tag="span" placeholder="Category name…" /></RouterLink>
                </li>
              </ul>
              <ul>
                <li v-for="cat in navTree.slice(4, 8)" :key="'b-' + cat.id">
                  <RouterLink :to="`/library/category/${cat.slug}`"><EditableContentText entity="category" :item="cat" field="name" tag="span" placeholder="Category name…" /></RouterLink>
                </li>
                <li v-if="!navTree.length"><RouterLink to="/library"><EditableSetting tag="span" setting-key="footer_subjects_fallback" :default="'Library'" /></RouterLink></li>
              </ul>
            </div>
          </div>

          <div class="k5-footer-col">
            <EditableSetting tag="h2" setting-key="footer_resources_title" :default="'Resources'" />
            <ul>
              <li><RouterLink to="/library"><EditableSetting tag="span" setting-key="footer_link_library" :default="'Library'" /></RouterLink></li>
              <li><RouterLink to="/sign-up"><EditableSetting tag="span" setting-key="footer_link_free_signup" :default="'Free Signup'" /></RouterLink></li>
              <li v-if="(builder.editMode && builder.canEdit) || footerNewsUrl">
                <a v-if="isExternalUrl(footerNewsUrl)" :href="footerNewsUrl" target="_blank" rel="noopener">
                  <EditableSetting tag="span" setting-key="footer_link_news" :default="'Updates'" link-key="footer_news_url" />
                </a>
                <RouterLink v-else-if="footerNewsUrl" :to="footerNewsUrl">
                  <EditableSetting tag="span" setting-key="footer_link_news" :default="'Updates'" link-key="footer_news_url" />
                </RouterLink>
                <span v-else>
                  <EditableSetting tag="span" setting-key="footer_link_news" :default="'Updates'" link-key="footer_news_url" />
                </span>
              </li>
            </ul>
          </div>

          <div class="k5-footer-col">
            <EditableSetting tag="h2" setting-key="footer_about_title" :default="'About'" />
            <ul>
              <li><RouterLink to="/sign-up"><EditableSetting tag="span" setting-key="footer_link_membership" :default="'Membership'" /></RouterLink></li>
              <li><RouterLink to="/login"><EditableSetting tag="span" setting-key="footer_link_login" :default="'Log in'" /></RouterLink></li>
              <li><RouterLink to="/my-account"><EditableSetting tag="span" setting-key="footer_link_account" :default="'My account'" /></RouterLink></li>
            </ul>
          </div>

          <div class="k5-footer-col">
            <EditableSetting tag="h2" setting-key="footer_other_title" :default="'Other'" />
            <ul>
              <li v-if="(builder.editMode && builder.canEdit) || footerTermsUrl">
                <a v-if="isExternalUrl(footerTermsUrl)" :href="footerTermsUrl" target="_blank" rel="noopener">
                  <EditableSetting tag="span" setting-key="footer_link_terms" :default="'Terms of Use'" link-key="footer_terms_url" />
                </a>
                <RouterLink v-else-if="footerTermsUrl" :to="footerTermsUrl">
                  <EditableSetting tag="span" setting-key="footer_link_terms" :default="'Terms of Use'" link-key="footer_terms_url" />
                </RouterLink>
                <span v-else>
                  <EditableSetting tag="span" setting-key="footer_link_terms" :default="'Terms of Use'" link-key="footer_terms_url" />
                </span>
              </li>
              <li v-if="(builder.editMode && builder.canEdit) || footerPrivacyUrl">
                <a v-if="isExternalUrl(footerPrivacyUrl)" :href="footerPrivacyUrl" target="_blank" rel="noopener">
                  <EditableSetting tag="span" setting-key="footer_link_privacy" :default="'Privacy Policy'" link-key="footer_privacy_url" />
                </a>
                <RouterLink v-else-if="footerPrivacyUrl" :to="footerPrivacyUrl">
                  <EditableSetting tag="span" setting-key="footer_link_privacy" :default="'Privacy Policy'" link-key="footer_privacy_url" />
                </RouterLink>
                <span v-else>
                  <EditableSetting tag="span" setting-key="footer_link_privacy" :default="'Privacy Policy'" link-key="footer_privacy_url" />
                </span>
              </li>
            </ul>
          </div>

          <div class="k5-footer-col">
            <EditableSetting tag="h2" setting-key="footer_social_title" :default="'Follow Us'" />
            <div class="k5-footer-social">
              <a v-if="siteSettings.social_facebook" :href="siteSettings.social_facebook" target="_blank" rel="noopener" aria-label="Facebook"><i class="bi bi-facebook"></i></a>
              <a v-if="siteSettings.social_pinterest" :href="siteSettings.social_pinterest" target="_blank" rel="noopener" aria-label="Pinterest"><i class="bi bi-pinterest"></i></a>
              <a v-if="siteSettings.social_instagram" :href="siteSettings.social_instagram" target="_blank" rel="noopener" aria-label="Instagram"><i class="bi bi-instagram"></i></a>
              <a v-if="siteSettings.social_youtube" :href="siteSettings.social_youtube" target="_blank" rel="noopener" aria-label="YouTube"><i class="bi bi-youtube"></i></a>
            </div>
          </div>
        </div>

        <div class="k5-footer-copy">
          <small>Copyright &copy; {{ new Date().getFullYear() }} {{ siteName }}{{ footerCopyright ? `. ${footerCopyright}` : '' }}</small>
        </div>
      </div>
    </footer>

    </div>

    <template v-if="settings.ready"><EditorWorkspace /></template>
  </div>
</template>
