import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('direct content editor is editor-only, text-only, and has More options', () => {
  const source = readFileSync(new URL('./EditableContentText.vue', import.meta.url), 'utf8');
  for (const token of [
    'contentTextValue', 'beginInlineContentEdit', 'setInlineContentText',
    'commitInlineContentEdit', 'cancelInlineContentEdit', 'text/plain',
    'editor:content-select', 'More options', 'contenteditable', 'getCurrentInstance',
  ]) assert.ok(source.includes(token), `Missing direct content editor behavior: ${token}`);
  assert.match(source, /builder\.editMode && builder\.canEdit/);
  assert.match(source, /event\.preventDefault\(\)/);
});
