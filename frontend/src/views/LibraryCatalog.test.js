import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('./LibraryView.vue', import.meta.url), 'utf8');
const css = readFileSync(new URL('../assets/main.css', import.meta.url), 'utf8');

test('library uses a growing catalog instead of numbered pages', () => {
  for (const token of ['Load more materials', 'Showing', 'mergeUniqueResources', 'loadingMore', 'catalogError']) {
    assert.ok(view.includes(token), `Missing progressive catalog behavior: ${token}`);
  }
  assert.equal(view.includes('v-for="p in totalPages()"'), false);
  assert.ok(view.includes('v-if="displayResources.length"'));
});

test('material cards expose clear actions and access labels', () => {
  for (const label of ['Download', 'View slides', 'View details', 'Premium', 'Free']) {
    assert.ok(view.includes(label), `Missing visible material label: ${label}`);
  }
});

test('catalog grid has explicit responsive columns', () => {
  assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'));
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr)'));
});

test('the basic grade is explained with a beginner-facing label without changing its filter value', () => {
  const layout = readFileSync(new URL('../layouts/PublicLayout.vue', import.meta.url), 'utf8');
  assert.ok(view.includes('gradeLevelLabel(level)'));
  assert.ok(layout.includes('gradeLevelLabel(g)'));
  assert.ok(layout.includes('label: gradeLevelLabel(g)'));
  assert.ok(view.includes('gradeLevelLabel(item.grade_level)'));
});
