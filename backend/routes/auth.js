import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { body, validationResult } from 'express-validator';
import * as db from '../db/index.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { verifyFirebaseIdToken } from '../utils/verifyFirebaseToken.js';
import { USER_COPY } from '../utils/userCopy.js';
import { authLimiter, loginLimiter } from '../middleware/rateLimit.js';
import { escapeHtml } from '../utils/contactConfig.js';

function pickSignupMeta(body) {
  return {
    signup_method: body.signup_method || null,
    signup_source: body.signup_source || null,
    signup_referrer: body.signup_referrer || null,
    signup_utm_source: body.signup_utm_source || null,
    signup_utm_medium: body.signup_utm_medium || null,
    signup_utm_campaign: body.signup_utm_campaign || null,
    signup_landing_path: body.signup_landing_path || null,
  };
}

const router = Router();

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
}

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

function isBlocked(value) {
  if (typeof value === 'string') {
    return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

function isDuplicateUserError(error) {
  return error?.status === 409
    || ['ER_DUP_ENTRY', 'ER_DUPLICATE_ENTRY', 'DUPLICATE_USER_EMAIL', 'DUPLICATE_EMAIL', '23505'].includes(error?.code);
}

async function getMailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

function passwordResetOrigin() {
  const configured = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  const raw = configured || (isProductionRuntime() ? '' : 'http://localhost:5173');
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    return parsed.href.replace(/\/+$/, '');
  } catch {
    const error = new Error('Password reset URL is not configured.');
    error.code = 'FRONTEND_URL_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
}

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage(USER_COPY.nameRequired),
    body('email').isEmail().withMessage(USER_COPY.invalidEmail),
    body('password').isLength({ min: 6 }).withMessage(USER_COPY.passwordMinimum),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { name, email, password } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await db.userFindByEmail(normalizedEmail);
    if (existing) return res.status(409).json({ error: USER_COPY.emailAlreadyRegistered });

    const password_hash = await bcrypt.hash(password, 10);
    let result;
    try {
      result = await db.userCreate({
        name,
        email: normalizedEmail,
        password_hash,
        ...pickSignupMeta(req.body),
      });
    } catch (error) {
      // The preflight lookup is not enough under concurrent registrations; the
      // datastore's unique constraint must map to the same client response.
      if (isDuplicateUserError(error)) {
        return res.status(409).json({ error: USER_COPY.emailAlreadyRegistered });
      }
      throw error;
    }

    const userId = result?.insertId ?? result?.id;
    if (!userId) return res.status(500).json({ error: 'Could not create the account.' });
    const user = { id: userId, name, email: normalizedEmail, role: 'user' };
    res.status(201).json({ user, token: signToken(user) });
  }
);

router.post(
  '/login',
  loginLimiter,
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { email, password } = req.body;
    const user = await db.userFindByEmail(String(email).trim().toLowerCase());

    if (!user) return res.status(401).json({ error: USER_COPY.invalidCredentials });
    if (isBlocked(user.is_blocked)) return res.status(403).json({ error: USER_COPY.accountBlocked });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: USER_COPY.invalidCredentials });

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
    };
    res.json({ user: sessionUser, token: signToken(sessionUser) });
  }
);

router.post(
  '/google',
  authLimiter,
  [body('idToken').notEmpty().withMessage(USER_COPY.googleTokenRequired)],
  async (req, res) => {
    if (!validate(req, res)) return;

    try {
      const profile = await verifyFirebaseIdToken(req.body.idToken);
      let user = await db.userFindByEmail(profile.email);

      if (isBlocked(user?.is_blocked)) {
        return res.status(403).json({ error: USER_COPY.accountBlocked });
      }

      if (!user) {
        const password_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        let result;
        try {
          result = await db.userCreate({
            name: profile.name,
            email: profile.email,
            password_hash,
            avatar_url: profile.avatarUrl,
            ...pickSignupMeta(req.body),
          });
        } catch (error) {
          if (!isDuplicateUserError(error)) throw error;
          user = await db.userFindByEmail(profile.email);
          if (!user) throw error;
          result = { insertId: user.id };
        }
        if (!user) {
          const userId = result?.insertId ?? result?.id;
          if (!userId) throw new Error('Could not create the account.');
          user = {
            id: userId,
            name: profile.name,
            email: profile.email,
            role: 'user',
            avatar_url: profile.avatarUrl,
          };
        }
      } else if (profile.avatarUrl && !user.avatar_url) {
        await db.userUpdate(user.id, { avatar_url: profile.avatarUrl });
        user.avatar_url = profile.avatarUrl;
      }

      const sessionUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      };
      res.json({ user: sessionUser, token: signToken(sessionUser) });
    } catch (err) {
      res.status(401).json({ error: err.message || USER_COPY.googleAuthenticationFailed });
    }
  }
);

router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail()],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { email } = req.body;
    const user = await db.userFindByEmail(email);

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000);
      try {
        await db.userUpdate(user.id, { reset_token: token, reset_token_expires: expires });

        const resetUrl = `${passwordResetOrigin()}/reset-password/${token}`;
        const transporter = await getMailer();

        if (transporter) {
          const safeName = escapeHtml(user.name || 'there');
          const safeResetUrl = escapeHtml(resetUrl);
          await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@jewisheducationalresources.org',
            to: email,
            subject: 'Password reset',
            html: `<p>Hello ${safeName},</p><p>Click the link to reset your password:</p><p><a href="${safeResetUrl}">${safeResetUrl}</a></p><p>This link is valid for one hour.</p>`,
          });
        } else if (isProductionRuntime()) {
          const error = new Error('Email service is not configured.');
          error.code = 'SMTP_NOT_CONFIGURED';
          error.status = 503;
          throw error;
        } else {
          console.log('[DEV] Reset URL:', resetUrl);
        }
      } catch (error) {
        await db.userUpdate(user.id, { reset_token: null, reset_token_expires: null }).catch(() => {});
        throw error;
      }
    }

    res.json({ message: USER_COPY.passwordResetSent });
  }
);

router.post(
  '/reset-password',
  authLimiter,
  [body('token').notEmpty(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { token, password } = req.body;
    const user = await db.userFindByResetToken(token);

    if (!user) return res.status(400).json({ error: USER_COPY.resetTokenInvalid });

    const password_hash = await bcrypt.hash(password, 10);
    await db.userUpdate(user.id, {
      password_hash,
      reset_token: null,
      reset_token_expires: null,
    });

    res.json({ message: 'Password reset successfully.' });
  }
);

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

router.put(
  '/profile',
  authenticate,
  [
    body('name').optional().trim().notEmpty(),
    body('password').optional().isLength({ min: 6 }),
    body('currentPassword').optional().isString(),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const { name, password, currentPassword } = req.body;
    const fields = {};

    if (password) {
      const fullUser = await db.userFindById(req.user.id);
      if (fullUser?.password_hash) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password is required to set a new password.' });
        }
        const ok = await bcrypt.compare(currentPassword, fullUser.password_hash);
        if (!ok) {
          return res.status(400).json({ error: 'Current password is incorrect.' });
        }
      }
      fields.password_hash = await bcrypt.hash(password, 10);
    }

    if (name) fields.name = name;

    if (Object.keys(fields).length) {
      await db.userUpdate(req.user.id, fields);
    }

    const user = await db.userFindById(req.user.id);
    delete user.password_hash;
    res.json({ user });
  }
);

export default router;
