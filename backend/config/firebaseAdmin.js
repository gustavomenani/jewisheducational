import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'jewish-educational-resources';
const storageBucket = process.env.STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

if (!getApps().length) {
  initializeApp({ projectId, storageBucket });
}

export const firestore = getFirestore();
export const firebaseAuth = getAuth();
export const bucket = getStorage().bucket(storageBucket);
