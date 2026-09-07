import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleCategoriesForVisitors } from './categoryTree.js';

test('visitor category lists exclude hidden categories and descendants of hidden categories', () => {
  const categories = [
    { id: 1, name: 'Visible root', nav_visible: 1 },
    { id: 2, name: 'Visible child', parent_id: 1, nav_visible: 1 },
    { id: 3, name: 'Hidden root', nav_visible: 0 },
    { id: 4, name: 'Hidden child', parent_id: 3, nav_visible: 1 },
    { id: 5, name: 'Archived', nav_visible: 1, is_archived: 1 },
  ];

  assert.deepEqual(
    visibleCategoriesForVisitors(categories).map((category) => category.id),
    [1, 2],
  );
});
