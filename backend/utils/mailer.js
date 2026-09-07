import nodemailer from 'nodemailer';

let transporter;

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
}

export function isMailerConfigured() {
  return Boolean(
    process.env.SMTP_HOST
    && process.env.SMTP_USER
    && process.env.SMTP_PASS
  );
}

export async function getMailer() {
  if (!isMailerConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }) {
  const mailer = await getMailer();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@jewisheducationalresources.org';
  if (!mailer) {
    if (isProductionRuntime()) {
      const error = new Error('Email service is not configured.');
      error.code = 'SMTP_NOT_CONFIGURED';
      error.status = 503;
      throw error;
    }
    console.log('[DEV] Email to', to, subject);
    if (text) console.log(text);
    return { dev: true };
  }
  await mailer.sendMail({ from, to, subject, html, text });
  return { sent: true };
}
