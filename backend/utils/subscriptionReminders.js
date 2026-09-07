import * as db from '../db/index.js';
import { sendEmail } from './mailer.js';
import { escapeHtml } from './contactConfig.js';

const SITE_URL = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'https://jewisheducationalresources.org';

function formatDate(date) {
  const value = date instanceof Date ? date : new Date(date);
  return value.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildPremiumExpiryReminder(user, subscription) {
  const date = formatDate(subscription.ends_at || subscription.endsAt);
  const name = user.name?.split(' ')[0] || user.name;
  const safeName = escapeHtml(name || 'there');
  const safeSiteUrl = escapeHtml(SITE_URL);
  return {
    subject: 'Your Premium subscription expires soon — Jewish Educational Resources',
    html: `<p>Hi ${safeName},</p><p>Your Premium subscription expires on <strong>${escapeHtml(date)}</strong>.</p><p>Renew to keep downloading full PDFs and premium materials.</p><p><a href="${safeSiteUrl}/my-account">Renew or manage subscription</a></p><p>Jewish Educational Resources</p>`,
    text: `Hi ${name}, your Premium expires on ${date}. Renew at ${SITE_URL}/my-account`,
  };
}

export async function processSubscriptionReminders({ daysBefore = 7 } = {}) {
  const subscriptions = await db.subscriptionListNeedingReminder(daysBefore);
  const results = { checked: subscriptions.length, sent: 0, skipped: 0, errors: [] };

  for (const subscription of subscriptions) {
    try {
      const user = await db.userFindById(subscription.user_id);
      if (!user?.email) {
        results.skipped += 1;
        continue;
      }
      await sendEmail({ to: user.email, ...buildPremiumExpiryReminder(user, subscription) });
      await db.subscriptionMarkReminderSent(subscription.id);
      results.sent += 1;
    } catch (error) {
      results.errors.push({ subscriptionId: subscription.id, error: error.message });
    }
  }

  return results;
}
