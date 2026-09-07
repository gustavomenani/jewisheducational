import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('download flow is explicitly two-step and presentations stay view-only', () => {
  const resource = read('./views/ResourceView.vue');
  const actions = read('./components/K5WorksheetActions.vue');
  const download = read('./views/DownloadView.vue');
  assert.ok(resource.includes('window.open(url, \'_blank\''));
  assert.ok(resource.includes('isPresentationFile(file)'));
  assert.equal(resource.includes('function directDownload'), false);
  assert.equal(actions.includes("trackResourceEvent('resource_download_click', file)"), false);
  assert.ok(download.includes("trackInteraction('resource_download_click'"));
  assert.ok(download.includes("/downloads/${resource.value.id}/${file.value.id}"));
});

test('editor content is edited directly in the preview with an advanced inspector fallback', () => {
  const setting = read('./builder/EditableSetting.vue');
  const text = read('./builder/EditableText.vue');
  const image = read('./builder/EditableImage.vue');
  const inspector = read('./builder/EditorInspector.vue');
  for (const source of [setting, text]) assert.ok(source.includes('contenteditable'));
  assert.ok(image.includes('type="file" accept="image/jpeg,image/png,image/webp"'));
  assert.ok(setting.includes('cleanPaste'));
  assert.ok(text.includes('cleanPaste'));
  for (const phrase of ['font_family', 'font_size', 'font_weight', 'text_align', 'opacity', 'width', 'letter_spacing']) {
    assert.ok(inspector.includes(phrase), `Missing inspector style control: ${phrase}`);
  }
  assert.ok(inspector.includes('Upload image'));
  assert.ok(inspector.includes('Remove image'));
});

test('Grades menu is keyboard-safe and does not invent levels from an empty setting', () => {
  const layout = read('./layouts/PublicLayout.vue');
  assert.ok(layout.includes("if (raw === undefined || raw === null || String(raw).trim() === '') return [];"));
  assert.ok(layout.includes('onGradesKeydown'));
  assert.ok(layout.includes('aria-expanded'));
  assert.ok(layout.includes('toggleGradesMenu'));
});

test('Grades desktop trigger has one click owner and a stable controlled menu', () => {
  const layout = read('./layouts/PublicLayout.vue');
  assert.ok(layout.includes('id="grades-menu-trigger"'));
  assert.ok(layout.includes('aria-controls="grades-menu"'));
  assert.ok(layout.includes('id="grades-menu"'));
  assert.ok(layout.includes('v-show="seriesOpen"'));
  assert.equal(layout.includes("<EditableSetting tag=\"span\" setting-key=\"nav_series_label\" :default=\"'Grades'\" @click.stop=\"toggleGradesMenu\" />"), false);
});

test('client can hide the global footer without deleting its content', () => {
  const layout = read('./layouts/PublicLayout.vue');
  const catalog = read('./builder/fieldCatalog.js');
  assert.ok(layout.includes('showFooter || (builder.editMode && builder.canEdit)'));
  assert.ok(catalog.includes("'footer_show', 'Show footer', 'boolean'"));
});

test('material type cards are visible by default and can still be hidden in the editor', () => {
  const library = read('./views/LibraryView.vue');
  const catalog = read('./builder/fieldCatalog.js');
  const materials = read('./views/admin/MaterialsView.vue');
  const theme = read('./utils/theme.js');
  const migration = read('../../backend/database/migrate.js');
  for (const key of ['library_page_head_icon_show', 'library_subtopics_show', 'library_results_heading_show']) {
    assert.ok(library.includes(`settingVisible('${key}', false)`), `Missing hidden default for ${key}`);
    assert.ok(catalog.includes(`'${key}'`), `Missing editor setting for ${key}`);
  }
  assert.ok(library.includes("settingVisible('library_material_types_show', true)"));
  assert.ok(theme.includes("library_material_types_show: 'true'"));
  assert.ok(migration.includes("['library_material_types_show', 'true']"));
  assert.ok(catalog.includes("'library_material_types_show'"));
  assert.ok(library.includes('if (!showMaterialTypes.value) return [];'));
  assert.ok(materials.includes('/resources/admin/refresh-google-slides-covers'));
  assert.ok(materials.includes('Sync Google Slides covers'));
});

test('hidden categories stay out of every public category list and category subtitles can be switched off', () => {
  const catalog = read('./builder/fieldCatalog.js');
  const library = read('./views/LibraryView.vue');
  for (const file of ['./views/HomeView.vue', './views/LibraryView.vue', './views/ResourceView.vue']) {
    assert.ok(read(file).includes('visibleCategoriesForVisitors'), `${file} must filter hidden categories for visitors`);
  }
  assert.ok(library.includes("settingVisible('library_category_subtitle_show', false)"));
  assert.ok(catalog.includes("'library_category_subtitle_show'"));
});

test('editor help card stays outside the preview interaction area', () => {
  const workspace = read('./builder/EditorWorkspace.vue');
  assert.ok(workspace.includes('.editor-help-popover { position: fixed; top: 80px; right: 18px;'));
  assert.ok(workspace.includes('z-index: 1060;'));
});

test('contact copy removes only the legacy AI boilerplate and preserves custom text', () => {
  const settings = read('../../backend/routes/settings.js');
  assert.ok(settings.includes('LEGACY_AI_CONTACT_LEADS'));
  assert.ok(settings.includes('NEUTRAL_CONTACT_LEAD'));
  assert.ok(settings.includes('replace(/\\s+/g, \' \').trim()'));
});

test('analytics distinguishes page opens from final deliveries without duplicate internal events', () => {
  const analytics = read('./analytics.js');
  const download = read('./views/DownloadView.vue');
  assert.ok(analytics.includes('options.persist !== false'));
  assert.ok(download.includes("trackInteraction('download_started', eventPayload, { persist: false })"));
  assert.ok(download.includes("trackInteraction('download_completed', eventPayload, { persist: false })"));
  assert.ok(download.includes('downloadPageOpenTracked'));
});

test('preview controls disappear when a material has no usable file', () => {
  const resource = read('./views/ResourceView.vue');
  const actions = read('./components/K5WorksheetActions.vue');
  assert.ok(resource.includes("materialActionEnabled('preview') && !!previewWorksheetFile.value"));
  assert.ok(actions.includes("!!(worksheetFile.value || bundleFile.value)"));
});

test('editor-only clickable content remains reachable by keyboard', () => {
  const resource = read('./views/ResourceView.vue');
  const download = read('./views/DownloadView.vue');
  const cta = read('./builder/blocks/CtaBlock.vue');
  const button = read('./builder/blocks/ButtonBlock.vue');
  for (const source of [resource, download, cta, button]) {
    assert.ok(source.includes('tabindex'), 'Missing editor keyboard focusability');
    assert.ok(source.includes("!== 'Enter'") && source.includes("!== ' '") , 'Missing Enter/Space handling');
  }
});

test('public catalog, navigation, and resource views use direct content text bindings', () => {
  for (const file of [
    './layouts/PublicLayout.vue',
    './components/K5TopNavItem.vue',
    './components/K5DrawerCategoryTree.vue',
    './components/K5CategorySidebar.vue',
    './views/HomeView.vue',
    './views/LibraryView.vue',
    './views/ResourceView.vue',
    './views/DownloadView.vue',
    './views/PresentationView.vue',
    './views/FavoritesView.vue',
    './views/AccountView.vue',
  ]) {
    assert.ok(read(file).includes('EditableContentText'), `${file} must bind record text directly`);
  }
  const library = read('./views/LibraryView.vue');
  assert.ok(library.includes('field="name"'));
  assert.ok(library.includes('field="description"'));
  assert.ok(library.includes('field="title"'));
  const resource = read('./views/ResourceView.vue');
  assert.ok(resource.includes("'page_layout.hero.title'"));
  assert.ok(resource.includes('field="content_description"'));
});
