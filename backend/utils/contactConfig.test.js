import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTACT_EMAIL,
  isValidContactEmail,
  isValidContactRedirect,
  normalizeContactEmail,
  normalizeContactRedirect,
  normalizeRedirectDelay,
  escapeHtml,
} from './contactConfig.js';

test('contact defaults and safe redirects are normalized', () => {
  assert.equal(DEFAULT_CONTACT_EMAIL, 'jewisheducationalresources1@gmail.com');
  assert.equal(normalizeContactEmail(' CLIENT@EXAMPLE.COM '), 'client@example.com');
  assert.equal(normalizeContactEmail('invalid'), DEFAULT_CONTACT_EMAIL);
  assert.equal(isValidContactEmail('client@example.com'), true);
  assert.equal(isValidContactEmail('invalid'), false);
  assert.equal(normalizeContactRedirect('/thank-you'), '/thank-you');
  assert.equal(normalizeContactRedirect('https://example.com/thanks'), 'https://example.com/thanks');
  assert.equal(normalizeContactRedirect('//evil.example'), '');
  assert.equal(normalizeContactRedirect('javascript:alert(1)'), '');
  assert.equal(isValidContactRedirect(''), true);
  assert.equal(isValidContactRedirect('/thank-you'), true);
  assert.equal(isValidContactRedirect('http://example.com'), false);
});

test('redirect delay and HTML escaping are bounded', () => {
  assert.equal(normalizeRedirectDelay(-1), 0);
  assert.equal(normalizeRedirectDelay(4.9), 4);
  assert.equal(normalizeRedirectDelay(99), 10);
  assert.equal(escapeHtml('<b>A&B</b>'), '&lt;b&gt;A&amp;B&lt;/b&gt;');
});
