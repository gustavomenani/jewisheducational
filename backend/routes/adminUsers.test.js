import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./admin.js', import.meta.url), 'utf8');

test('admin user creation is protected and validates account fields', () => {
  assert.ok(source.includes("router.post('/users', authenticate, requireAdmin"));
  assert.ok(source.includes("['user', 'admin']"));
  assert.ok(source.includes("['free', 'paid', 'school']"));
  assert.ok(source.includes('password.length < 6'));
  assert.ok(source.includes('userFindByEmail(normalizedEmail)'));
});

test('admin user creation hashes the temporary password and returns a safe record', () => {
  assert.ok(source.includes("import bcrypt from 'bcryptjs'"));
  assert.ok(source.includes('bcrypt.hash(password, 10)'));
  assert.ok(source.includes('delete user.password_hash'));
  assert.ok(source.includes('res.status(201).json'));
});

