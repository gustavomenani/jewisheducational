import { Router } from 'express';
import * as db from '../db/index.js';
import { settingsToObject } from '../utils/helpers.js';
import { isMailerConfigured, sendEmail } from '../utils/mailer.js';
import {
  escapeHtml,
  normalizeContactEmail,
  normalizeContactRedirect,
  normalizeRedirectDelay,
} from '../utils/contactConfig.js';
import { contactLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', contactLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const message = String(req.body.message || '').trim();

  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Enter your name.' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ error: 'Message must contain at least 10 characters.' });
  }

  const rows = await db.settingsGetByKeys([
    'contact_notify_email',
    'contact_redirect_url',
    'contact_redirect_delay',
  ]);
  const settings = settingsToObject(rows);
  const notifyEmail = normalizeContactEmail(settings.contact_notify_email);
  const redirectUrl = normalizeContactRedirect(settings.contact_redirect_url);
  const redirectDelay = normalizeRedirectDelay(settings.contact_redirect_delay);

  const created = await db.contactMessageCreate({
    name,
    email,
    message,
    notification_status: 'not_configured',
  });

  if (isMailerConfigured()) {
    try {
      await sendEmail({
        to: notifyEmail,
        subject: `New contact message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
        html: [
          '<h2>New contact message</h2>',
          `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
          `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
          `<p><strong>Message:</strong></p><p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>`,
        ].join(''),
      });
      await db.contactMessageUpdate(created.insertId, { notification_status: 'sent' });
    } catch (error) {
      console.error('Contact notification email failed:', error.message || error);
      await db.contactMessageUpdate(created.insertId, { notification_status: 'failed' });
    }
  }

  res.status(201).json({
    message: 'Message sent. Thank you for getting in touch!',
    redirect_url: redirectUrl,
    redirect_delay: redirectDelay,
  });
});

export default router;
