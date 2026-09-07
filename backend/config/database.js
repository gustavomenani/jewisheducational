export function isFirestoreBackend() {
  return process.env.DB_DRIVER === 'firestore'
    || !!process.env.K_SERVICE
    || !!process.env.FUNCTIONS_EMULATOR;
}
