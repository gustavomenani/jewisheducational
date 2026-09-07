import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('contact settings are editable and homepage consumes redirect response', () => {
  const settings = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../HomeView.vue', import.meta.url), 'utf8');
  for (const key of ['contact_notify_email', 'contact_redirect_url', 'contact_redirect_delay']) {
    assert.ok(settings.includes(key), `Missing contact setting: ${key}`);
  }
  assert.ok(home.includes('data.redirect_url'));
  assert.ok(home.includes('window.location.assign'));
  assert.ok(home.includes('Edit background image'));
  assert.ok(home.includes('Edit background color'));
  assert.ok(home.includes('section_contact_background'));
});
