import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFirebaseIdToken } from './verifyFirebaseToken.js';

test('Google sign-in verifies Firebase ID tokens without a duplicated API key', async () => {
  const previousGoogleApiKey = process.env.GOOGLE_API_KEY;
  const previousFirebaseApiKey = process.env.FIREBASE_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.FIREBASE_API_KEY;

  const calls = [];
  const authClient = {
    async verifyIdToken(idToken) {
      calls.push(idToken);
      return {
        email: 'Teacher@Example.com',
        name: 'Teacher Example',
        picture: 'https://example.com/avatar.png',
        email_verified: true,
      };
    },
  };

  try {
    const profile = await verifyFirebaseIdToken('valid-firebase-token', authClient);

    assert.deepEqual(calls, ['valid-firebase-token']);
    assert.deepEqual(profile, {
      email: 'teacher@example.com',
      name: 'Teacher Example',
      avatarUrl: 'https://example.com/avatar.png',
      emailVerified: true,
    });
  } finally {
    if (previousGoogleApiKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previousGoogleApiKey;
    if (previousFirebaseApiKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = previousFirebaseApiKey;
  }
});
