import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { GOOGLE_ACCOUNT_PARAMETERS } from '@/auth/adminAccess';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = Boolean(config.apiKey && config.authDomain && config.projectId);
const app = configured ? initializeApp(config) : null;
export const firebaseAuth = app ? getAuth(app) : null;
const googleProvider = configured ? new GoogleAuthProvider() : null;
googleProvider?.setCustomParameters(GOOGLE_ACCOUNT_PARAMETERS);

export function isFirebaseConfigured() {
  return configured;
}

export async function getGoogleIdToken() {
  if (!firebaseAuth || !googleProvider) {
    throw new Error('Google sign-in is not configured.');
  }
  const result = await signInWithPopup(firebaseAuth, googleProvider);
  return result.user.getIdToken();
}

export async function firebaseSignOut() {
  if (!firebaseAuth) return;
  try {
    await signOut(firebaseAuth);
  } catch {
    /* ignore */
  }
}
