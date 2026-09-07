import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { resolveUserPlan } from '../utils/userPlan.js';
import {
  getPayPalAccessToken,
  getPayPalSettings,
  maskPayPalSecret,
} from '../utils/paypal.js';
import { getStripeSettings, saveStripePlans } from '../utils/stripe.js';

const router = Router();

function booleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return value === true || value === 1;
}

function isDuplicateUserError(error) {
  return error?.status === 409
    || ['ER_DUP_ENTRY', 'ER_DUPLICATE_ENTRY', 'DUPLICATE_USER_EMAIL', 'DUPLICATE_EMAIL', '23505'].includes(error?.code);
}

// Mostra prefixo + últimos 4 da chave; a secret live nunca é exposta inteira.
function maskKey(key) {
  if (!key) return '';
  const k = String(key);
  if (k.length <= 12) return '••••';
  return `${k.slice(0, 8)}••••${k.slice(-4)}`;
}

router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
  const users = await db.userCount();
  const resources = await db.resourceAdminList();
  const downloads = await db.downloadCount();
  const categories = await db.categoryListAll();
  const recentDownloads = await db.downloadRecent(10);
  const topResources = await db.resourceTopByDownloads(5);
  const userTotal = Number(users?.total ?? users ?? 0);

  res.json({
    stats: {
      users: userTotal,
      resources: resources.length,
      downloads: downloads.total,
      categories: categories.length,
    },
    recentDownloads,
    topResources,
  });
});

router.get('/users', authenticate, requireAdmin, async (req, res) => {
  const userResult = await db.userList();
  const users = Array.isArray(userResult) ? userResult : (userResult?.users || []);
  const enriched = await Promise.all(users.map(async (user) => {
    const hasPremium = await db.subscriptionHasActive(user.id);
    const plan = resolveUserPlan(user, hasPremium);
    const { password_hash, ...safe } = user;
    return { ...safe, plan, has_premium: hasPremium };
  }));
  res.json({ users: enriched });
});

router.post('/users', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'user');
  const accountType = String(req.body.account_type || 'free');
  const allowedRoles = ['user', 'admin'];
  const allowedPlans = ['free', 'paid', 'school'];

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Temporary password must contain at least 6 characters.' });
  }
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Select a valid role.' });
  }
  if (!allowedPlans.includes(accountType)) {
    return res.status(400).json({ error: 'Select a valid plan.' });
  }

  const existing = await db.userFindByEmail(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'Email address is already in use.' });

  const password_hash = await bcrypt.hash(password, 10);
  let result;
  try {
    result = await db.userCreate({
      name,
      email: normalizedEmail,
      password_hash,
      role,
      account_type: accountType,
      signup_method: 'admin',
      signup_source: 'Admin panel',
    });
  } catch (error) {
    if (isDuplicateUserError(error)) return res.status(409).json({ error: 'Email address is already in use.' });
    throw error;
  }
  const userId = result.insertId ?? result.id;

  // MySQL and the resilient local database use a narrower create statement;
  // persist the selected plan explicitly so every backend behaves the same.
  await db.userUpdate(userId, { account_type: accountType });

  const user = await db.userFindById(userId);
  delete user.password_hash;
  res.status(201).json({
    user: {
      ...user,
      plan: resolveUserPlan(user, false),
      has_premium: accountType === 'paid' || accountType === 'school',
    },
  });
});

router.put('/users/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, email, role, is_blocked, account_type } = req.body;
  const existing = await db.userFindById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found.' });

  const allowedRoles = ['user', 'admin'];
  if (role !== undefined && !allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Select a valid role.' });
  }

  if (email !== undefined && email !== existing.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    const dup = await db.userFindByEmail(email);
    if (dup && dup.id !== Number(req.params.id)) {
      return res.status(409).json({ error: 'Email address is already in use.' });
    }
  }

  const allowedPlans = ['free', 'paid', 'school'];
  const nextPlan = allowedPlans.includes(account_type) ? account_type : existing.account_type;
  const nextBlocked = is_blocked === undefined
    ? (booleanFlag(existing.is_blocked) ? 1 : 0)
    : (booleanFlag(is_blocked) ? 1 : 0);

  await db.userUpdate(req.params.id, {
    name: name ?? existing.name,
    email: email ?? existing.email,
    role: allowedRoles.includes(role) ? role : existing.role,
    is_blocked: nextBlocked,
    account_type: nextPlan ?? existing.account_type ?? 'free',
  });

  const user = await db.userFindById(req.params.id);
  const hasPremium = await db.subscriptionHasActive(user.id);
  delete user.password_hash;
  res.json({
    user: {
      ...user,
      plan: resolveUserPlan(user, hasPremium),
      has_premium: hasPremium,
    },
  });
});

router.delete('/users/:id', authenticate, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  const target = await db.userFindById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'admin') {
    return res.status(400).json({ error: 'Admin accounts cannot be deleted here.' });
  }
  await db.userDelete(req.params.id);
  res.json({ message: 'User deleted.' });
});

router.post('/purge-test-users', authenticate, requireAdmin, async (req, res) => {
  const result = await db.purgeNonAdminUsers();
  res.json({
    message: `${result.deleted.length} test user(s) removed. Admin accounts were preserved.`,
    ...result,
  });
});

router.post('/users/:id/premium', authenticate, requireAdmin, async (req, res) => {
  const user = await db.userFindById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  let plan = await db.planFindPremium();
  if (!plan) {
    const result = await db.planCreatePremium();
    plan = { id: result.insertId };
  }

  await db.subscriptionCancelActive(user.id);

  const months = Math.max(1, Number(req.body.months) || 12);
  const tier = req.body.tier === 'school' ? 'school' : 'standard';
  await db.subscriptionActivate(user.id, plan.id, months, tier);
  await db.userUpdate(user.id, { account_type: tier === 'school' ? 'school' : 'paid' });

  const planLabel = tier === 'school' ? 'School' : 'Premium';
  res.json({ message: `${planLabel} enabled for ${user.name} for ${months} month(s).` });
});

router.delete('/users/:id/premium', authenticate, requireAdmin, async (req, res) => {
  await db.subscriptionCancelActive(req.params.id);
  res.json({ message: 'Premium access removed.' });
});

router.get('/downloads/report', authenticate, requireAdmin, async (req, res) => {
  const report = await db.downloadReport(50);
  res.json({ report });
});

router.get('/contact-messages', authenticate, requireAdmin, async (req, res) => {
  const messages = await db.contactMessageList();
  res.json({ messages });
});

router.patch('/contact-messages/:id', authenticate, requireAdmin, async (req, res) => {
  const status = req.body.status === 'read' ? 'read' : 'unread';
  await db.contactMessageUpdate(req.params.id, { status });
  res.json({ message: 'Contact message updated.' });
});

router.delete('/contact-messages/:id', authenticate, requireAdmin, async (req, res) => {
  await db.contactMessageDelete(req.params.id);
  res.json({ message: 'Contact message deleted.' });
});

router.get('/payments', authenticate, requireAdmin, async (req, res) => {
  const settings = await getPayPalSettings(true);
  const stripe = await getStripeSettings();
  res.json({
    payments: {
      paypal_enabled: settings.enabled,
      paypal_mode: settings.mode,
      paypal_client_id: settings.clientId,
      paypal_client_secret: '',
      paypal_client_secret_masked: maskPayPalSecret(settings.clientSecret),
      has_secret: !!settings.clientSecret,
      paypal_plan_amount: settings.planAmount,
      paypal_plan_currency: settings.planCurrency,
      paypal_plan_months: String(settings.planMonths),
      paywall_plan_name: settings.planName,
      paywall_plan_price: settings.planPrice,
      // Stripe — chaves vivem no ambiente; aqui só status + máscara (secret nunca inteira).
      stripe_enabled: stripe.enabled,
      stripe_publishable_key: stripe.publishableKey,
      stripe_secret_masked: maskKey(stripe.secretKey),
      stripe_secret_set: !!stripe.secretKey,
      stripe_webhook_set: !!stripe.webhookSecret,
      stripe_plan_name: stripe.planName,
      stripe_plan_months: String(stripe.planMonths),
    },
  });
});

router.put('/payments', authenticate, requireAdmin, async (req, res) => {
  const body = req.body.payments || req.body;
  const current = await getPayPalSettings(true);

  const entries = {
    paypal_enabled: body.paypal_enabled ? 'true' : 'false',
    paypal_mode: body.paypal_mode === 'live' ? 'live' : 'sandbox',
    paypal_client_id: (body.paypal_client_id ?? current.clientId).trim(),
    paypal_plan_amount: String(body.paypal_plan_amount ?? current.planAmount).trim(),
    paypal_plan_currency: String(body.paypal_plan_currency ?? current.planCurrency).trim().toUpperCase(),
    paypal_plan_months: String(Math.max(1, Number(body.paypal_plan_months) || current.planMonths)),
    paywall_plan_name: (body.paywall_plan_name ?? current.planName).trim(),
    paywall_plan_price: (body.paywall_plan_price ?? current.planPrice).trim(),
  };

  const nextSecret = (body.paypal_client_secret || '').trim();
  if (nextSecret && !nextSecret.includes('•')) {
    entries.paypal_client_secret = nextSecret;
  }

  for (const [key, value] of Object.entries(entries)) {
    await db.settingsUpsert(key, value ?? '');
  }

  const settings = await getPayPalSettings(true);
  res.json({
    message: 'Payment settings saved.',
    payments: {
      paypal_enabled: settings.enabled,
      paypal_mode: settings.mode,
      paypal_client_id: settings.clientId,
      paypal_client_secret: '',
      paypal_client_secret_masked: maskPayPalSecret(settings.clientSecret),
      has_secret: !!settings.clientSecret,
      paypal_plan_amount: settings.planAmount,
      paypal_plan_currency: settings.planCurrency,
      paypal_plan_months: String(settings.planMonths),
      paywall_plan_name: settings.planName,
      paywall_plan_price: settings.planPrice,
    },
  });
});

router.get('/stripe-plans', authenticate, requireAdmin, async (req, res) => {
  const settings = await getStripeSettings();
  res.json({ plans: settings.plans, stripe_enabled: settings.enabled });
});

router.put('/stripe-plans', authenticate, requireAdmin, async (req, res) => {
  const plans = await saveStripePlans(req.body.plans);
  res.json({ plans });
});

router.post('/payments/test', authenticate, requireAdmin, async (req, res) => {
  const settings = await getPayPalSettings(true);
  if (!settings.clientId || !settings.clientSecret) {
    return res.status(400).json({ error: 'Informe Client ID e Secret do PayPal.' });
  }
  await getPayPalAccessToken(settings);
  res.json({ ok: true, message: `PayPal connection (${settings.mode}) established.` });
});

export default router;
