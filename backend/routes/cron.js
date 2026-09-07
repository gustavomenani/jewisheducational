import { Router } from 'express';
import crypto from 'crypto';
import { processSubscriptionReminders } from '../utils/subscriptionReminders.js';

const router = Router();

router.post('/subscription-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_CRON_KEY;
  // Fail closed: with no shared secret configured the trigger is disabled
  // instead of letting anyone run the email job anonymously.
  if (!secret) {
    return res.status(503).json({ error: 'Scheduled task is disabled on this deployment.' });
  }
  const authHeader = req.get('authorization') || '';
  const provided = authHeader.replace(/^Bearer\s+/i, '') || String(req.query.key || '');
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const results = await processSubscriptionReminders({ daysBefore: 7 });
  res.json({ message: 'Lembretes processados.', results });
});

export default router;
