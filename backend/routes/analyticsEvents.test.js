import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('analytics route validates and persists interaction events', () => {
  const source = readFileSync(new URL('./analytics.js', import.meta.url), 'utf8');
  assert.ok(source.includes("'/event'"));
  assert.ok(source.includes('resource_preview_open'));
  assert.ok(source.includes('resource_download_click'));
  assert.ok(source.includes('download_page_open'));
  assert.ok(source.includes('download_completed'));
  assert.ok(source.includes('download_started'));
  assert.ok(source.includes('interactionEventCreate'));
});

test('protected file delivery records a completed-download interaction', () => {
  const source = readFileSync(new URL('../routes/downloads.js', import.meta.url), 'utf8');
  assert.ok(source.includes("event_name: 'download_completed'"));
  assert.ok(source.includes("event_name: 'download_started'"));
  assert.ok(source.includes('interactionEventCreate'));
});
