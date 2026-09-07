import * as db from '../db/index.js';
import { settingsToObject } from './helpers.js';

const PAYPAL_KEYS = [
  'paypal_enabled',
  'paypal_mode',
  'paypal_client_id',
  'paypal_client_secret',
  'paypal_plan_amount',
  'paypal_plan_currency',
  'paypal_plan_months',
  'paywall_plan_name',
  'paywall_plan_price',
];

export function paypalApiBase(mode) {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export async function getPayPalSettings(includeSecret = false) {
  const rows = await db.settingsGetByKeys(PAYPAL_KEYS);
  const s = settingsToObject(rows);
  const settings = {
    enabled: s.paypal_enabled === 'true',
    mode: s.paypal_mode === 'live' ? 'live' : 'sandbox',
    clientId: (s.paypal_client_id || '').trim(),
    planAmount: (s.paypal_plan_amount || '9.99').trim(),
    planCurrency: (s.paypal_plan_currency || 'USD').trim().toUpperCase(),
    planMonths: Math.max(1, Number(s.paypal_plan_months) || 12),
    planName: s.paywall_plan_name || 'Premium',
    planPrice: s.paywall_plan_price || '',
  };
  if (includeSecret) {
    settings.clientSecret = (s.paypal_client_secret || '').trim();
  }
  return settings;
}

export function maskPayPalSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(secret.length - 4, 12))}${secret.slice(-4)}`;
}

export async function getPublicPayPalConfig() {
  const settings = await getPayPalSettings();
  if (!settings.enabled || !settings.clientId) {
    return {
      enabled: false,
      clientId: '',
      mode: settings.mode,
      planName: settings.planName,
      planPrice: settings.planPrice,
      planAmount: settings.planAmount,
      planCurrency: settings.planCurrency,
      planMonths: settings.planMonths,
    };
  }
  return {
    enabled: true,
    clientId: settings.clientId,
    mode: settings.mode,
    planName: settings.planName,
    planPrice: settings.planPrice,
    planAmount: settings.planAmount,
    planCurrency: settings.planCurrency,
    planMonths: settings.planMonths,
  };
}

export async function getPayPalAccessToken(settings) {
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error('PayPal Client ID and Secret are required.');
  }
  const base = paypalApiBase(settings.mode);
  const auth = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString('base64');
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.message || 'Could not authenticate with PayPal.');
  }
  return data.access_token;
}

async function paypalRequest(path, settings, options = {}) {
  const token = await getPayPalAccessToken(settings);
  const base = paypalApiBase(settings.mode);
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details?.[0]?.description || data.message;
    throw new Error(detail || 'PayPal API error.');
  }
  return data;
}

export async function createPayPalOrder(user, settings) {
  const amount = Number(settings.planAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid plan amount.');
  }
  const value = amount.toFixed(2);
  return paypalRequest('/v2/checkout/orders', settings, {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: `premium-${user.id}`,
        custom_id: String(user.id),
        description: `${settings.planName} — ${settings.planMonths} month(s)`,
        amount: {
          currency_code: settings.planCurrency,
          value,
        },
      }],
      application_context: {
        brand_name: settings.planName,
        user_action: 'PAY_NOW',
      },
    }),
  });
}

export async function capturePayPalOrder(orderId, user, settings) {
  const order = await paypalRequest(`/v2/checkout/orders/${orderId}/capture`, settings, {
    method: 'POST',
    body: JSON.stringify({}),
  });

  if (order.status !== 'COMPLETED') {
    throw new Error('Payment was not completed.');
  }

  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (!unit || String(unit.custom_id) !== String(user.id)) {
    throw new Error('This order does not belong to the current user.');
  }
  if (capture?.status !== 'COMPLETED') {
    throw new Error('Payment capture failed.');
  }

  const expected = Number(settings.planAmount).toFixed(2);
  const paid = capture.amount?.value;
  const currency = capture.amount?.currency_code;
  if (paid !== expected || currency !== settings.planCurrency) {
    throw new Error('Payment amount does not match.');
  }

  return { order, capture };
}
