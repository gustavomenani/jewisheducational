import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_BATCH_SIZE,
  hasMoreResources,
  mergeUniqueResources,
} from './catalogPagination.js';

test('catalog batches contain 24 materials', () => {
  assert.equal(CATALOG_BATCH_SIZE, 24);
});

test('incremental results append without duplicate ids', () => {
  assert.deepEqual(
    mergeUniqueResources([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]),
    [{ id: 1 }, { id: 2 }, { id: 3 }]
  );
});

test('catalog reports whether another batch exists', () => {
  assert.equal(hasMoreResources([{ id: 1 }], 2), true);
  assert.equal(hasMoreResources([{ id: 1 }, { id: 2 }], 2), false);
});

