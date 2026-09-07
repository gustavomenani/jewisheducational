import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('interaction analytics exposes the client event helper and approved event names', () => {
  const source = readFileSync(new URL('./analytics.js', import.meta.url), 'utf8');
  assert.ok(source.includes('export function trackInteraction'));
  for (const eventName of [
    'resource_preview_open',
    'resource_download_click',
    'download_page_open',
    'download_completed',
  ]) {
    assert.ok(source.includes(eventName), `Missing analytics event: ${eventName}`);
  }
  assert.ok(source.includes("api.post('/analytics/event'"));
  assert.ok(!source.includes('user_email: userEmail'));
});

test('resource and download views emit the interaction events at the user action boundaries', () => {
  const resourceView = readFileSync(new URL('./views/ResourceView.vue', import.meta.url), 'utf8');
  const downloadView = readFileSync(new URL('./views/DownloadView.vue', import.meta.url), 'utf8');
  assert.ok(resourceView.includes("trackInteraction('resource_preview_open'"));
  assert.ok(resourceView.includes('openDownloadPage(file)'));
  assert.equal(resourceView.includes("trackInteraction('resource_download_click'"), false);
  assert.equal(resourceView.includes("api.get(`/downloads/${resource.value.id}/${file.id}`"), false);
  assert.ok(downloadView.includes("trackInteraction('download_page_open'"));
  assert.ok(downloadView.includes("trackInteraction('resource_download_click'"));
  assert.ok(downloadView.includes("trackInteraction('download_started'"));
  assert.ok(downloadView.includes("trackInteraction('download_completed'"));
  assert.ok(downloadView.includes('downloadPageOpenTracked'));
});
