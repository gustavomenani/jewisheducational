import test from 'node:test';
import assert from 'node:assert/strict';
import { messages, detectLocale } from './messages.js';

test('uses English only and has no Portuguese catalog', () => {
  assert.deepEqual(Object.keys(messages), ['en']);
  assert.equal(detectLocale(), 'en');
  assert.equal(messages.en.login, 'Log in');
});
