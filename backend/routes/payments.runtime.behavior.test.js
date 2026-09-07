import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('payments fail closed for incomplete production Stripe and unsafe origins', () => {
  const stripe = fs.readFileSync(new URL('../utils/stripe.js', import.meta.url), 'utf8');
  const payments = fs.readFileSync(new URL('./payments.js', import.meta.url), 'utf8');
  assert.match(stripe, /enabled: !!secretKey && \(!production \|\| \(!!publishableKey && !!webhookSecret\)\)/);
  assert.match(payments, /parsed\.username \|\| parsed\.password/);
  assert.match(payments, /parsed\.search \|\| parsed\.hash/);
  assert.match(payments, /parsed\.protocol !== 'https:'/);
});

test('SMTP transport security matches the configured port in both mailer paths', () => {
  const sharedMailer = fs.readFileSync(new URL('../utils/mailer.js', import.meta.url), 'utf8');
  const authMailer = fs.readFileSync(new URL('./auth.js', import.meta.url), 'utf8');
  for (const source of [sharedMailer, authMailer]) {
    assert.match(source, /const port = Number\(process\.env\.SMTP_PORT\) \|\| 587/);
    assert.match(source, /secure: port === 465/);
  }
});
