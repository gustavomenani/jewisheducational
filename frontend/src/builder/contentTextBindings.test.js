import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contentTextBinding,
  contentTextPatch,
  contentTextValue,
  isContentTextBinding,
} from './contentTextBindings.js';

test('only explicit owner-managed text fields are bindable', () => {
  assert.equal(isContentTextBinding('category', 'name'), true);
  assert.equal(isContentTextBinding('material', 'content_description'), true);
  assert.equal(isContentTextBinding('topic', 'label'), true);
  assert.equal(isContentTextBinding('material', 'slug'), false);
  assert.equal(isContentTextBinding('file', 'original_name'), false);
  assert.equal(contentTextBinding('material', 'title').required, true);
});

test('a hero override is read and patched without mutating the source item', () => {
  const item = { page_layout: JSON.stringify({ hero: { title: 'Old hero' } }) };
  const patch = contentTextPatch(item, 'material', 'page_layout.hero.title', 'New hero');
  assert.equal(contentTextValue(item, 'material', 'page_layout.hero.title'), 'Old hero');
  assert.equal(JSON.parse(patch.page_layout).hero.title, 'New hero');
  assert.equal(JSON.parse(item.page_layout).hero.title, 'Old hero');
});

test('plain record values preserve intentional empty text', () => {
  assert.equal(contentTextValue({ description: '' }, 'material', 'description'), '');
  assert.deepEqual(contentTextPatch({ name: 'Old' }, 'category', 'name', ''), { name: '' });
});
