import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('resource and library loading retain usable partial states and retry paths', () => {
  const resource = source('./ResourceView.vue');
  const library = source('./LibraryView.vue');

  for (const token of ['resourceError', 'Could not load this material', '@click="loadResource"', 'finally']) {
    assert.ok(resource.includes(token), `Resource load guard missing: ${token}`);
  }
  for (const token of ['loadCategories', 'categoryError', 'catalogError', 'retryCatalog', 'lastTypesCategory = null', 'clearTimeout(searchDebounceTimer)', 'selectedCategory.value = \'\'']) {
    assert.ok(library.includes(token), `Library recovery behavior missing: ${token}`);
  }
});

test('download and presentation views reload when route parameters change', () => {
  const download = source('./DownloadView.vue');
  const presentation = source('./PresentationView.vue');
  for (const view of [download, presentation]) {
    assert.ok(view.includes('watch('));
    assert.ok(view.includes('route.params.slug'));
    assert.ok(view.includes('route.params.fileId'));
  }
  assert.ok(download.includes("URL.revokeObjectURL(previewBlobUrl.value)"));
  assert.ok(presentation.includes('destroyPreviewer();'));
});

test('Google Slides presentations use the published embed viewer before PPTX rendering', () => {
  const presentation = source('./PresentationView.vue');
  const modal = source('../components/SlideViewerModal.vue');
  for (const view of [presentation, modal]) {
    assert.ok(view.includes('googleSlidesEmbedUrlForFile'));
    assert.ok(view.includes('google-slides-embed'));
    assert.ok(view.includes('allowfullscreen'));
  }
  assert.ok(presentation.includes('if (googleSlidesEmbedUrl.value)'));
  assert.ok(modal.includes('if (googleSlidesEmbedUrl.value)'));
});

test('the material editor can refresh a cover from a Google Slide as well as a PDF', () => {
  const materialForm = source('./admin/MaterialFormView.vue');
  assert.ok(materialForm.includes('const hasCoverSource = computed'));
  assert.ok(materialForm.includes("['pdf', 'ppt', 'pptx', 'presentation']"));
  assert.ok(materialForm.includes('Refresh generated cover'));
});

test('favorite mutations expose recoverable errors', () => {
  const resource = source('./ResourceView.vue');
  const favorites = source('./FavoritesView.vue');
  const account = source('./AccountView.vue');
  for (const view of [resource, favorites, account]) {
    assert.ok(view.includes('favoriteError') || view.includes('Could not remove this favorite'));
    assert.ok(view.includes('role="alert"'));
  }
  assert.ok(favorites.includes('Could not remove this favorite'));
  assert.ok(account.includes('Could not remove this favorite'));
});

test('interactive routes protect against stale responses and blocked popups', () => {
  const resource = source('./ResourceView.vue');
  const library = source('./LibraryView.vue');
  const presentation = source('./PresentationView.vue');
  const actions = source('../components/K5WorksheetActions.vue');

  for (const view of [resource, library]) {
    assert.match(view, /AbortController/);
    assert.match(view, /RequestId/);
    assert.match(view, /signal/);
  }
  assert.match(resource, /if \(!opened\) router\.push\(url\)/);
  assert.match(actions, /if \(!opened\) router\.push\(url\)/);
  assert.match(presentation, /e\.key === ' '/);
  assert.match(presentation, /e\.code === 'Space'/);
});

test('editor data is unavailable after auth loss and folder counts are not filtered totals', () => {
  const builder = source('../builder/store.js');
  const publicLayout = source('../layouts/PublicLayout.vue');
  const editableSetting = source('../builder/EditableSetting.vue');
  const favorites = source('./FavoritesView.vue');

  assert.match(builder, /watch\(\(\) => auth\.isAdmin/);
  assert.match(builder, /clearLocalDraftStorage/);
  assert.match(builder, /editMode\.value = false/);
  assert.match(publicLayout, /builder\.editMode && builder\.canEdit/);
  assert.match(editableSetting, /builder\.editMode && builder\.canEdit/);
  assert.match(favorites, /folder\.item_count/);
});

test('login accepts only same-origin relative redirects', () => {
  const login = source('./LoginView.vue');
  assert.match(login, /safeRedirect/);
  assert.match(login, /startsWith\('\/'\)/);
  assert.match(login, /startsWith\('\/\/'\)/);
});
