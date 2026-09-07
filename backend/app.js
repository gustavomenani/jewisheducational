import 'express-async-errors';
import './config/env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import resourceRoutes from './routes/resources.js';
import downloadRoutes from './routes/downloads.js';
import settingsRoutes from './routes/settings.js';
import editorRoutes from './routes/editor.js';
import subscriptionRoutes from './routes/subscriptions.js';
import adminRoutes from './routes/admin.js';
import contactRoutes from './routes/contact.js';
import paymentsRoutes from './routes/payments.js';
import favoritesRoutes from './routes/favorites.js';
import analyticsRoutes from './routes/analytics.js';
import migrateRoutes from './routes/migrate.js';
import seoRoutes from './routes/seo.js';
import { isFirestoreBackend } from './config/database.js';
import { bucket } from './config/firebaseAdmin.js';
import { uploadDir } from './middleware/upload.js';
import { handleStripeWebhook } from './utils/stripe.js';
import * as db from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
}

function configuredFrontendOrigin() {
  const raw = String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function isOwnedFirebaseHostingPreviewOrigin(origin) {
  try {
    const parsed = new URL(origin);
    // Firebase Hosting channel URLs are generated as
    // <site-id>--<channel>-<suffix>.web.app. Permit previews belonging only
    // to this Hosting site, never a broad *.web.app origin.
    return parsed.protocol === 'https:'
      && /^jewish-educational-resources--[a-z0-9-]+\.web\.app$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function createApp({ includeMigration = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Behind Firebase's load balancer the socket address belongs to the proxy.
  // Trusting the forwarding chain makes req.ip resolve to the real client
  // (needed for per-IP rate limits) and req.protocol resolve to https.
  app.set('trust proxy', true);
  const localUploadDir = process.env.UPLOAD_DIR || 'uploads';

  if (!isFirestoreBackend()) {
    if (!fs.existsSync(localUploadDir)) {
      fs.mkdirSync(localUploadDir, { recursive: true });
      fs.mkdirSync(path.join(localUploadDir, 'files'), { recursive: true });
      fs.mkdirSync(path.join(localUploadDir, 'covers'), { recursive: true });
    }
  }

  const allowedOrigins = [
    ...(process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    // Alternate local Vite ports used by the headless editor audit. Keeping
    // these explicit avoids forcing developers to weaken CORS globally.
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:5180',
    'http://127.0.0.1:5180',
    'http://localhost:5181',
    'http://127.0.0.1:5181',
    'https://jewish-educational-resources.web.app',
    'https://jewish-educational-resources.firebaseapp.com',
    'https://jewisheducationalresources.org',
    'https://www.jewisheducationalresources.org',
  ];

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || isOwnedFirebaseHostingPreviewOrigin(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));
  // Stripe verifies the webhook signature against the raw payload, so this
  // route must read the body as raw bytes before the JSON parser runs.
  app.post(
    '/api/payments/stripe/webhook',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook
  );

  // Migration batches contain base64 payloads and are mounted only on the
  // private migration Function. Keep the public API limit conservative while
  // allowing bounded, separately-sent migration batches to reach the route.
  app.use(express.json({
    limit: includeMigration ? (process.env.MIGRATION_JSON_LIMIT || '25mb') : (process.env.JSON_BODY_LIMIT || '1mb'),
  }));
  app.use(express.urlencoded({ extended: true, limit: includeMigration ? '25mb' : '1mb' }));
  // Prevent browsers from MIME-sniffing uploaded content served by this API.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Only covers are public (they appear on cards). Material files are served
  // exclusively through the authenticated download routes; never expose the
  // whole uploads directory statically or premium files would bypass access
  // checks whenever the internal filename leaks.
  if (!isFirestoreBackend()) {
    const coversDir = path.resolve(localUploadDir, 'covers');
    app.use('/uploads/covers', express.static(coversDir, {
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }));
  }

  app.get('/api/health', (req, res) => {
    const backendName = isFirestoreBackend()
      ? 'firebase'
      : process.env.DB_DRIVER === 'memory' ? 'memory' : 'mysql';
    res.json({
      status: 'ok',
      backend: backendName,
      timestamp: new Date().toISOString(),
    });
  });

  // Liveness only proves that the process accepted the request. Readiness is
  // intentionally separate so Firebase/load-balancer checks do not advertise
  // a cold or misconfigured instance as available for real traffic.
  app.get('/api/ready', async (req, res) => {
    const checks = {
      database: { ok: false },
      storage: { ok: false },
      configuration: { ok: false },
    };
    const timeout = (promise, ms = 2500) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('readiness check timed out')), ms)),
    ]);

    try {
      await timeout(db.settingsGetAll());
      checks.database = { ok: true, backend: isFirestoreBackend() ? 'firebase' : process.env.DB_DRIVER === 'memory' ? 'memory' : 'mysql' };
    } catch (error) {
      checks.database = { ok: false, error: error.code === 'ECONNREFUSED' ? 'unavailable' : 'check_failed' };
    }

    try {
      if (isFirestoreBackend()) {
        const bucketName = String(
          process.env.STORAGE_BUCKET
          || process.env.FIREBASE_STORAGE_BUCKET
          || bucket?.name
          || ''
        ).trim();
        if (!bucketName) {
          throw new Error('storage bucket is not configured');
        }
        // Firebase Admin resolves the default bucket from the project even
        // when STORAGE_BUCKET is not duplicated in the function environment.
        // A configured name alone is not sufficient: verify that the runtime
        // can actually reach Storage before advertising readiness.
        if (!bucket?.getMetadata) throw new Error('storage client is unavailable');
        const [metadata] = await timeout(bucket.getMetadata());
        if (!metadata) throw new Error('storage metadata is unavailable');
        checks.storage = { ok: true, backend: 'firebase', bucket: bucketName };
      } else {
        await fs.promises.access(path.resolve(localUploadDir), fs.constants.R_OK | fs.constants.W_OK);
        checks.storage = { ok: true, backend: 'local' };
      }
    } catch {
      checks.storage = { ok: false, error: 'unavailable' };
    }

    const missing = [];
    if (!String(process.env.JWT_SECRET || '').trim()) missing.push('jwt_not_configured');
    if (isProductionRuntime() && !configuredFrontendOrigin()) missing.push('frontend_url_not_configured');
    if (String(process.env.STRIPE_REQUIRED || '').toLowerCase() === 'true') {
      if (!String(process.env.STRIPE_SECRET_KEY || '').trim()) missing.push('stripe_secret_not_configured');
      if (!String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim()) missing.push('stripe_publishable_not_configured');
      if (!String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()) missing.push('stripe_webhook_not_configured');
    }
    if (String(process.env.SMTP_REQUIRED || '').toLowerCase() === 'true') {
      const smtpMissing = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
        .filter((key) => !String(process.env[key] || '').trim());
      if (smtpMissing.length) missing.push(`smtp_not_configured:${smtpMissing.join('|')}`);
    }
    checks.configuration = missing.length
      ? { ok: false, error: missing.join(',') }
      : { ok: true };

    const ready = Object.values(checks).every((check) => check.ok);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Public crawl discovery. The sitemap contains only canonical, published
  // pages; private and filtered routes are deliberately excluded.
  app.use('/', seoRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/resources', resourceRoutes);
  app.use('/api/downloads', downloadRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/editor', editorRoutes);
  app.use('/api/favorites', favoritesRoutes);
  app.use('/api/analytics', analyticsRoutes);
  // The destructive migration endpoints are intentionally excluded from the
  // normal public API. A dedicated, privately-invoked Function mounts them
  // with MIGRATION_SECRET bound only to that Function.
  if (includeMigration) app.use('/api/migrate', migrateRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/payments', paymentsRoutes);
  // Subscription reminders run through the authenticated scheduled Function.
  // There is deliberately no public HTTP trigger for this destructive action.

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  app.use((err, req, res, next) => {
    console.error(err.message || err);
    const unavailable = err.code === 'DB_UNAVAILABLE'
      || ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR'].includes(err.code);
    const status = err.status || (unavailable ? 503 : 500);
    const isProduction = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
    // Unexpected failures must not leak internals (paths, SQL, stack hints).
    // Expected client errors (4xx with a message set by a route) still pass.
    const message =
      unavailable
        ? 'Database unavailable.'
        : status >= 500 && isProduction
          ? 'Internal server error.'
          : err.message || 'Internal server error.';
    res.status(status).json({ error: message });
  });

  return app;
}
