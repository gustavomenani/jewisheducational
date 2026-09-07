import { firebaseAuth } from '../config/firebaseAdmin.js';

export async function verifyFirebaseIdToken(idToken, authClient = firebaseAuth) {
  const decodedToken = await authClient.verifyIdToken(idToken);
  const email = String(decodedToken.email || '').trim().toLowerCase();

  if (!email) {
    throw new Error('Could not retrieve the email address from the Google account.');
  }

  return {
    email,
    name: decodedToken.name || email.split('@')[0],
    avatarUrl: decodedToken.picture || null,
    emailVerified: decodedToken.email_verified === true,
  };
}
