<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSettingsStore } from '@/stores';
import api from '@/api';
import { applyTheme, APPEARANCE_DEFAULTS } from '@/utils/theme';
import { useBuilderStore } from './store';
import { BLOCK_LIBRARY } from './registry';
import { EDITOR_PANEL_TABS, EDITOR_PAGES } from './editorUi';
import EditorContentPanel from './EditorContentPanel.vue';

const props = defineProps({
  activePanel: { type: String, default: 'insert' },
  inspectorOpen: { type: Boolean, default: false },
  pageId: { type: String, default: 'home' },
  insertionTarget: { type: Object, default: null },
});

const emit = defineEmits(['panel', 'inspect', 'area', 'help', 'page-request', 'content-added']);
const builder = useBuilderStore();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();

const basicBlocks = computed(() => BLOCK_LIBRARY.filter((item) => ['heading', 'paragraph', 'image', 'button'].includes(item.type)));
const mediaBlocks = computed(() => BLOCK_LIBRARY.filter((item) => ['video', 'cta', 'features', 'alert'].includes(item.type)));
// Every editor page receives a SiteDocument v2 slot. The legacy Home canvas
// is still reachable under More options so existing layouts remain intact.
const canvasAllowed = computed(() => true);
const legacyCanvasAllowed = computed(() => builder.slug === 'home');

const HOME_SECTION_DEFS = [
  // The native welcome section replaces the legacy hero. Keep its visibility
  // independent so an old `home_hero_show=false` cannot blank the new Home.
  { id: 'hero', label: 'Welcome section', visibilityKey: 'home_intro_show', defaultVisible: true },
  { id: 'cards', label: 'Library cards', visibilityKey: 'home_cards_show', defaultVisible: true },
  { id: 'topics', label: 'Topics', visibilityKey: 'home_topics_show', defaultVisible: true },
  { id: 'featured', label: 'Featured materials', visibilityKey: 'home_featured_show', defaultVisible: true },
  { id: 'recent', label: 'Recent materials', visibilityKey: 'home_recent_show', defaultVisible: true },
  { id: 'benefits', label: 'Benefits', visibilityKey: 'home_benefits_show', defaultVisible: true },
  { id: 'prefooter', label: 'Updates and guide', visibilityKey: 'home_prefooter_show', defaultVisible: true },
  { id: 'contact', label: 'Contact', visibilityKey: 'home_contact_show', legacyKey: 'block_contact_show', defaultVisible: false },
];

function normalizeHomeSectionIds(raw) {
  let parsed = [];
  try {
    parsed = JSON.parse(raw || '[]');
  } catch {
    parsed = [];
  }
  const ids = Array.isArray(parsed) ? parsed.filter((id) => HOME_SECTION_DEFS.some((section) => section.id === id)) : [];
  HOME_SECTION_DEFS.forEach((section) => {
    if (!ids.includes(section.id)) ids.push(section.id);
  });
  return ids;
}

const homeSectionOrder = computed(() => {
  const byId = new Map(HOME_SECTION_DEFS.map((section) => [section.id, section]));
  return normalizeHomeSectionIds(builder.settingValue('home_sections_order', ''))
    .map((id) => byId.get(id))
    .filter(Boolean);
});

function homeSectionVisible(section) {
  const explicit = builder.settingValue(section.visibilityKey, null);
  if (explicit === null || explicit === '') {
    if (section.legacyKey) return builder.settingValue(section.legacyKey, 'false') !== 'false';
    return section.defaultVisible;
  }
  return explicit !== false && String(explicit).toLowerCase() !== 'false';
}

function setHomeSectionOrder(sections) {
  builder.setSetting('home_sections_order', JSON.stringify(sections.map((section) => section.id)));
}

function moveHomeSection(section, direction) {
  const sections = [...homeSectionOrder.value];
  const index = sections.findIndex((item) => item.id === section.id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= sections.length) return;
  [sections[index], sections[target]] = [sections[target], sections[index]];
  setHomeSectionOrder(sections);
}

function toggleHomeSection(section) {
  builder.setSetting(section.visibilityKey, homeSectionVisible(section) ? 'false' : 'true');
}

const palettes = [
  { name: 'Educational Blue', colors: { theme_color_primary: '#3bafb8', theme_color_secondary: '#5d6dbe', theme_color_accent: '#38bdf8', theme_color_text: '#1e293b', theme_color_background: '#ffffff', theme_color_header_bg: '#f8fafc', theme_color_footer_bg: '#0f172a' } },
  { name: 'Jerusalem Gold', colors: { theme_color_primary: '#d97706', theme_color_secondary: '#b45309', theme_color_accent: '#f59e0b', theme_color_text: '#1c1917', theme_color_background: '#fffbe6', theme_color_header_bg: '#fef3c7', theme_color_footer_bg: '#1c1917' } },
  { name: 'Hope Green', colors: { theme_color_primary: '#059669', theme_color_secondary: '#047857', theme_color_accent: '#10b981', theme_color_text: '#064e3b', theme_color_background: '#f0fdf4', theme_color_header_bg: '#d1fae5', theme_color_footer_bg: '#064e3b' } },
  { name: 'Modern Dark', colors: { theme_color_primary: '#818cf8', theme_color_secondary: '#a78bfa', theme_color_accent: '#38bdf8', theme_color_text: '#f8fafc', theme_color_background: '#0f172a', theme_color_header_bg: '#1e293b', theme_color_footer_bg: '#020617' } },
];
const themeColors = [
  { key: 'theme_color_primary', label: 'Primary' },
  { key: 'theme_color_secondary', label: 'Secondary' },
  { key: 'theme_color_accent', label: 'Accent' },
  { key: 'theme_color_text', label: 'Text' },
  { key: 'theme_color_background', label: 'Background' },
  { key: 'theme_color_header_bg', label: 'Header' },
  { key: 'theme_color_footer_bg', label: 'Footer' },
];
const fontOptions = [
  { label: 'Nunito (Friendly)', value: APPEARANCE_DEFAULTS.theme_font_family },
  { label: 'Poppins (Geometric)', value: "'Poppins', system-ui, sans-serif" },
  { label: 'Roboto (Neutral)', value: "'Roboto', system-ui, sans-serif" },
  { label: 'System Default', value: 'system-ui, sans-serif' },
];

function themeValue(key) {
  return builder.settingValue(key, APPEARANCE_DEFAULTS[key] || '');
}

function setTheme(key, value) {
  builder.setSetting(key, value);
  applyTheme({ ...settings.settings, ...builder.pendingSettings });
}

function applyPalette(palette) {
  Object.entries(palette.colors).forEach(([key, value]) => builder.setSetting(key, value));
  applyTheme({ ...settings.settings, ...builder.pendingSettings });
}

function addBlock(type) {
  const target = props.insertionTarget?.kind === 'site-document' ? props.insertionTarget : null;
  builder.addDocumentBlock(
    target?.pageId || props.pageId,
    target?.zone || builder.defaultDocumentZone(props.pageId),
    type,
    target ? { sectionId: target.sectionId, columnId: target.columnId, index: target.index } : {},
  );
  emit('content-added');
}

function addPreset(preset) {
  if (!canvasAllowed.value) return;
  builder.addSectionPreset(preset);
  emit('inspect');
}

function addSection() {
  const target = props.insertionTarget?.kind === 'site-document' ? props.insertionTarget : null;
  builder.addDocumentSection(target?.pageId || props.pageId, target?.zone || builder.defaultDocumentZone(props.pageId));
  emit('content-added');
}

async function navigatePage(page) {
  emit('area', page.id);
  const query = { ...route.query, edit: '1', area: page.id };
  if (page.id === 'global') {
    await router.push({ path: '/', query });
    return;
  }
  let previewPath = page.id === 'home' ? '/' : page.id === 'library' ? '/library' : page.id === 'auth' ? '/login' : '/library';
  if (page.id === 'resource' || page.id === 'download') {
    try {
      const { data } = await api.get('/resources', { params: { limit: 1 } });
      const first = data?.resources?.[0];
      if (first?.slug) {
        previewPath = `/resource/${first.slug}`;
        if (page.id === 'download') {
          const detail = await api.get(`/resources/${first.slug}`);
          const file = detail.data?.resource?.files?.[0];
          if (file?.id) previewPath = `/resource/${first.slug}/download/${file.id}`;
        }
      }
    } catch {
      // Keep the safe Library preview when there is no published material.
    }
  }
  await router.push({ path: previewPath, query });
}

function selectPage(page) {
  if (!page) return;
  if (builder.dirty) {
    emit('page-request', page);
    return;
  }
  return navigatePage(page);
}

function handleConfirmedPage(event) {
  if (event.detail) navigatePage(event.detail);
}

onMounted(() => window.addEventListener('editor:page-navigation-confirmed', handleConfirmedPage));
onUnmounted(() => window.removeEventListener('editor:page-navigation-confirmed', handleConfirmedPage));
</script>

<template>
  <aside class="editor-sidebar" :class="{ 'is-inspector': props.inspectorOpen }" aria-label="Editor panel">
    <nav v-if="!props.inspectorOpen" class="editor-sidebar-tabs" aria-label="Editor tools">
      <button
        v-for="tab in EDITOR_PANEL_TABS"
        :key="tab.id"
        type="button"
        :class="{ active: props.activePanel === tab.id }"
        @click="emit('panel', tab.id)"
      >
        <i :class="['bi', tab.icon]"></i>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div v-if="props.inspectorOpen" class="editor-sidebar-context">
      <button type="button" class="editor-back-button" @click="emit('panel', 'insert')">
        <i class="bi bi-arrow-left"></i><span>Back to tools</span>
      </button>
      <span class="editor-context-kicker">Selected item</span>
    </div>

    <slot v-if="props.inspectorOpen" name="inspector"></slot>

    <div v-if="!props.inspectorOpen && props.activePanel === 'insert'" class="editor-sidebar-body">
      <div class="editor-panel-heading">
        <div><span class="editor-kicker">Build your page</span><h2>Insert</h2></div>
        <button type="button" class="editor-help-link" title="Editor help" @click="emit('help')"><i class="bi bi-question-circle"></i></button>
      </div>
      <p class="editor-panel-intro">Choose Text, Image or Button to add in this page's safe visual areas. Click directly in the preview to edit it.</p>
      <div class="editor-quick-start-card">
        <strong><i class="bi bi-lightbulb"></i> Three easy steps</strong>
        <ol><li>Click and type in the preview.</li><li>Add a safe section when needed.</li><li>Publish when ready.</li></ol>
      </div>

      <section class="editor-palette-group">
        <h3>Basic</h3>
        <div class="editor-palette-grid">
          <button v-for="item in basicBlocks" :key="item.type" type="button" class="editor-palette-card" :disabled="!canvasAllowed" :title="canvasAllowed ? `Add ${item.label}` : 'Add content is available on Home'" @click="addBlock(item.type)">
            <i :class="['bi', item.icon]"></i><span>{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section class="editor-palette-group">
        <h3>Section</h3>
        <div class="editor-preset-list">
          <button type="button" class="editor-preset-card" @click="addSection"><i class="bi bi-square-dashed"></i><span><strong>New responsive section</strong><small>Add text, image or button inside it</small></span></button>
        </div>
      </section>

      <details v-if="legacyCanvasAllowed" class="editor-advanced-options">
        <summary>More options</summary>
        <p>Existing Home layouts are kept here so they remain available without taking over the simple editor.</p>
      <section class="editor-palette-group">
        <h3>Layouts</h3>
        <div class="editor-preset-list">
          <button type="button" class="editor-preset-card" :disabled="!canvasAllowed" @click="addPreset('image-text')"><i class="bi bi-layout-sidebar"></i><span><strong>Image + text</strong><small>Two responsive columns</small></span></button>
          <button type="button" class="editor-preset-card" :disabled="!canvasAllowed" @click="addPreset('text-image')"><i class="bi bi-layout-sidebar-reverse"></i><span><strong>Text + image</strong><small>Swap the reading order</small></span></button>
          <button type="button" class="editor-preset-card" :disabled="!canvasAllowed" @click="addSection"><i class="bi bi-square-dashed"></i><span><strong>Empty section</strong><small>Start with a clean row</small></span></button>
        </div>
      </section>

      <section class="editor-palette-group editor-home-sections">
        <h3>Home sections</h3>
        <p class="editor-home-sections-hint">Use the arrows to change the order. The eye hides a section without deleting it.</p>
        <div class="editor-home-section-list">
          <div
            v-for="(section, index) in homeSectionOrder"
            :key="section.id"
            class="editor-home-section-row"
            :class="{ hidden: !homeSectionVisible(section) }"
          >
            <span class="editor-home-section-name">
              <i :class="['bi', homeSectionVisible(section) ? 'bi-layout-text-window' : 'bi-eye-slash']"></i>
              <span>{{ section.label }}</span>
            </span>
            <span class="editor-home-section-actions">
              <button type="button" title="Move section up" :aria-label="`Move ${section.label} up`" :disabled="index === 0" @click="moveHomeSection(section, 'up')"><i class="bi bi-arrow-up"></i></button>
              <button type="button" title="Move section down" :aria-label="`Move ${section.label} down`" :disabled="index === homeSectionOrder.length - 1" @click="moveHomeSection(section, 'down')"><i class="bi bi-arrow-down"></i></button>
              <button type="button" :title="homeSectionVisible(section) ? 'Hide section' : 'Show section'" :aria-label="homeSectionVisible(section) ? `Hide ${section.label}` : `Show ${section.label}`" @click="toggleHomeSection(section)"><i :class="['bi', homeSectionVisible(section) ? 'bi-eye' : 'bi-eye-slash']"></i></button>
            </span>
          </div>
        </div>
      </section>

      <section class="editor-palette-group">
        <h3>Media & highlights</h3>
        <div class="editor-palette-grid">
          <button v-for="item in mediaBlocks" :key="item.type" type="button" class="editor-palette-card" :disabled="!canvasAllowed" @click="item.type === 'video' ? addPreset('video') : item.type === 'cta' ? addPreset('cta') : item.type === 'features' ? addPreset('features') : addBlock(item.type)"><i :class="['bi', item.icon]"></i><span>{{ item.label.replace('Embedded ', '') }}</span></button>
        </div>
      </section>
      </details>

    </div>

    <EditorContentPanel v-else-if="!props.inspectorOpen && props.activePanel === 'content'" />

    <div v-else-if="!props.inspectorOpen && props.activePanel === 'pages'" class="editor-sidebar-body">
      <div class="editor-panel-heading"><div><span class="editor-kicker">Site structure</span><h2>Pages</h2></div></div>
      <p class="editor-panel-intro">Choose a page or edit shared header and footer content.</p>
      <div class="editor-page-list">
        <button v-for="page in EDITOR_PAGES" :key="page.id" type="button" class="editor-page-item" :class="{ active: page.id === props.pageId }" @click="selectPage(page)">
          <span class="editor-page-icon"><i :class="['bi', page.icon]"></i></span>
          <span><strong>{{ page.label }}</strong><small>{{ page.id === 'global' ? 'Shared across the site' : page.id === 'home' ? 'Landing page and custom sections' : 'Safe visual areas around protected tools' }}</small></span>
          <i class="bi bi-chevron-right editor-page-arrow"></i>
        </button>
      </div>
      <div class="editor-info-callout"><i class="bi bi-shield-check"></i> Core search, account, download and payment flows stay protected.</div>
    </div>

    <div v-else-if="!props.inspectorOpen && props.activePanel === 'themes'" class="editor-sidebar-body">
      <div class="editor-panel-heading"><div><span class="editor-kicker">Site appearance</span><h2>Themes</h2></div></div>
      <p class="editor-panel-intro">Choose a visual direction, then fine-tune the colors and type.</p>
      <section class="editor-palette-group"><h3>Presets</h3><div class="editor-theme-grid"><button v-for="palette in palettes" :key="palette.name" type="button" class="editor-theme-card" @click="applyPalette(palette)"><span class="editor-theme-swatches"><i :style="{ background: palette.colors.theme_color_primary }"></i><i :style="{ background: palette.colors.theme_color_secondary }"></i><i :style="{ background: palette.colors.theme_color_accent }"></i><i :style="{ background: palette.colors.theme_color_footer_bg }"></i></span><strong>{{ palette.name }}</strong></button></div></section>
      <section class="editor-palette-group"><h3>Colors</h3><div class="editor-color-list"><label v-for="color in themeColors" :key="color.key" class="editor-color-row"><span>{{ color.label }}</span><span class="editor-color-control"><code>{{ themeValue(color.key) }}</code><input type="color" :value="themeValue(color.key)" :aria-label="`${color.label} color`" @input="setTheme(color.key, $event.target.value)" /></span></label></div></section>
      <section class="editor-palette-group"><h3>Typography</h3><select class="editor-select" :value="themeValue('theme_font_family')" @change="setTheme('theme_font_family', $event.target.value)"><option v-for="font in fontOptions" :key="font.value" :value="font.value">{{ font.label }}</option></select></section>
    </div>
  </aside>
</template>

<style scoped>
.editor-sidebar { position: fixed; top: 68px; right: 0; bottom: 0; z-index: 29; width: min(360px, 100vw); display: flex; flex-direction: column; background: #fff; border-left: 1px solid #dce8f0; box-shadow: -8px 0 28px rgba(31, 78, 107, 0.08); pointer-events: auto; color: #234b67; font-family: Nunito, system-ui, sans-serif; }
.editor-sidebar-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 9px 10px 0; border-bottom: 1px solid #e6eef2; }
.editor-sidebar-tabs button { display: grid; place-items: center; gap: 3px; min-height: 58px; border: 0; border-bottom: 3px solid transparent; background: transparent; color: #526879; cursor: pointer; font-size: 0.71rem; font-weight: 800; }
.editor-sidebar-tabs button i { font-size: 1.05rem; }
.editor-sidebar-tabs button:hover { color: #237f86; background: #f3fbfb; }
.editor-sidebar-tabs button.active { border-bottom-color: #3bafb8; color: #17656a; background: #f7fcfc; }
.editor-sidebar-body { flex: 1; overflow-y: auto; padding: 20px 18px 28px; }
.editor-panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 7px; }
.editor-panel-heading h2 { margin: 2px 0 0; color: #173f5f; font-size: 1.35rem; line-height: 1.1; }
.editor-kicker { color: #17656a; font-size: 0.64rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
.editor-panel-intro { margin: 0 0 18px; color: #526879; font-size: 0.77rem; line-height: 1.5; }
.editor-quick-start-card { margin: 0 0 18px; padding: 11px 12px; border: 1px solid #d8ecee; border-radius: 9px; background: #f8fdfd; color: #557285; font-size: .7rem; }
.editor-quick-start-card strong { display: flex; align-items: center; gap: 6px; color: #237f86; }
.editor-quick-start-card strong i { color: #d88936; }
.editor-quick-start-card ol { display: grid; gap: 3px; margin: 7px 0 0; padding-left: 20px; line-height: 1.4; }
.editor-protected-page { display: grid; justify-items: center; gap: 9px; margin: 24px 0; padding: 22px 16px; border: 1px solid #cde9eb; border-radius: 12px; background: #f3fbfb; color: #557285; text-align: center; }
.editor-protected-page > i { color: #3bafb8; font-size: 1.8rem; }
.editor-protected-page strong { color: #173f5f; font-size: .84rem; }
.editor-protected-page p { margin: 0; font-size: .73rem; line-height: 1.5; }
.editor-primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; padding: 8px 12px; border: 0; border-radius: 7px; background: #3bafb8; color: #fff; cursor: pointer; font: inherit; font-size: .72rem; font-weight: 900; }
.editor-primary-action:hover { background: #237f86; }
.editor-help-link { width: 30px; height: 30px; border: 1px solid #dce8f0; border-radius: 8px; background: #fff; color: #5d7d8d; cursor: pointer; }
.editor-palette-group { margin-top: 20px; }
.editor-palette-group h3 { margin: 0 0 9px; color: #557285; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
.editor-palette-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.editor-palette-card { min-height: 72px; display: grid; place-items: center; gap: 6px; border: 1px solid #dce8f0; border-radius: 10px; background: #fbfdfe; color: #4f6f82; cursor: pointer; font-size: 0.68rem; font-weight: 800; text-align: center; }
.editor-palette-card i { color: #3bafb8; font-size: 1.15rem; }
.editor-palette-card:hover:not(:disabled) { border-color: #3bafb8; background: #f0fbfb; color: #237f86; transform: translateY(-1px); }
.editor-palette-card:disabled, .editor-preset-card:disabled { opacity: 0.45; cursor: not-allowed; }
.editor-preset-list { display: grid; gap: 8px; }
.editor-preset-card { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 1px solid #dce8f0; border-radius: 10px; background: #fbfdfe; color: #4f6f82; text-align: left; cursor: pointer; }
.editor-preset-card:hover:not(:disabled) { border-color: #3bafb8; background: #f0fbfb; }
.editor-preset-card > i { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 8px; background: #e8f8f8; color: #237f86; font-size: 1.05rem; }
.editor-preset-card span { display: grid; gap: 2px; }
.editor-preset-card strong { color: #2e536c; font-size: 0.78rem; }
.editor-preset-card small { color: #526879; font-size: 0.66rem; }
.editor-advanced-options { margin-top: 18px; padding: 0 11px 12px; border: 1px solid #dce8f0; border-radius: 10px; background: #fbfdfe; }
.editor-advanced-options summary { margin: 0 -11px; padding: 11px; color: #237f86; cursor: pointer; font-size: .72rem; font-weight: 900; }
.editor-advanced-options > p { margin: -2px 0 0; color: #627f8e; font-size: .68rem; line-height: 1.45; }
.editor-advanced-options .editor-palette-group { margin-top: 15px; }
.editor-home-sections-hint { margin: -2px 0 9px; color: #526879; font-size: .67rem; line-height: 1.45; }
.editor-home-section-list { display: grid; gap: 5px; }
.editor-home-section-row { display: flex; align-items: center; justify-content: space-between; gap: 7px; min-height: 35px; padding: 4px 5px 4px 8px; border: 1px solid #dce8f0; border-radius: 8px; background: #fff; }
.editor-home-section-row.hidden { background: #f8fafc; opacity: .7; }
.editor-home-section-name { display: inline-flex; align-items: center; gap: 7px; min-width: 0; color: #45687c; font-size: .71rem; font-weight: 800; }
.editor-home-section-name i { color: #3bafb8; font-size: .9rem; }
.editor-home-section-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-home-section-actions { display: inline-flex; gap: 2px; }
.editor-home-section-actions button { display: inline-grid; width: 26px; height: 26px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #5d7d8d; cursor: pointer; }
.editor-home-section-actions button:hover:not(:disabled) { border-color: #9bd5d7; background: #f0fbfb; color: #237f86; }
.editor-home-section-actions button:disabled { color: #c4d0d6; cursor: not-allowed; }
.editor-info-callout { display: flex; align-items: flex-start; gap: 8px; margin-top: 18px; padding: 10px; border: 1px solid #cde9eb; border-radius: 9px; background: #f0fbfb; color: #477684; font-size: 0.7rem; line-height: 1.45; }
.editor-info-callout i { flex: 0 0 auto; color: #3bafb8; }
.editor-page-list { display: grid; gap: 6px; }
.editor-page-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 1px solid #e4edf1; border-radius: 10px; background: #fff; color: #4c6d80; cursor: pointer; text-align: left; }
.editor-page-item:hover, .editor-page-item.active { border-color: #9bd5d7; background: #f0fbfb; }
.editor-page-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; background: #eef6fa; color: #3bafb8; }
.editor-page-item > span:nth-child(2) { display: grid; flex: 1; gap: 2px; }
.editor-page-item strong { color: #2e536c; font-size: 0.78rem; }
.editor-page-item small { color: #8aa0af; font-size: 0.65rem; }
.editor-page-arrow { color: #a5b6c0; font-size: 0.7rem; }
.editor-theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.editor-theme-card { display: grid; gap: 7px; padding: 9px; border: 1px solid #dce8f0; border-radius: 10px; background: #fff; color: #45687c; text-align: left; cursor: pointer; }
.editor-theme-card:hover { border-color: #3bafb8; background: #f5fbfb; }
.editor-theme-card strong { font-size: 0.7rem; }
.editor-theme-swatches { display: flex; gap: 4px; }
.editor-theme-swatches i { width: 20px; height: 20px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }
.editor-color-list { display: grid; gap: 7px; }
.editor-color-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 8px; border: 1px solid #e4edf1; border-radius: 8px; color: #557285; font-size: 0.72rem; }
.editor-color-control { display: inline-flex; align-items: center; gap: 7px; }
.editor-color-control code { color: #8aa0af; font-size: 0.61rem; }
.editor-color-control input { width: 27px; height: 27px; padding: 0; border: 0; background: transparent; cursor: pointer; }
.editor-select { width: 100%; padding: 9px 10px; border: 1px solid #dce8f0; border-radius: 8px; background: #fff; color: #365a70; font: inherit; font-size: 0.75rem; }
.editor-sidebar-context { display: grid; gap: 7px; padding: 12px 16px; border-bottom: 1px solid #e6eef2; }
.editor-back-button { display: inline-flex; align-items: center; gap: 7px; width: fit-content; border: 0; background: transparent; color: #3bafb8; cursor: pointer; font-size: 0.75rem; font-weight: 800; }
.editor-context-kicker { color: #8aa0af; font-size: 0.64rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
@media (max-width: 760px) { .editor-sidebar { top: 58px; z-index: 1050; width: min(360px, calc(100vw - 28px)); box-shadow: -12px 0 35px rgba(31, 78, 107, 0.18); } .editor-sidebar-body { padding: 16px 14px 24px; } }
</style>
