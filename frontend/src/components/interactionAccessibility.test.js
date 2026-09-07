import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('password fields and login labels support keyboard and assistive technology', () => {
  const password = source('./PasswordInput.vue');
  const login = source('../views/LoginView.vue');
  assert.ok(password.includes('ariaLabel'));
  assert.ok(password.includes(':aria-pressed="show"'));
  assert.equal(password.includes('tabindex="-1"'), false);
  assert.ok(login.includes('for="login-password"'));
  assert.ok(login.includes('id="login-password"'));
  assert.ok(login.includes('for="login-email"'));
});

test('category menus expose controlled keyboard navigation', () => {
  const nav = source('./K5TopNavItem.vue');
  for (const token of ['aria-expanded', 'aria-controls', 'role="menu"', 'role="menuitem"', 'ArrowDown', 'Escape', 'focusTrigger']) {
    assert.ok(nav.includes(token), `Menu accessibility behavior missing: ${token}`);
  }
});

test('resource modals close through backdrop or Escape and restore focus', () => {
  for (const file of ['./K5PreviewModal.vue', './SlideViewerModal.vue', './SelectFolderModal.vue']) {
    const modal = source(file);
    for (const token of ['@click.self="close"', 'role="dialog"', 'aria-modal="true"', 'restoreFocus', 'focusableElements']) {
      assert.ok(modal.includes(token), `${file} missing modal behavior: ${token}`);
    }
    assert.match(modal, /(?:event|e)\.key === 'Escape'/, `${file} missing Escape handling`);
  }
});
