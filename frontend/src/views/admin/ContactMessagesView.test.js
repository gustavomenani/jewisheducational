import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('admin contact inbox exposes message actions', () => {
  const source = readFileSync(new URL('./ContactMessagesView.vue', import.meta.url), 'utf8');
  for (const text of ['Contact Messages', 'Mark as read', 'Mark as unread', 'Reply', 'Delete']) {
    assert.ok(source.includes(text), `Missing inbox copy: ${text}`);
  }
});
