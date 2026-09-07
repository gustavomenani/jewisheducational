import test from 'node:test';
import assert from 'node:assert/strict';
import { USER_COPY } from './userCopy.js';

test('backend error strings are English', () => {
  assert.equal(USER_COPY.invalidEmail, 'Enter a valid email address.');
  assert.equal(USER_COPY.emailAlreadyRegistered, 'Could not create the account. Please check your details and try again.');
});
