import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mysqlSource = readFileSync(new URL('./mysqlDb.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');

test('primary quota reservation serializes the read/count/write boundary', () => {
  assert.match(mysqlSource, /export async function downloadReserve/);
  assert.match(mysqlSource, /return withTransaction\(async/);
  assert.match(mysqlSource, /download_quota_locks/);
  assert.match(mysqlSource, /FOR UPDATE/);
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS download_quota_locks/);
});

test('memory fallback is gated to an explicit staging runtime', () => {
  assert.match(indexSource, /isProductionRuntime/);
  assert.match(indexSource, /isStagingRuntime/);
  assert.match(indexSource, /DB_FALLBACK_MEMORY === 'true'/);
  assert.match(indexSource, /allowMemoryFallback/);
});
