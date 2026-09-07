import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('CTA links navigate publicly and select only in editor mode', () => {
  const source = read('./builder/blocks/CtaBlock.vue');
  assert.ok(source.includes(':href="builder.editMode ? undefined : p.buttonLink || \'#\'"'));
  assert.ok(source.includes('@click="onButtonClick"'));
  assert.equal(source.includes('@click.prevent.stop="onButtonClick"'), false);
});

test('resource and library failures settle loading and expose retry paths', () => {
  const resource = read('./views/ResourceView.vue');
  const library = read('./views/LibraryView.vue');
  for (const token of ['resourceError', 'finally', 'Retry']) assert.ok(resource.includes(token), `Missing resource recovery: ${token}`);
  for (const token of ['categoryError', 'loadCategories', 'lastTypesCategory = null', 'clearTimeout(searchDebounceTimer)']) {
    assert.ok(library.includes(token), `Missing library recovery: ${token}`);
  }
});

test('download and presentation views reload when route file parameters change', () => {
  const download = read('./views/DownloadView.vue');
  const presentation = read('./views/PresentationView.vue');
  for (const source of [download, presentation]) {
    assert.ok(source.includes('watch('));
    assert.ok(source.includes('route.params.slug'));
    assert.ok(source.includes('route.params.fileId'));
  }
  assert.ok(download.includes('downloadPageOpenTracked.value = false'));
  assert.ok(presentation.includes('destroyPreviewer()'));
});

test('favorite failures are presented to users instead of being swallowed', () => {
  for (const path of ['./views/ResourceView.vue', './views/FavoritesView.vue', './views/AccountView.vue']) {
    const source = read(path);
    assert.ok(source.includes('error'), `Missing favorite error state in ${path}`);
    assert.match(source, /role="alert"/);
  }
});

test('password fields have labels/IDs and a keyboard-reachable visibility toggle', () => {
  const password = read('./components/PasswordInput.vue');
  const login = read('./views/LoginView.vue');
  assert.ok(password.includes('useId'));
  assert.ok(password.includes(':aria-label="ariaLabel"'));
  assert.ok(password.includes(':aria-pressed="show"'));
  assert.equal(password.includes('tabindex="-1"'), false);
  assert.ok(login.includes('for="login-password"'));
  assert.ok(login.includes('id="login-password"'));
});

test('category menus expose controlled keyboard navigation', () => {
  const source = read('./components/K5TopNavItem.vue');
  for (const token of ['aria-haspopup', 'aria-expanded', 'aria-controls', 'role="menu"', 'onTriggerKeydown', 'onMenuKeydown', 'onFocusOut']) {
    assert.ok(source.includes(token), `Missing menu accessibility behavior: ${token}`);
  }
});

test('preview, slide, and folder dialogs support backdrop/Escape/focus behavior', () => {
  for (const path of ['./components/K5PreviewModal.vue', './components/SlideViewerModal.vue', './components/SelectFolderModal.vue']) {
    const source = read(path);
    for (const token of ['@click.self="close"', 'Escape', 'trapFocus', 'restoreFocus', 'aria-modal="true"']) {
      assert.ok(source.includes(token), `Missing modal behavior in ${path}: ${token}`);
    }
  }
});

test('admin screens expose loading/error recovery and keyboard alternatives', () => {
  for (const path of ['./views/admin/MaterialsView.vue', './views/admin/DashboardView.vue', './views/admin/CategoriesView.vue', './views/admin/UsersView.vue']) {
    const source = read(path);
    assert.ok(source.includes('loading'), `Missing loading state in ${path}`);
    assert.ok(source.includes('Retry'), `Missing retry action in ${path}`);
    assert.match(source, /role="alert"/);
  }
  const categories = read('./views/admin/CategoriesView.vue');
  assert.ok(categories.includes('onReorderKeydown'));
  assert.ok(categories.includes('Move subject up'));
  assert.ok(categories.includes('Move subject down'));
});
