import { Router } from 'express';
import * as db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalSettings,
  getPublicPayPalConfig,
} from '../utils/paypal.js';
import {
  getStripeSettings,
  getPublicStripeConfig,
  getStripeClient,
  ensurePlanPrice,
  createSubscriptionCheckoutSession,
} from '../utils/stripe.js';

const router = Router();

// First configured frontend origin — used to build Checkout return URLs so we
// never redirect to an attacker-supplied host.
function checkoutOrigin() {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = configured[0] || '';
  if (!origin) {
    const error = new Error('FRONTEND_URL is not configured.');
    error.code = 'FRONTEND_URL_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
      throw new Error('FRONTEND_URL must be an origin without credentials, path, query, or fragment');
    }
    if ((process.env.NODE_ENV === 'production' || process.env.K_SERVICE) && parsed.protocol !== 'https:') {
      throw new Error('Production FRONTEND_URL must use HTTPS');
    }
    return parsed.origin;
  } catch {
    const error = new Error('FRONTEND_URL is invalid.');
    error.code = 'FRONTEND_URL_INVALID';
    error.status = 503;
    throw error;
  }
}

router.get('/config', async (req, res) => {
  const [paypal, stripe] = await Promise.all([
    getPublicPayPalConfig(),
    getPublicStripeConfig(),
  ]);
  res.json({ paypal, stripe });
});

router.post('/stripe/create-checkout-session', authenticate, async (req, res) => {
  const settings = await getStripeSettings();
  if (!settings.enabled) {
    return res.status(400).json({ error: 'Card payments are disabled.' });
  }
  if (!settings.plans.length) {
    return res.status(400).json({ error: 'No payment plan is configured.' });
  }

  const planKey = (req.body.planKey || settings.plans[0].key || '').trim();
  const stripe = getStripeClient(settings.secretKey);
  const plan = await ensurePlanPrice(stripe, planKey);
  const origin = checkoutOrigin();
  const session = await createSubscriptionCheckoutSession(stripe, {
    user: req.user,
    plan,
    successUrl: `${origin}/account?checkout=success`,
    cancelUrl: `${origin}/account?checkout=cancel`,
  });

  res.json({ id: session.id, url: session.url });
});

router.post('/paypal/create-order', authenticate, async (req, res) => {
  const settings = await getPayPalSettings(true);
  if (!settings.enabled) {
    return res.status(400).json({ error: 'Payments are disabled.' });
  }
  if (!settings.clientId || !settings.clientSecret) {
    return res.status(400).json({ error: 'PayPal is not configured.' });
  }

  const order = await createPayPalOrder(req.user, settings);
  res.json({ orderId: order.id });
});

router.post('/paypal/capture-order', authenticate, async (req, res) => {
  const orderId = (req.body.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'Invalid order.' });

  const settings = await getPayPalSettings(true);
  if (!settings.enabled) {
    return res.status(400).json({ error: 'Payments are disabled.' });
  }

  await capturePayPalOrder(orderId, req.user, settings);

  let plan = await db.planFindPremium();
  if (!plan) {
    const result = await db.planCreatePremium();
    plan = { id: result.insertId };
  }

  await db.subscriptionCancelActive(req.user.id);
  await db.subscriptionActivate(req.user.id, plan.id, settings.planMonths);
  await db.userUpdate(req.user.id, { account_type: 'paid' });

  const subscription = await db.subscriptionGetStatus(req.user.id);
  res.json({
    message: 'Premium enabled successfully!',
    subscription,
    isPremium: true,
  });
});

export default router;
