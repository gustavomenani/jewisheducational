export const GOOGLE_ACCOUNT_PARAMETERS = Object.freeze({
  prompt: 'select_account',
});

export async function refreshAuthenticatedUser(auth) {
  if (!auth.token) return false;
  await auth.fetchMe();
  return true;
}
