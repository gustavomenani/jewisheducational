import Stripe from 'stripe';
import * as db from '../db/index.js';
import { settingsToObject } from './helpers.js';

// Managed Payments is a preview feature: every request that touches it must pin
// this API version via the per-request `Stripe-Version` header. (stripe-node
// only honors the version through a header override, not a per-request option.)
export const STRIPE_PREVIEW_VERSION = '2026-02-25.preview';
const PREVIEW_REQUEST_OPTIONS = { headers: { 'Stripe-Version': STRIPE_PREVIEW_VERSION } };

// Vários planos (ex.: "Pais", "Escolas") ficam num único settings key, como
// JSON — mesmo padrão já usado para "Tipos de material". Cada plano tem seu
// próprio preço/ícone/cor e seu próprio Stripe price id (criado sob demanda,
// na primeira vez que alguém tenta assinar aquele plano).
const PLANS_KEY = 'stripe_plans';
const SETTING_KEYS = [PLANS_KEY, 'stripe_plan_months', 'paywall_plan_name', 'paywall_plan_price'];

export const STRIPE_PLAN_ICONS = ['bi-people', 'bi-mortarboard', 'bi-star', 'bi-briefcase', 'bi-house-heart', 'bi-building', 'bi-heart', 'bi-award'];
export const STRIPE_PLAN_COLORS = ['#3bafb8', '#5d6dbe', '#89d14f', '#f0a030', '#e05d5d', '#a970d6'];

function legacyPlansFromSettings(s) {
  return [{
    key: 'premium',
    name: s.paywall_plan_name || 'Premium',
    price_display: s.paywall_plan_price || '',
    price_cents: 0,
    months: Math.max(1, Number(s.stripe_plan_months) || 1),
    icon: STRIPE_PLAN_ICONS[0],
    color: STRIPE_PLAN_COLORS[0],
    tier: 'standard',
    stripe_price_id: '',
  }];
}

// Nível de acesso do plano: 'standard' (Pais e professores) ou 'school' (Escola).
function normalizeTier(tier) {
  return tier === 'school' ? 'school' : 'standard';
}

export function parseStripePlans(raw, settingsObj = {}) {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((p, i) => ({
          key: p.key || `plan-${i}`,
          name: p.name || 'Premium',
          price_display: p.price_display || '',
          price_cents: Math.max(0, Math.round(Number(p.price_cents) || 0)),
          months: Math.max(1, Number(p.months) || 1),
          icon: p.icon || STRIPE_PLAN_ICONS[i % STRIPE_PLAN_ICONS.length],
          color: p.color || STRIPE_PLAN_COLORS[i % STRIPE_PLAN_COLORS.length],
          tier: normalizeTier(p.tier),
          stripe_price_id: p.stripe_price_id || '',
        }));
      }
    } catch {
      /* formato antigo/corrompido — cai no plano único legado abaixo */
    }
  }
  return legacyPlansFromSettings(settingsObj);
}

// API keys live in the environment (never the datastore), per project policy.
export async function getStripeSettings() {
  const rows = await db.settingsGetByKeys(SETTING_KEYS);
  const s = settingsToObject(rows);
  const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
  const production = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
  const publishableKey = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  return {
    enabled: !!secretKey && (!production || (!!publishableKey && !!webhookSecret)),
    secretKey,
    publishableKey,
    webhookSecret,
    plans: parseStripePlans(s[PLANS_KEY], s),
  };
}

export async function getPublicStripeConfig() {
  const settings = await getStripeSettings();
  return {
    enabled: settings.enabled,
    publishableKey: settings.publishableKey,
    plans: settings.plans.map((p) => ({
      key: p.key,
      name: p.name,
      price_display: p.price_display,
      icon: p.icon,
      color: p.color,
      months: p.months,
      tier: p.tier || 'standard',
    })),
  };
}

export async function saveStripePlans(plans) {
  const settings = await getStripeSettings();
  const existingByKey = new Map(settings.plans.map((p) => [p.key, p]));
  const cleaned = (Array.isArray(plans) ? plans : []).map((p, i) => {
    const key = (p.key || `plan-${i}`).trim() || `plan-${i}`;
    const priceCents = Math.max(0, Math.round(Number(p.price_cents) || 0));
    const existing = existingByKey.get(key);
    // Preço do Stripe não pode ser editado depois de criado — se o valor
    // mudou, limpa o id salvo pra criar um novo preço na próxima assinatura.
    const priceChanged = existing && existing.price_cents !== priceCents;
    return {
      key,
      name: (p.name || 'Premium').trim(),
      price_display: (p.price_display || '').trim(),
      price_cents: priceCents,
      months: Math.max(1, Number(p.months) || 1),
      icon: p.icon || STRIPE_PLAN_ICONS[0],
      color: p.color || STRIPE_PLAN_COLORS[0],
      tier: normalizeTier(p.tier),
      stripe_price_id: priceChanged ? '' : (existing?.stripe_price_id || ''),
    };
  });
  await db.settingsUpsert(PLANS_KEY, JSON.stringify(cleaned));
  return cleaned;
}

// Leave the API version empty at initialization; the preview version is sent
// per request through the `apiVersion` option instead.
export function getStripeClient(secretKey) {
  if (!secretKey) throw new Error('Stripe is not configured.');
  return new Stripe(secretKey);
}

// Blueprint: "Create a product" — cria o produto/preço recorrente de UM
// plano específico (por key) e persiste o price id pra reaproveitar depois.
export async function ensurePlanPrice(stripe, planKey) {
  const settings = await getStripeSettings();
  const plan = settings.plans.find((p) => p.key === planKey) || settings.plans[0];
  if (!plan) throw new Error('No payment plan is configured.');
  if (plan.stripe_price_id) return plan;

  const product = await stripe.products.create(
    {
      name: plan.name,
      description: `${plan.name} subscription`,
      tax_code: 'txcd_10103100',
      default_price_data: {
        unit_amount: plan.price_cents || 1000,
        currency: 'usd',
        recurring: { interval: 'month' },
      },
    },
    PREVIEW_REQUEST_OPTIONS
  );

  const priceId =
    typeof product.default_price === 'string'
      ? product.default_price
      : product.default_price?.id;
  if (!priceId) throw new Error('Stripe did not return the product’s default price.');

  plan.stripe_price_id = priceId;
  const updated = settings.plans.map((p) => (p.key === plan.key ? plan : p));
  await db.settingsUpsert(PLANS_KEY, JSON.stringify(updated));
  return plan;
}

// Blueprint: "Create a Checkout Session" — enable managed payments and pin the
// preview version. We tie the session to the user (e o plano escolhido) so o
// webhook consegue ativar o período certo.
export async function createSubscriptionCheckoutSession(stripe, { user, plan, successUrl, cancelUrl }) {
  return stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      managed_payments: { enabled: true },
      client_reference_id: String(user.id),
      customer_email: user.email || undefined,
      metadata: {
        userId: String(user.id),
        planKey: plan.key,
        months: String(plan.months),
        tier: plan.tier === 'school' ? 'school' : 'standard',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    },
    PREVIEW_REQUEST_OPTIONS
  );
}

function toIdString(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

// Blueprint: "Listen for checkout.session.completed" — activate the user's
// premium subscription and persist the Stripe customer/subscription ids.
// A duração vem do plano escolhido no checkout (metadata.months), não de um
// valor global — cada plano pode conceder um período diferente.
export async function fulfillCheckoutSession(session) {
  const userId = Number(session.client_reference_id || session.metadata?.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('Checkout session has no associated user.');
  }

  const user = await db.userFindById(userId);
  if (!user) throw new Error('Checkout user not found.');

  const stripeSubscriptionId = toIdString(session.subscription);
  // If Stripe retries after fulfillment succeeded but before webhook
  // bookkeeping completed, the user record already carries the same
  // subscription and an active entitlement. Treat that retry as a no-op.
  if (stripeSubscriptionId
    && user.stripe_subscription_id === stripeSubscriptionId
    && await db.subscriptionHasActive(userId)) {
    return;
  }

  const months = Math.max(1, Number(session.metadata?.months) || 1);
  const tier = session.metadata?.tier === 'school' ? 'school' : 'standard';

  const planKey = String(session.metadata?.planKey || 'premium').trim().toLowerCase();
  const stripeSettings = await getStripeSettings();
  const configuredPlan = stripeSettings.plans.find((candidate) => candidate.key === planKey);
  if (!configuredPlan) {
    throw new Error('The selected Stripe plan is no longer configured.');
  }

  let plan = await db.planFindBySlug(planKey);
  if (!plan) {
    const result = planKey === 'premium'
      ? await db.planCreatePremium()
      : await db.planCreateFromConfig({
        name: configuredPlan.name,
        slug: planKey,
        description: `${configuredPlan.name} subscription`,
        price: Number(configuredPlan.price_cents || 0) / 100,
        interval_type: 'monthly',
      });
    plan = { id: result.insertId };
  }

  await db.subscriptionCancelActive(userId);
  await db.subscriptionActivate(userId, plan.id, months, tier);
  await db.userUpdate(userId, {
    account_type: tier === 'school' ? 'school' : 'paid',
    stripe_customer_id: toIdString(session.customer),
    stripe_subscription_id: stripeSubscriptionId,
  });
}

// Claim an event before applying its business effect. Stripe retries delivery,
// and the event id is the stable idempotency key shared by all webhook payloads.
export async function processStripeWebhookEvent(event, {
  database = db,
  settings = null,
  fulfill = fulfillCheckoutSession,
  clientFactory = getStripeClient,
} = {}) {
  const eventId = String(event?.id || '').trim();
  if (!eventId) {
    const error = new Error('Stripe webhook event id is required.');
    error.code = 'STRIPE_EVENT_ID_REQUIRED';
    error.status = 400;
    throw error;
  }

  const claimed = await database.stripeWebhookEventClaim(eventId);
  if (!claimed) return { received: true, duplicate: true, eventId };

  let fulfillmentApplied = false;
  try {
    if (event.type === 'checkout.session.completed') {
      // Snapshot events contain the complete session. Thin events may only
      // contain a reference, so retrieve the session before fulfilling it.
      const raw = event.data?.object || {};
      let session = raw;
      const sessionId = raw.id || event.related_object?.id;
      if (sessionId && !raw.client_reference_id && !raw.metadata?.userId) {
        if (!settings?.secretKey) throw new Error('Stripe is not configured.');
        const stripe = clientFactory(settings.secretKey);
        session = await stripe.checkout.sessions.retrieve(sessionId, PREVIEW_REQUEST_OPTIONS);
      }
      await fulfill(session);
      // Once the business effect has returned successfully, keep the event
      // claim even if the bookkeeping update below fails. Releasing here
      // would allow Stripe's retry to apply the subscription twice after a
      // crash or transient database error between fulfillment and completion.
      fulfillmentApplied = true;
    }
    await database.stripeWebhookEventComplete(eventId);
    return { received: true, duplicate: false, eventId };
  } catch (error) {
    if (!fulfillmentApplied) {
      await database.stripeWebhookEventRelease(eventId).catch(() => {});
    }
    throw error;
  }
}

// Webhook endpoint handler. Mounted with a raw body parser so the Stripe
// signature can be verified (Cloud Functions exposes it as req.rawBody).
export async function handleStripeWebhook(req, res) {
  const settings = await getStripeSettings();
  if (!settings.enabled) {
    return res.status(400).json({ error: 'Stripe is not configured.' });
  }

  const signature = req.headers['stripe-signature'];
  const rawBody = req.rawBody || req.body;

  let event;
  try {
    const stripe = getStripeClient(settings.secretKey);
    if (settings.webhookSecret) {
      event = stripe.webhooks.constructEvent(rawBody, signature, settings.webhookSecret);
    } else if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE) {
      // Fail closed in deployed environments: without the signing secret any
      // forged checkout.session.completed payload would grant free premium.
      return res.status(500).json({ error: 'Stripe webhook secret is not configured.' });
    } else {
      // Local development only: accept the payload without verifying.
      console.warn('[Stripe] Processing an unsigned webhook payload (local development).');
      event = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString()) : rawBody;
    }
  } catch (err) {
    return res.status(400).json({ error: `Invalid webhook: ${err.message}` });
  }

  try {
    const result = await processStripeWebhookEvent(event, { settings });
    return res.json(result);
  } catch (err) {
    console.error('Could not process Stripe webhook:', err.message);
    return res.status(err.status || 500).json({
      error: err.status === 400 ? err.message : 'Could not process the webhook.',
    });
  }
}
