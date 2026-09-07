import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getSubscriptionStatus } from '../utils/subscriptions.js';
import { getPaywallSettings } from '../utils/paywall.js';

const router = Router();

router.get('/me', authenticate, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user.id);
  const paywall = await getPaywallSettings();
  res.json({
    subscription,
    isPremium: subscription.active || req.user.role === 'admin',
    paywall,
  });
});

export default router;
