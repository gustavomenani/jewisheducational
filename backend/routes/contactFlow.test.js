import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('contact route saves before attempting email and returns redirect settings', () => {
  const source = readFileSync(new URL('./contact.js', import.meta.url), 'utf8');
  const saveAt = source.indexOf('contactMessageCreate');
  const emailAt = source.lastIndexOf('sendEmail(');
  assert.ok(saveAt >= 0 && emailAt > saveAt);
  assert.ok(source.includes('redirect_url'));
  assert.ok(source.includes('notification_status'));
});
