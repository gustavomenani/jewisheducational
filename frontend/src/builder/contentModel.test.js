import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_QUICK_TOPICS,
  applyContentOperation,
  defaultContentSnapshot,
  normalizeContentSnapshot,
  normalizeMaterialFile,
  normalizeQuickTopics,
} from './contentModel.js';

test('quick topics normalize safely and keep a predictable order', () => {
  const topics = normalizeQuickTopics([
    { id: 'b', label: ' B ', sortOrder: 2, visible: false },
    { id: 'a', label: 'A', sortOrder: 1, targetType: 'bad' },
    { id: 'empty', label: '   ' },
  ]);
  assert.deepEqual(topics.map((topic) => topic.id), ['a', 'b']);
  assert.equal(topics[0].targetType, 'url');
  assert.equal(topics[1].visible, false);
  assert.equal(normalizeQuickTopics([]).length, 0);
  assert.equal(DEFAULT_QUICK_TOPICS.length > 0, true);
});

test('content snapshots preserve archived entities without exposing unsafe flags', () => {
  const snapshot = normalizeContentSnapshot({
    categories: [{ id: 1, name: 'Old', is_archived: 1, nav_visible: 0 }],
    materials: [{ id: 2, title: 'Draft', is_archived: '1', is_published: '0' }],
  });
  assert.equal(snapshot.categories[0].is_archived, true);
  assert.equal(snapshot.categories[0].nav_visible, false);
  assert.equal(snapshot.materials[0].is_archived, true);
  assert.equal(snapshot.materials[0].is_published, false);
  assert.equal(defaultContentSnapshot().quickTopics.length > 0, true);
});

test('create, update, archive, restore and reorder operations are reversible in the draft', () => {
  let snapshot = normalizeContentSnapshot({ categories: [], materials: [] });
  snapshot = applyContentOperation(snapshot, {
    entity: 'category', action: 'create', clientId: 'cat-temp',
    data: { name: 'Hebrew', sort_order: 0 },
  });
  snapshot = applyContentOperation(snapshot, {
    entity: 'category', action: 'update', id: 'cat-temp',
    data: { description: 'Language resources' },
  });
  assert.equal(snapshot.categories[0].description, 'Language resources');
  snapshot = applyContentOperation(snapshot, { entity: 'category', action: 'archive', id: 'cat-temp' });
  assert.equal(snapshot.categories[0].is_archived, true);
  snapshot = applyContentOperation(snapshot, { entity: 'category', action: 'restore', id: 'cat-temp' });
  assert.equal(snapshot.categories[0].is_archived, false);
  snapshot = applyContentOperation(snapshot, {
    entity: 'category', action: 'reorder', data: { items: [{ id: 'cat-temp', sort_order: 3 }] },
  });
  assert.equal(snapshot.categories[0].sort_order, 3);
});

test('material files normalize string flags and support add, archive, restore and reorder', () => {
  let snapshot = normalizeContentSnapshot({ materials: [{ id: 7, title: 'Worksheets', files: [{ id: 11, original_name: 'old.pdf', is_archived: 'false', sort_order: 1 }] }] });
  assert.equal(snapshot.materials[0].files[0].is_archived, false);
  assert.equal(normalizeMaterialFile({ id: 12, original_name: 'new.pdf', is_archived: '1' }).is_archived, true);
  snapshot = applyContentOperation(snapshot, {
    entity: 'file', action: 'add', clientId: 'file-temp', materialId: 7,
    data: { original_name: 'new.pdf', file_type: 'pdf', sort_order: 0 },
  });
  assert.equal(snapshot.materials[0].files.length, 2);
  snapshot = applyContentOperation(snapshot, { entity: 'file', action: 'archive', id: 11, materialId: 7 });
  assert.equal(snapshot.materials[0].files.find((file) => file.id === 11).is_archived, true);
  snapshot = applyContentOperation(snapshot, { entity: 'file', action: 'restore', id: 11, materialId: 7 });
  assert.equal(snapshot.materials[0].files.find((file) => file.id === 11).is_archived, false);
  snapshot = applyContentOperation(snapshot, { entity: 'file', action: 'reorder', materialId: 7, data: { items: [{ id: 11, sort_order: 0 }, { id: 'file-temp', sort_order: 1 }] } });
  assert.deepEqual(snapshot.materials[0].files.map((file) => file.sort_order), [0, 1]);
});
