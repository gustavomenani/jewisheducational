/** @typedef {'free'|'paid'|'school'} AccountType */

/**
 * @param {{ account_type?: string, role?: string }} user
 * @param {boolean} hasActiveSubscription
 * @returns {AccountType}
 */
export function resolveUserPlan(user, hasActiveSubscription) {
  if (user.account_type === 'school') return 'school';
  if (user.account_type === 'paid' || hasActiveSubscription) return 'paid';
  return 'free';
}

export const PLAN_LABELS = {
  free: 'Free',
  paid: 'Paid',
  school: 'School',
};
