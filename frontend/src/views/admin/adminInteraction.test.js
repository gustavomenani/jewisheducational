import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('admin screens expose loading and retryable error states', () => {
  const materials = source('./MaterialsView.vue');
  const dashboard = source('./DashboardView.vue');
  const categories = source('./CategoriesView.vue');
  const users = source('./UsersView.vue');

  for (const view of [materials, dashboard, categories, users]) {
    assert.ok(view.includes('loading'));
    assert.ok(view.includes('role="status"'));
    assert.ok(view.includes('role="alert"'));
    assert.ok(view.includes('Retry'));
  }
  assert.ok(materials.includes('Promise.allSettled'));
  assert.ok(materials.includes('categoryError'));
  assert.ok(dashboard.includes('finally'));
  assert.ok(users.includes('async function loadUsers'));
});

test('category ordering has keyboard alternatives to drag and drop', () => {
  const categories = source('./CategoriesView.vue');
  for (const token of ['moveCategory', 'onReorderKeydown', 'ArrowUp', 'ArrowDown', 'aria-label="Move subject up"', 'aria-label="Move subject down"']) {
    assert.ok(categories.includes(token), `Keyboard ordering behavior missing: ${token}`);
  }
});

test('admin controls expose names for icon-only actions and dialogs', () => {
  const users = source('./UsersView.vue');
  const categories = source('./CategoriesView.vue');
  assert.ok(users.includes('aria-label="Search users"'));
  assert.ok(users.includes(':aria-label="u.is_blocked ? `Unblock ${u.name}` : `Block ${u.name}`"'));
  assert.ok(users.includes('createUserModal'));
  assert.ok(categories.includes('aria-label="Delete subject"'));
  assert.ok(categories.includes(':aria-label="`Reorder ${cat.name}`"'));
});

test('admin mobile navigation and material folders expose keyboard state', () => {
  const layout = source('../../layouts/AdminLayout.vue');
  const folder = source('../../components/admin/AdminCategoryFolder.vue');
  assert.ok(layout.includes('aria-controls="admin-sidebar"'));
  assert.ok(layout.includes(':aria-expanded="mobileOpen"'));
  assert.ok(layout.includes("event.key !== 'Escape'"));
  assert.ok(folder.includes(':aria-expanded="expanded"'));
  assert.ok(folder.includes(':aria-controls="`admin-folder-body-${node.id}`"'));
});
