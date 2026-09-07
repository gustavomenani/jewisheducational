import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as db from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { classifyTrafficSource, referrerHost as computeReferrerHost } from '../utils/attribution.js';
import { analyticsLimiter } from '../middleware/rateLimit.js';

const router = Router();
const CLIENT_INTERACTION_EVENTS = [
  'resource_preview_open',
  'resource_download_click',
  'resource_page_click',
  'download_page_open',
];
const SERVER_INTERACTION_EVENTS = ['download_started', 'download_completed'];
const INTERACTION_EVENTS = [...CLIENT_INTERACTION_EVENTS, ...SERVER_INTERACTION_EVENTS];

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

router.post(
  '/pageview',
  analyticsLimiter,
  [
    body('path').trim().notEmpty().isLength({ max: 500 }),
    body('pageTitle').optional().trim().isLength({ max: 200 }),
    body('referrer').optional().trim().isLength({ max: 500 }),
    body('sessionId').optional().trim().isLength({ max: 64 }),
    body('utm_source').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    body('utm_medium').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
    body('utm_campaign').optional({ nullable: true }).isString().trim().isLength({ max: 120 }),
    // Accepted for old clients but never trusted as an attribution value.
    body('traffic_source').optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
    body('referrer_host').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const {
      path,
      pageTitle,
      referrer,
      sessionId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
    } = req.body;
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);

    // Classifica a fonte no servidor (mais confiável que confiar no cliente).
    const host = String(req.headers.host || '').toLowerCase();
    // Attribution is a server-owned derived field. Client-supplied labels are
    // accepted for backward-compatible validation, but cannot forge reports.
    const computedHost = computeReferrerHost(referrer);
    const computedSource = classifyTrafficSource({
      utm_source: utmSource,
      utm_medium: utmMedium,
      referrer,
      host,
    });

    await db.pageViewCreate({
      path,
      page_title: pageTitle || null,
      referrer: referrer || null,
      user_agent: userAgent || null,
      session_id: sessionId || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      traffic_source: computedSource || null,
      referrer_host: computedHost || null,
    });

    res.status(201).json({ ok: true });
  }
);

router.post(
  '/event',
  // Client interaction events are tied to protected resource actions. This
  // prevents anonymous callers from forging download conversions.
  authenticate,
  analyticsLimiter,
  [
    body('eventName').trim().isIn(CLIENT_INTERACTION_EVENTS),
    body('eventId').optional({ nullable: true }).trim().matches(/^[A-Za-z0-9._:-]{8,128}$/),
    body('resourceId').isInt({ min: 1 }),
    body('fileId').isInt({ min: 1 }),
    body('pageIndex').optional({ nullable: true }).isInt({ min: 1, max: 10000 }),
    body('sessionId').optional({ nullable: true }).trim().isLength({ max: 64 }),
  ],
  async (req, res) => {
    if (!validate(req, res)) return;

    const {
      eventName,
      eventId,
      resourceId,
      fileId,
      pageIndex,
      sessionId,
    } = req.body;
    try {
      const resource = await db.resourceFindById(resourceId);
      const isAdmin = req.user?.role === 'admin';
      if (!resource || (!isAdmin && (resource.is_archived || !resource.is_published))) {
        return res.status(404).json({ error: 'Resource not found.' });
      }
      const file = await db.fileFindByIdAndResource(fileId, resourceId);
      if (!file || (!isAdmin && file.is_archived)) {
        return res.status(404).json({ error: 'File not found.' });
      }
      const resourcePath = `/resource/${resource.slug || resourceId}`;
      const eventPath = eventName === 'download_page_open' || eventName === 'resource_download_click'
        ? `${resourcePath}/download/${file.id}`
        : resourcePath;
      await db.interactionEventCreate({
        event_name: eventName,
        resource_id: resourceId || null,
        file_id: fileId || null,
        page_index: pageIndex || null,
        resource_title: resource.title || null,
        file_label: file.label || file.original_name || null,
        path: eventPath,
        session_id: sessionId || null,
        user_id: req.user?.id || null,
        ip_address: req.ip,
        user_agent: (req.headers['user-agent'] || '').slice(0, 500),
        event_key: eventId || null,
      });
    } catch (error) {
      // Analytics must never block a visitor interaction when storage is unavailable.
      console.warn('[Analytics] Could not record interaction:', error.message);
    }
    res.status(202).json({ ok: true });
  }
);

router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  const [stats, signupSources, interactionEvents, settingRows] = await Promise.all([
    db.pageViewStats(),
    db.userSignupSourceStats(),
    db.interactionEventStats().catch(() => ({ recent: [], perFile: [], totals: {} })),
    db.settingsGetByKeys(['google_analytics_id']).catch(() => []),
  ]);
  const googleAnalyticsId = Array.isArray(settingRows)
    ? settingRows.find((row) => row.setting_key === 'google_analytics_id')?.setting_value || null
    : settingRows?.google_analytics_id || null;
  res.json({
    // The admin-configured ID is authoritative. Environment values are only
    // a bootstrap fallback for a fresh installation before the setting exists.
    measurementId: googleAnalyticsId || process.env.GA_MEASUREMENT_ID || process.env.VITE_GA_MEASUREMENT_ID || null,
    googleAnalyticsId,
    ...stats,
    signupSources,
    interactionEvents,
  });
});

export default router;
