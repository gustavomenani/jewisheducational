import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { setup } = await import('./setup.js?reliability-setup');

test('db setup applies schema, switches database, then runs migrations', async () => {
  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(['query', String(sql).slice(0, 32)]);
      return [[]];
    },
    async changeUser() {
      calls.push(['changeUser']);
    },
    async execute(sql) {
      const text = String(sql);
      calls.push(['execute', text.slice(0, 32)]);
      if (text.includes('SELECT id FROM users')) return [[]];
      if (text.includes('SELECT COUNT(*) AS total FROM categories')) return [[{ total: 0 }]];
      return [[]];
    },
  };

  await setup(connection, async () => {
    calls.push(['migrate']);
  });

  const schemaQuery = calls.findIndex(([type]) => type === 'query');
  const changeUser = calls.findIndex(([type]) => type === 'changeUser');
  const migration = calls.findIndex(([type]) => type === 'migrate');
  assert.ok(schemaQuery >= 0);
  assert.ok(changeUser > schemaQuery);
  assert.ok(migration > changeUser);
  assert.ok(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').includes('CREATE TABLE IF NOT EXISTS stripe_webhook_events'));
});

test('production setup does not contain a default administrator password', () => {
  const source = fs.readFileSync(new URL('./setup.js', import.meta.url), 'utf8');
  assert.match(source, /ADMIN_EMAIL/);
  assert.match(source, /ADMIN_PASSWORD/);
  assert.match(source, /Production database setup requires/);
  assert.doesNotMatch(source, /console\.log\('Admin criado: admin@example\.com \/ admin123'\)/);
});
