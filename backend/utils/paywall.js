import * as db from '../db/index.js';
import { settingsToObject } from './helpers.js';
import { getPublicPayPalConfig } from './paypal.js';
import { getPublicStripeConfig } from './stripe.js';

const KEYS = [
  'paywall_plan_name',
  'paywall_plan_price',
  'paywall_upgrade_url',
  'paywall_limit_title',
  'paywall_premium_title',
  'paypal_enabled',
  'paypal_client_id',
  'paypal_plan_amount',
  'paypal_plan_currency',
  'paypal_plan_months',
];

function safeUpgradeUrl(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '/sign-up';
  } catch {
    return '/sign-up';
  }
}

export async function getPaywallSettings() {
  const rows = await db.settingsGetByKeys(KEYS);
  const s = settingsToObject(rows);
  const [paypal, stripe] = await Promise.all([
    getPublicPayPalConfig(),
    getPublicStripeConfig(),
  ]);
  return {
    planName: s.paywall_plan_name || 'Premium',
    planPrice: s.paywall_plan_price || '',
    upgradeUrl: safeUpgradeUrl(s.paywall_upgrade_url),
    limitTitle: s.paywall_limit_title || 'Download limit reached',
    premiumTitle: s.paywall_premium_title || 'Premium exclusive resource',
    paymentsEnabled: paypal.enabled,
    paypalClientId: paypal.clientId || '',
    paypalCurrency: paypal.planCurrency || 'USD',
    paypalAmount: paypal.planAmount || '',
    paypalMonths: paypal.planMonths || 12,
    stripeEnabled: stripe.enabled,
    stripePublishableKey: stripe.publishableKey || '',
    stripePlans: stripe.plans || [],
  };
}

export function getResetMessage(period) {
  const map = {
    day: 'You can download again within 24 hours.',
    week: 'You can download again next week.',
    month: 'You can download again next month.',
    year: 'You can download again next year.',
    forever: 'This limit does not reset automatically. Subscribe to Premium to continue downloading.',
  };
  return map[period] || map.month;
}
