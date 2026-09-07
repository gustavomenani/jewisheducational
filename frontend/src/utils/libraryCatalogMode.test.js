import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowLibraryCatalog } from './libraryCatalogMode.js';

test('the Library root starts with subjects only, while clicked subjects and searches retain the catalog', () => {
  assert.equal(shouldShowLibraryCatalog({}), false);
  assert.equal(shouldShowLibraryCatalog({ categorySlug: 'elul' }), true);
  assert.equal(shouldShowLibraryCatalog({ hasSearchFilters: true }), true);
  assert.equal(shouldShowLibraryCatalog({ hasSearchFilters: true, gradeLanding: true }), false);
  assert.equal(shouldShowLibraryCatalog({ categorySlug: 'elul', gradeLanding: true }), true);
  assert.equal(shouldShowLibraryCatalog({ rootCatalogEnabled: true }), true);
});
