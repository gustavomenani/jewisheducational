import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./UsersView.vue', import.meta.url), 'utf8');

test('users screen exposes an accessible add-user flow', () => {
  for (const phrase of ['Add user', 'Temporary password', 'Create user', 'showPassword']) {
    assert.ok(source.includes(phrase), `Missing admin user UI: ${phrase}`);
  }
  assert.ok(source.includes("api.post('/admin/users'"));
  assert.ok(source.includes('aria-modal="true"'));
});

test('created users are inserted without reloading the page', () => {
  assert.ok(source.includes('users.value.unshift(data.user)'));
  assert.ok(source.includes('success.value'));
});

