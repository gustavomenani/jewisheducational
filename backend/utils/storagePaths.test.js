import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFileName, normalizeFileStoragePath, normalizeImportedStoragePath } from './storagePaths.js';

test('storage paths normalize legacy file and upload prefixes', () => {
  assert.equal(normalizeFileStoragePath('one.pdf'), 'files/one.pdf');
  assert.equal(normalizeFileStoragePath('files/one.pdf'), 'files/one.pdf');
  assert.equal(normalizeFileStoragePath('/uploads/files/one.pdf'), 'files/one.pdf');
  assert.equal(normalizeFileName('/uploads/files/one.pdf'), 'one.pdf');
  assert.equal(normalizeImportedStoragePath('covers/cover.webp'), 'covers/cover.webp');
});
