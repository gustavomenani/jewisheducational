const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertFirebaseConfig,
  assertFrontendEntry,
  assertPortableReleaseScripts,
  assertRobotsSource,
} = require('./verify-release.js');

test('release gate validates tracked SEO source files and Firebase rewrite ordering', () => {
  assert.doesNotThrow(assertFrontendEntry);
  assert.doesNotThrow(assertRobotsSource);
  assert.doesNotThrow(assertFirebaseConfig);
  assert.doesNotThrow(assertPortableReleaseScripts);
});
