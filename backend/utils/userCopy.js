export const USER_COPY = Object.freeze({
  invalidEmail: 'Enter a valid email address.',
  // Generic on purpose: echoing "already registered" lets anyone probe which
  // email addresses have accounts on the site.
  emailAlreadyRegistered: 'Could not create the account. Please check your details and try again.',
  invalidCredentials: 'Invalid email address or password.',
  accountBlocked: 'Account is blocked.',
  nameRequired: 'Name is required.',
  passwordMinimum: 'Password must contain at least 6 characters.',
  googleTokenRequired: 'Google token is required.',
  googleAuthenticationFailed: 'Google authentication failed.',
  passwordResetSent: 'If that email address exists, we will send password reset instructions.',
  resetTokenInvalid: 'Reset token is invalid or expired.',
});
