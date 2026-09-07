import * as db from '../db/index.js';

export async function hasActiveSubscription(userId) {
  return db.subscriptionHasActive(userId);
}

export async function getSubscriptionStatus(userId) {
  return db.subscriptionGetStatus(userId);
}
