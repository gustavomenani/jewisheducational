import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeLevelLabel } from './gradeLevels.js';

test('explains legacy basic grade values without changing other labels', () => {
  assert.equal(gradeLevelLabel('Basic'), 'Beginner');
  assert.equal(gradeLevelLabel('Base'), 'Beginner');
  assert.equal(gradeLevelLabel('Intermediate'), 'Intermediate');
  assert.equal(gradeLevelLabel('Advanced'), 'Advanced');
});
