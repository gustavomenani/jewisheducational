import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_ACCOUNT_PARAMETERS,
  refreshAuthenticatedUser,
} from './adminAccess.js';

test('Google sign-in always asks which account should be used', () => {
  assert.deepEqual(GOOGLE_ACCOUNT_PARAMETERS, { prompt: 'select_account' });
});

test('an existing session refreshes its current server-side permissions', async () => {
  let refreshes = 0;
  const auth = {
    token: 'existing-session',
    async fetchMe() {
      refreshes += 1;
    },
  };

  const refreshed = await refreshAuthenticatedUser(auth);

  assert.equal(refreshed, true);
  assert.equal(refreshes, 1);
});

test('a signed-out visitor does not make an unnecessary session request', async () => {
  let refreshes = 0;
  const auth = {
    token: null,
    async fetchMe() {
      refreshes += 1;
    },
  };

  const refreshed = await refreshAuthenticatedUser(auth);

  assert.equal(refreshed, false);
  assert.equal(refreshes, 0);
});
