<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import api from '@/api';
import { mediaUrl } from '@/utils/media';
import { useSettingsStore } from '@/stores';
import { useBuilderStore } from '@/builder/store';
import EditableSetting from '@/builder/EditableSetting.vue';
import EditableContentText from '@/builder/EditableContentText.vue';
import EditableImage from '@/builder/EditableImage.vue';
import BlockRenderer from '@/builder/BlockRenderer.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { fieldByKey } from '@/builder/fieldCatalog';
import {
  APPEARANCE_DEFAULTS,
  settingText,
  isLandingBlockEnabled,
  blockSizeStyle,
} from '@/utils/theme';
import { DEFAULT_QUICK_TOPICS, normalizeQuickTopics, categoryVisibleInDraft as categoryVisibleInDraftImported } from '@/builder/contentModel';
import { visibleCategoriesForVisitors } from '@/utils/categoryTree';
import {
  DEFAULT_SITE_DESCRIPTION,
  DEFAULT_SITE_NAME,
  buildOrganizationSchema,
  buildWebSiteSchema,
  setSeo,
} from '@/utils/seo';

const settings = useSettingsStore();
const builder = useBuilderStore();
const categories = ref([]);
const resources = ref([]);

const s = computed(() => ({
  ...settings.settings,
  ...(builder.editMode && builder.canEdit ? builder.pendingSettings : {}),
}));
const DEFAULT_HOME_SECTION_ORDER = [
  'hero',
  'cards',
  'topics',
  'featured',
  'recent',
  'benefits',
  'prefooter',
  'contact',
];
const homeSectionOrder = computed(() => {
  try {
    const parsed = JSON.parse(s.value.home_sections_order || '[]');
    if (!Array.isArray(parsed)) return DEFAULT_HOME_SECTION_ORDER;
    const order = parsed.filter((id) => DEFAULT_HOME_SECTION_ORDER.includes(id));
    DEFAULT_HOME_SECTION_ORDER.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  } catch {
    return DEFAULT_HOME_SECTION_ORDER;
  }
});
const sectionOrderStyle = (id, extra = {}) => ({
  order: Math.max(0, homeSectionOrder.value.indexOf(id)),
  ...extra,
});
const settingVisible = (key, fallback = true) => {
  const value = s.value[key];
  return value === undefined || value === '' ? fallback : value !== 'false' && value !== false;
};
const showHero = computed(() => settingVisible('home_hero_show', isLandingBlockEnabled(s.value, 'hero')));
const showHeroPrimary = computed(() => settingVisible('home_hero_cta_primary_show'));
const showHeroSecondary = computed(() => settingVisible('home_hero_cta_secondary_show'));
const showCards = computed(() => settingVisible('home_cards_show', isLandingBlockEnabled(s.value, 'library')));
const showTopics = computed(() => settingVisible('home_topics_show'));
const showFeatured = computed(() => settingVisible('home_featured_show'));
const showRecent = computed(() => settingVisible('home_recent_show', isLandingBlockEnabled(s.value, 'recent')));
const showBenefits = computed(() => settingVisible('home_benefits_show'));
const showPrefooter = computed(() => settingVisible('home_prefooter_show'));
const showContact = computed(() => settingVisible(
  'home_contact_show',
  settingVisible('block_contact_show', isLandingBlockEnabled(s.value, 'contact')),
));
const showCustomContent = computed(() => {
  const published = builder.publishedLayout('home');
  return Boolean(published?.sections?.length || (builder.editMode && builder.canEdit && builder.useCanvas));
});

const contactTitle = computed(() =>
  settingText(s.value, 'section_contact_title', APPEARANCE_DEFAULTS.section_contact_title)
);
const contactLead = computed(() =>
  settingText(s.value, 'section_contact_lead', APPEARANCE_DEFAULTS.section_contact_lead)
);
const contactStyle = computed(() => {
  const style = { backgroundColor: settingText(s.value, 'section_contact_bg_color', APPEARANCE_DEFAULTS.section_contact_bg_color) };
  const image = settingText(s.value, 'section_contact_background', APPEARANCE_DEFAULTS.section_contact_background);
  if (image) {
    style.backgroundImage = `linear-gradient(rgba(243,248,251,0.9), rgba(243,248,251,0.9)), url(${mediaUrl(image)})`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }
  return style;
});

function selectContactBackground(kind = 'image', event) {
  if (!builder.editMode || !builder.canEdit) return;
  event?.preventDefault();
  event?.stopPropagation();
  const key = kind === 'color' ? 'section_contact_bg_color' : 'section_contact_background';
  builder.selectSetting(fieldByKey(key) || { key });
}

const contactForm = ref({ name: '', email: '', message: '' });
const contactSending = ref(false);
const contactFeedback = ref('');
const contactError = ref('');

async function submitContact() {
  contactSending.value = true;
  contactFeedback.value = '';
  contactError.value = '';
  try {
    const { data } = await api.post('/contact', contactForm.value);
    contactFeedback.value = data.message;
    contactForm.value = { name: '', email: '', message: '' };
    if (data.redirect_url) {
      const delay = Math.min(10, Math.max(0, Number(data.redirect_delay) || 0));
      window.setTimeout(() => window.location.assign(data.redirect_url), delay * 1000);
    }
  } catch (e) {
    contactError.value = e.response?.data?.error || 'Could not send your message. Please try again.';
  } finally {
    contactSending.value = false;
  }
}

const heroTitle = computed(() => {
  const val = settingText(s.value, 'hero_title', APPEARANCE_DEFAULTS.hero_title);
  if (!val || val === 'ONDE O APRENDIZADO FLORESCE') return 'WHERE LEARNING FLOURISHES';
  return val;
});
function isExternalUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function navigationTarget(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return isExternalUrl(raw) ? raw : fallback;
}

const heroLead = computed(() => {
  const val = settingText(s.value, 'hero_lead', APPEARANCE_DEFAULTS.hero_lead);
  if (!val || val === 'Hebrew, Torah, holidays, and more for Jewish early education and schools.') {
    return 'Hebrew, Torah, holidays and more for early childhood Jewish education and schools.';
  }
  return val;
});
const heroPrimaryLink = computed(() =>
  navigationTarget(settingText(s.value, 'home_hero_cta_primary_link', '/library'), '/library')
);
const heroSecondaryLink = computed(() =>
  navigationTarget(settingText(s.value, 'home_hero_cta_secondary_link', '/sign-up'), '/sign-up')
);
const heroContentAlign = computed(() => {
  const value = String(
    s.value.hero_content_align || APPEARANCE_DEFAULTS.hero_content_align || 'left'
  ).trim().toLowerCase();
  return ['left', 'center', 'right'].includes(value) ? value : 'left';
});
const heroCopyStyle = computed(() => ({ textAlign: heroContentAlign.value }));
const heroActionsStyle = computed(() => ({
  justifyContent: heroContentAlign.value === 'right'
    ? 'flex-end'
    : heroContentAlign.value === 'center'
      ? 'center'
      : 'flex-start',
}));
const guideLink = computed(() =>
  navigationTarget(settingText(s.value, 'home_ebook_url', '/library'), '/library')
);
const heroBgImage = computed(() => settingText(s.value, 'hero_bg_image'));
function updateHomeSeo() {
  const siteName = settingText(s.value, 'site_name', DEFAULT_SITE_NAME) || DEFAULT_SITE_NAME;
  const description = settingText(s.value, 'site_description', DEFAULT_SITE_DESCRIPTION) || heroLead.value || DEFAULT_SITE_DESCRIPTION;
  setSeo({
    title: siteName,
    siteName,
    description,
    canonical: '/',
    image: heroBgImage.value || undefined,
    type: 'website',
    jsonLd: [buildWebSiteSchema(siteName, description), buildOrganizationSchema(siteName, description)],
  });
}

watch(
  () => [s.value.site_name, s.value.site_description, heroLead.value, heroBgImage.value],
  updateHomeSeo,
  { immediate: true }
);

const HERO_WORKSHEET = '/images/hero/hero-worksheet.png';
const HERO_MASCOT = '/images/hero/mascot-bear.png';

const editableResources = computed(() => {
  const draft = builder.contentDraft?.materials;
  if (!builder.editMode || !builder.canEdit || !Array.isArray(draft)) return resources.value;
  const byId = new Map(draft.map((item) => [String(item.id), item]));
  const merged = resources.value
    .map((item) => ({ ...item, ...(byId.get(String(item.id)) || {}) }))
    .filter((item) => !item.is_archived && (!item.category_id || isCategoryVisibleInEditor(item.category_id)));
  const serverIds = new Set(resources.value.map((item) => String(item.id)));
  const additions = draft
    .filter((item) => !serverIds.has(String(item.id)) && !item.is_archived && (!item.category_id || isCategoryVisibleInEditor(item.category_id)))
    .map((item) => ({ ...item, category_name: builder.contentDraft.categories.find((category) => String(category.id) === String(item.category_id))?.name || '' }));
  return [...merged, ...additions];
});

function isCategoryVisibleInEditor(categoryOrId) {
  const category = typeof categoryOrId === 'object'
    ? categoryOrId
    : builder.contentDraft.categories.find((item) => String(item.id) === String(categoryOrId));
  return categoryVisibleInDraftImported(category, builder.contentDraft.categories);
}

const cardCovers = computed(() =>
  editableResources.value.filter((r) => r.cover_image && (!r.cover_hidden || (builder.editMode && builder.canEdit))).slice(0, 3)
);

const categoryCardCovers = computed(() =>
  contentCategories.value.filter((category) => categoryVisibleInDraftImported(category, contentCategories.value)).slice(0, 3)
);

const contentCategories = computed(() => {
  const source = builder.editMode && builder.canEdit && Array.isArray(builder.contentDraft.categories)
    ? builder.contentDraft.categories
    : categories.value;
  return visibleCategoriesForVisitors(source);
});

const exploreCategories = computed(() =>
  contentCategories.value.filter((category) => categoryVisibleInDraftImported(category, contentCategories.value)).slice(0, 8)
);

function contentCategoryForMaterial(item) {
  return contentCategories.value.find((category) => (
    String(category.id) === String(item?.category_id)
    || (item?.category_slug && category.slug === item.category_slug)
  )) || null;
}

const featuredResources = computed(() => {
  const items = editableResources.value.slice(0, 2);
  if (items.length >= 2) return items;
  const fallback = {
    id: 'placeholder',
    slug: 'library',
    title: 'Aleph-Bet Handwriting',
    description: 'Hebrew handwriting sheet for classroom or home practice.',
    cover_image: null,
    category_name: 'Hebrew',
  };
  const fallback2 = {
    ...fallback,
    id: 'placeholder-2',
    title: 'Weekly Parashah',
    description: 'Printable activity about the weekly Torah reading.',
  };
  if (items.length === 0) return [fallback, fallback2];
  return [...items, fallback];
});

const recentMaterials = computed(() => editableResources.value.slice(0, 6));

const blogLinks = computed(() => {
  const fromResources = editableResources.value.slice(0, 3).map((r) => ({
    item: r,
    title: r.title,
    to: `/resource/${r.slug}`,
  }));
  if (fromResources.length >= 3) return fromResources;
  return [
    { title: 'How to Teach Aleph-Bet to Children', to: '/library?q=hebrew' },
    { title: 'Chanukah Activities for the Classroom', to: '/library?q=chanukah' },
    { title: 'Weekly Parashah: Ideas for Educators', to: '/library?q=parashah' },
    ...fromResources,
  ].slice(0, 3);
});

const blogIcons = ['bi bi-translate', 'bi bi-stars', 'bi bi-journal-bookmark'];

const benefits = [
  {
    icon: 'bi bi-download',
    title: 'Instant download',
    text: 'PDFs and ready-to-use worksheets to print or use on screen in just a few clicks.',
  },
  {
    icon: 'bi bi-grid-3x3-gap',
    title: 'Organized by topic',
    text: 'Hebrew, Torah, holidays, and activities organized by category.',
  },
  {
    icon: 'bi bi-mortarboard',
    title: 'Made for educators',
    text: 'Materials designed for Jewish schools, cheder, and families.',
  },
  {
    icon: 'bi bi-eye',
    title: 'Preview before downloading',
    text: 'Open the PDF in the browser and download only what you need.',
  },
];

const publicQuickTopics = computed(() => {
  if (builder.editMode && builder.canEdit) return builder.contentDraft.quickTopics;
  try {
    const parsed = JSON.parse(s.value.home_quick_topics || '');
    return Array.isArray(parsed) ? parsed : DEFAULT_QUICK_TOPICS;
  } catch {
    return DEFAULT_QUICK_TOPICS;
  }
});

const quickTopics = computed(() => normalizeQuickTopics(publicQuickTopics.value)
  .filter((topic) => topic.visible)
  .map((topic) => {
    if (topic.targetType === 'category') {
      const category = contentCategories.value.find((item) => (String(item.id) === String(topic.target) || item.slug === topic.target) && categoryVisibleInDraftImported(item, contentCategories.value));
      return { ...topic, to: category ? `/library/category/${category.slug}` : '/library' };
    }
    return { ...topic, to: topic.target || '/library' };
  }));

function isExternalTopic(topic) {
  return /^https?:\/\//i.test(String(topic?.to || ''));
}

onMounted(async () => {
  try {
    const [catRes, resRes] = await Promise.all([
      api.get('/categories'),
      api.get('/resources', { params: { limit: 12 } }),
    ]);
    categories.value = catRes.data.categories;
    resources.value = resRes.data.resources;
  } catch {
    /* backend offline */
  }
});

function featuredLabel(index) {
  return index === 0 ? 'Featured worksheet' : 'Featured material';
}

function stackCover(item) {
  if (item?.cover_image && (!item.cover_hidden || (builder.editMode && builder.canEdit))) return mediaUrl(item.cover_image);
  return HERO_WORKSHEET;
}

function stackSlots(items, count = 3) {
  return Array.from({ length: count }, (_, i) => items[i] || null);
}

function selectContentFromCanvas(event, entity, item) {
  if (!builder.editMode || !builder.canEdit) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('editor:content-select', { detail: { entity, id: item?.id } }));
}
</script>

<template>
  <div class="k5-home-page" style="display: flex; flex-direction: column">
    <h1 v-if="!showHero" class="visually-hidden">{{ heroTitle || s.site_name || DEFAULT_SITE_NAME }}</h1>
    <section
      v-if="showHero"
      class="k5-hero k5-block-sized"
      :data-hero-align="heroContentAlign"
      :style="{
        ...sectionOrderStyle('hero'),
        ...blockSizeStyle(s, 'hero'),
        ...(heroBgImage ? { backgroundImage: `linear-gradient(rgba(238,243,247,0.92), rgba(238,243,247,0.92)), url(${mediaUrl(heroBgImage)})`, backgroundSize: 'cover' } : {}),
      }"
    >
      <div class="container k5-hero-inner">
        <div class="k5-hero-copy" :style="heroCopyStyle">
          <EditableSetting
            tag="h1"
            class="k5-hero-title"
            setting-key="hero_title"
            :default="heroTitle"
            placeholder="Hero title…"
          />
          <EditableSetting
            tag="p"
            class="k5-hero-lead"
            setting-key="hero_lead"
            :default="heroLead"
            placeholder="Subtitle…"
          />
          <div class="k5-hero-actions" :style="heroActionsStyle">
            <template v-if="showHeroPrimary">
              <a v-if="isExternalUrl(heroPrimaryLink)" :href="heroPrimaryLink" target="_blank" rel="noopener" class="k5-hero-btn k5-hero-btn-primary">
                <EditableSetting tag="span" setting-key="home_hero_cta_primary" :default="'Explore library'" link-key="home_hero_cta_primary_link" default-link="/library" placeholder="Primary button…" />
              </a>
              <RouterLink v-else :to="heroPrimaryLink" class="k5-hero-btn k5-hero-btn-primary">
                <EditableSetting tag="span" setting-key="home_hero_cta_primary" :default="'Explore library'" link-key="home_hero_cta_primary_link" default-link="/library" placeholder="Primary button…" />
              </RouterLink>
            </template>
            <template v-if="showHeroSecondary">
              <a v-if="isExternalUrl(heroSecondaryLink)" :href="heroSecondaryLink" target="_blank" rel="noopener" class="k5-hero-btn k5-hero-btn-outline">
                <EditableSetting tag="span" setting-key="home_hero_cta_secondary" :default="'Create free account'" link-key="home_hero_cta_secondary_link" default-link="/sign-up" placeholder="Secondary button…" />
              </a>
              <RouterLink v-else :to="heroSecondaryLink" class="k5-hero-btn k5-hero-btn-outline">
                <EditableSetting tag="span" setting-key="home_hero_cta_secondary" :default="'Create free account'" link-key="home_hero_cta_secondary_link" default-link="/sign-up" placeholder="Secondary button…" />
              </RouterLink>
            </template>
          </div>
        </div>
        <div class="k5-hero-visual">
          <EditableImage
            class="k5-hero-mascot-wrap"
            setting-key="home_hero_image"
            :default="HERO_MASCOT"
            alt-setting-key="home_hero_image_alt"
            default-alt="Educational mascot"
            img-class="k5-hero-mascot"
            loading="eager"
          />
        </div>
      </div>
    </section>

    <SiteContentSlot page-id="home" zone="after-hero" label="Content after the hero" />

    <BlockRenderer
      v-if="showCustomContent"
      class="k5-custom-content"
      :style="{ order: 1 }"
      role="region"
      aria-label="Custom page content"
    />

    <section v-if="showCards" class="k5-cards-section k5-block-sized" :style="sectionOrderStyle('cards', blockSizeStyle(s, 'library'))">
      <div class="container">
        <div class="k5-cards-grid">
          <RouterLink to="/library" class="k5-home-card k5-home-card-peach">
            <EditableSetting tag="h2" setting-key="home_card_worksheets_title" :default="'Worksheets'" placeholder="Card title…" />
            <EditableSetting tag="p" class="k5-home-card-desc" setting-key="home_card_worksheets_desc" :default="'Printable activity sheets for Hebrew, Torah and holidays.'" placeholder="Description…" />
            <div class="k5-home-card-visual">
              <div class="k5-card-stack">
                <div
                  v-for="(item, i) in stackSlots(cardCovers)"
                  :key="'ws-' + i"
                  class="k5-card-stack-item"
                >
                  <img :src="stackCover(item)" alt="" loading="lazy" />
                </div>
              </div>
            </div>
          </RouterLink>

          <RouterLink to="/library" class="k5-home-card k5-home-card-mint">
            <EditableSetting tag="h2" setting-key="home_card_materials_title" :default="'Materials'" placeholder="Card title…" />
            <EditableSetting tag="p" class="k5-home-card-desc" setting-key="home_card_materials_desc" :default="'PDFs, presentations and resources by category and age group.'" placeholder="Description…" />
            <div class="k5-home-card-visual">
              <div class="k5-card-stack">
                <div
                  v-for="(cat, i) in stackSlots(categoryCardCovers)"
                  :key="'cat-' + i"
                  class="k5-card-stack-item"
                >
                  <div
                  v-if="cat"
                  class="k5-stack-category"
                >
                    <EditableContentText entity="category" :item="cat" field="name" tag="span" placeholder="Category name…" />
                  </div>
                  <img v-else :src="HERO_WORKSHEET" alt="" loading="lazy" />
                </div>
              </div>
            </div>
          </RouterLink>

          <a v-if="isExternalUrl(heroSecondaryLink)" :href="heroSecondaryLink" target="_blank" rel="noopener" class="k5-home-card k5-home-card-blue">
            <EditableSetting tag="h2" setting-key="home_card_account_title" :default="'Free Account'" placeholder="Card title…" />
            <EditableSetting tag="p" class="k5-home-card-desc" setting-key="home_card_account_desc" :default="'Sign up to save favorites and access the full library.'" placeholder="Description…" />
            <div class="k5-home-card-visual">
              <div class="k5-membership-icon">
                <img src="/logo-mark.svg?v=3" alt="" width="72" height="72" />
              </div>
            </div>
          </a>
          <RouterLink v-else :to="heroSecondaryLink" class="k5-home-card k5-home-card-blue">
            <EditableSetting tag="h2" setting-key="home_card_account_title" :default="'Free Account'" placeholder="Card title…" />
            <EditableSetting tag="p" class="k5-home-card-desc" setting-key="home_card_account_desc" :default="'Sign up to save favorites and access the full library.'" placeholder="Description…" />
            <div class="k5-home-card-visual">
              <div class="k5-membership-icon">
                <img src="/logo-mark.svg?v=3" alt="" width="72" height="72" />
              </div>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <SiteContentSlot page-id="home" zone="after-cards" label="Content after the cards" />

    <section v-if="showTopics" class="k5-topics-section" :style="sectionOrderStyle('topics')">
      <div class="container">
        <EditableSetting tag="h2" class="k5-section-title" setting-key="home_topics_title" :default="'Explore by topic'" placeholder="Section title…" />
        <div class="k5-topics-grid">
          <template v-for="topic in quickTopics" :key="`${topic.targetType}-${topic.id}`">
            <a
              v-if="isExternalTopic(topic)"
              :href="topic.to"
              target="_blank"
              rel="noopener noreferrer"
              class="k5-topic-chip"
              @click="selectContentFromCanvas($event, 'topic', topic)"
            >
              <i :class="topic.icon"></i>
              <EditableContentText entity="topic" :item="topic" field="label" tag="span" placeholder="Topic label…" />
            </a>
            <RouterLink
              v-else
              :to="topic.to"
              class="k5-topic-chip"
              @click="selectContentFromCanvas($event, 'topic', topic)"
            >
              <i :class="topic.icon"></i>
              <EditableContentText entity="topic" :item="topic" field="label" tag="span" placeholder="Topic label…" />
            </RouterLink>
          </template>
          <RouterLink
            v-for="cat in exploreCategories"
            :key="cat.id"
            :to="`/library/category/${cat.slug}`"
            class="k5-topic-chip k5-topic-chip-soft"
            @click="selectContentFromCanvas($event, 'category', cat)"
          >
            <i class="bi bi-folder2"></i>
            <EditableContentText entity="category" :item="cat" field="name" tag="span" placeholder="Category name…" />
          </RouterLink>
        </div>
      </div>
    </section>

    <section v-if="showFeatured" class="k5-featured-section" :style="sectionOrderStyle('featured')">
      <div class="container">
        <EditableSetting tag="h2" class="k5-section-title" setting-key="home_featured_title" :default="'Featured this week'" placeholder="Section title…" />
        <div class="k5-featured-grid">
          <RouterLink
            v-for="(item, index) in featuredResources"
            :key="item.id"
            :to="item.slug === 'library' ? '/library' : `/resource/${item.slug}`"
            class="k5-featured-card"
            @click="selectContentFromCanvas($event, 'material', item)"
          >
            <div class="k5-featured-thumb">
              <img
                :src="item.cover_image && (!item.cover_hidden || (builder.editMode && builder.canEdit)) ? mediaUrl(item.cover_image) : HERO_WORKSHEET"
                :alt="item.title"
                loading="lazy"
              />
            </div>
            <div class="k5-featured-body">
              <span class="k5-featured-label">{{ featuredLabel(index) }}</span>
              <EditableContentText entity="material" :item="item" field="title" tag="h3" placeholder="Material title…" />
              <EditableContentText
                v-if="item.description || (builder.editMode && builder.canEdit && builder.contentItem('material', item.id))"
                entity="material"
                :item="item"
                field="description"
                tag="p"
                placeholder="Short description…"
              />
              <p v-else>
                <EditableContentText
                  v-if="contentCategoryForMaterial(item)"
                  entity="category"
                  :item="contentCategoryForMaterial(item)"
                  field="name"
                  tag="span"
                  placeholder="Category name…"
                />
                <template v-else>{{ item.category_name || 'Jewish educational material.' }}</template>
              </p>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <SiteContentSlot page-id="home" zone="after-featured" label="Content after featured materials" />

    <section v-if="showRecent && recentMaterials.length" class="k5-recent-section k5-block-sized" :style="sectionOrderStyle('recent', blockSizeStyle(s, 'recent'))">
      <div class="container">
        <div class="k5-section-head">
          <EditableSetting tag="h2" class="k5-section-title mb-0" setting-key="section_recent_title" :default="APPEARANCE_DEFAULTS.section_recent_title" placeholder="Section title…" />
          <RouterLink to="/library" class="k5-section-link"><EditableSetting tag="span" setting-key="home_recent_link" :default="'View all'" placeholder="Link text…" /> <i class="bi bi-arrow-right"></i></RouterLink>
        </div>
        <div class="k5-recent-grid">
          <RouterLink
            v-for="item in recentMaterials"
            :key="item.id"
            :to="`/resource/${item.slug}`"
            class="k5-recent-card"
            @click="selectContentFromCanvas($event, 'material', item)"
          >
            <div class="k5-recent-thumb">
              <img
                v-if="item.cover_image && (!item.cover_hidden || (builder.editMode && builder.canEdit))"
                :src="mediaUrl(item.cover_image)"
                :alt="item.title"
                loading="lazy"
              />
              <img v-else :src="HERO_WORKSHEET" :alt="item.title" loading="lazy" />
            </div>
            <div class="k5-recent-body">
              <EditableContentText
                v-if="contentCategoryForMaterial(item)"
                class="k5-recent-cat"
                entity="category"
                :item="contentCategoryForMaterial(item)"
                field="name"
                tag="span"
                placeholder="Category name…"
              />
              <span v-else-if="item.category_name" class="k5-recent-cat">{{ item.category_name }}</span>
              <EditableContentText entity="material" :item="item" field="title" tag="h3" placeholder="Material title…" />
              <EditableContentText
                v-if="item.description || (builder.editMode && builder.canEdit && builder.contentItem('material', item.id))"
                entity="material"
                :item="item"
                field="description"
                tag="p"
                placeholder="Short description…"
              />
              <p v-else>Open, preview, and download this material.</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <section v-if="showBenefits" class="k5-benefits-section" :style="sectionOrderStyle('benefits')">
      <div class="container">
        <EditableSetting tag="h2" class="k5-section-title text-center" setting-key="home_benefits_title" :default="'Why use the library?'" placeholder="Section title…" />
        <div class="k5-benefits-grid">
          <article v-for="(item, index) in benefits" :key="item.title" class="k5-benefit-card">
            <div class="k5-benefit-icon"><i :class="item.icon"></i></div>
            <EditableSetting
              tag="h3"
              :setting-key="`home_benefit_${index + 1}_title`"
              :default="item.title"
              :label="`Benefit ${index + 1} title`"
              placeholder="Benefit title…"
            />
            <EditableSetting
              tag="p"
              :setting-key="`home_benefit_${index + 1}_text`"
              :default="item.text"
              :label="`Benefit ${index + 1} description`"
              placeholder="Benefit description…"
            />
          </article>
        </div>
      </div>
    </section>

    <section v-if="showPrefooter" class="k5-prefooter-section" :style="sectionOrderStyle('prefooter')">
      <div class="container">
        <div class="k5-prefooter-grid">
          <div class="k5-blog-col">
            <EditableSetting tag="h2" class="k5-prefooter-title" setting-key="home_blog_title" :default="'Library updates'" placeholder="Section title…" />
            <ul class="k5-blog-list">
              <li v-for="(link, i) in blogLinks" :key="link.title">
                <RouterLink :to="link.to" class="k5-blog-link">
                  <span class="k5-blog-icon" :class="`k5-blog-icon-${i + 1}`">
                    <i :class="blogIcons[i] || 'bi bi-book'"></i>
                  </span>
                  <EditableContentText v-if="link.item" entity="material" :item="link.item" field="title" tag="span" placeholder="Material title…" />
                  <span v-else>{{ link.title }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>

          <div class="k5-ebook-col">
            <div class="k5-ebook-box">
              <EditableSetting tag="h2" class="k5-prefooter-title" setting-key="home_ebook_title" :default="'Free guide'" placeholder="Title…" />
              <EditableSetting
                tag="p"
                class="k5-ebook-lead"
                setting-key="home_ebook_lead"
                :default="'Download the guide for parents and educators: practical ideas to strengthen Jewish learning at home and school.'"
                placeholder="Supporting text…"
              />
              <div class="k5-ebook-inner">
                <a v-if="isExternalUrl(guideLink)" :href="guideLink" target="_blank" rel="noopener" class="k5-ebook-btn">
                  <EditableSetting tag="span" setting-key="home_ebook_cta" :default="'DOWNLOAD'" link-key="home_ebook_url" default-link="/library" placeholder="Button…" /> <i class="bi bi-chevron-right"></i>
                </a>
                <RouterLink v-else :to="guideLink" class="k5-ebook-btn">
                  <EditableSetting tag="span" setting-key="home_ebook_cta" :default="'DOWNLOAD'" link-key="home_ebook_url" default-link="/library" placeholder="Button…" /> <i class="bi bi-chevron-right"></i>
                </RouterLink>
                <div class="k5-ebook-covers" aria-hidden="true">
                  <div class="k5-ebook-cover k5-ebook-cover-back">
                    <span>HOW TO HELP YOUR CHILDREN WITH JEWISH STUDIES</span>
                  </div>
                  <div class="k5-ebook-cover k5-ebook-cover-front">
                    <span>HOW TO HELP YOUR CHILDREN WITH JEWISH STUDIES</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="showContact" class="k5-contact-section k5-block-sized" :style="{ ...sectionOrderStyle('contact', blockSizeStyle(s, 'contact')), ...contactStyle }">
      <div v-if="builder.editMode && builder.canEdit" class="k5-contact-editor-tools" role="group" aria-label="Contact section settings">
        <button type="button" class="btn btn-sm btn-light" @click="selectContactBackground('image', $event)"><i class="bi bi-image"></i> Edit background image</button>
        <button type="button" class="btn btn-sm btn-light" @click="selectContactBackground('color', $event)"><i class="bi bi-palette"></i> Edit background color</button>
      </div>
      <div class="container">
        <div class="k5-contact-card">
          <div class="k5-contact-intro">
            <EditableImage
              setting-key="section_contact_image"
              :default="APPEARANCE_DEFAULTS.section_contact_image"
              :alt="settingText(s, 'section_contact_image_alt', APPEARANCE_DEFAULTS.section_contact_image_alt)"
              alt-setting-key="section_contact_image_alt"
              class="k5-contact-image"
              img-class="k5-contact-image-img"
              loading="lazy"
            />
            <EditableSetting tag="h2" class="k5-section-title" setting-key="section_contact_title" :default="contactTitle" placeholder="Contact section title…" />
            <EditableSetting tag="p" class="k5-contact-lead" setting-key="section_contact_lead" :default="contactLead" placeholder="Supporting text…" />
          </div>
          <form class="k5-contact-form" @submit.prevent="submitContact">
            <div v-if="contactFeedback" class="alert alert-success py-2">{{ contactFeedback }}</div>
            <div v-if="contactError" class="alert alert-danger py-2">{{ contactError }}</div>
            <div class="mb-3">
              <label class="form-label" for="contact-name"><EditableSetting tag="span" setting-key="contact_name_label" :default="APPEARANCE_DEFAULTS.contact_name_label" /></label>
              <input id="contact-name" v-model="contactForm.name" type="text" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label" for="contact-email"><EditableSetting tag="span" setting-key="contact_email_label" :default="APPEARANCE_DEFAULTS.contact_email_label" /></label>
              <input id="contact-email" v-model="contactForm.email" type="email" class="form-control" required />
            </div>
            <div class="mb-3">
              <label class="form-label" for="contact-message"><EditableSetting tag="span" setting-key="contact_message_label" :default="APPEARANCE_DEFAULTS.contact_message_label" /></label>
              <textarea id="contact-message" v-model="contactForm.message" class="form-control" rows="5" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary k5-contact-submit" :disabled="contactSending">
              <span v-if="contactSending" class="spinner-border spinner-border-sm me-1"></span>
              <EditableSetting tag="span" setting-key="home_contact_submit" :default="'Submit'" placeholder="Button…" />
            </button>
          </form>
        </div>
      </div>
    </section>
    <SiteContentSlot page-id="home" zone="before-footer" label="Content before the footer" />
  </div>
</template>
