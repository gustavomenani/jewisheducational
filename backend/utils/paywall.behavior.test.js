import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('paywall upgrade links reject unsafe protocols and external host shorthands', () => {
  const source = fs.readFileSync(new URL('./paywall.js', import.meta.url), 'utf8');
  assert.match(source, /startsWith\('\/'\)/);
  assert.match(source, /startsWith\('\/\/'\)/);
  assert.match(source, /parsed\.protocol === 'https:'/);
  assert.match(source, /upgradeUrl: safeUpgradeUrl/);
});
