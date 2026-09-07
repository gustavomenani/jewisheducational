import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./resources.js', import.meta.url), 'utf8');
const memorySource = readFileSync(new URL('../db/memoryDb.js', import.meta.url), 'utf8');
const duplicateSource = source.slice(source.indexOf("router.post('/:id/duplicate'"));

test('resource duplication uses every storage adapter and copies all file metadata', () => {
  for (const phrase of [
    'db.storageStat',
    'db.storageCopy',
    'db.withTransaction',
    "filesByResource(existing.id, { includeArchived: true })",
    'action_visibility: existing.action_visibility',
    'school_only: existing.school_only',
    'is_premium: existing.is_premium',
    'thumbnail',
    'result?.insertId ?? result?.id',
  ]) {
    assert.ok(source.includes(phrase), `Missing duplication contract: ${phrase}`);
  }
  assert.ok(duplicateSource.includes('google_slides_url: existing.google_slides_url'));
  assert.ok(duplicateSource.includes('canva_url: existing.canva_url'));
  assert.ok(memorySource.includes('const isPremium = data.is_premium !== undefined'), 'Memory adapter must preserve premium state');
});

test('a failed duplication removes the database resource and copied assets', () => {
  assert.ok(source.includes('db.resourceDelete(createdResourceId)'));
  assert.ok(source.includes('db.storageDelete(storagePath)'));
  assert.ok(source.includes('No partial copy was kept.'));
  assert.equal(source.includes('if (!stream) continue;'), false);
});

test('static theme images are not treated as material-owned storage assets', () => {
  assert.ok(source.includes('Public\n// theme assets'));
  assert.ok(source.includes('return managed ?'));
});
