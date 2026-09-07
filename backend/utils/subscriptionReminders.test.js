import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPremiumExpiryReminder } from './subscriptionReminders.js';

test('subscription reminder always links to the English account route', () => {
  const email = buildPremiumExpiryReminder({ name: 'Ada' }, { ends_at: '2026-08-01' });
  assert.match(email.subject, /Premium subscription expires soon/);
  assert.match(email.html, /\/my-account/);
  assert.doesNotMatch(email.html, /minha-conta|Seu Premium|Olá/);
});
