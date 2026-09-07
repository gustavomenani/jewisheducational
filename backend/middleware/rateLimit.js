import rateLimit from 'express-rate-limit';

// Cloud Functions delivers requests through a load balancer, so with
// `trust proxy` set in app.js the real client IP resolves from the
// X-Forwarded-For chain instead of the proxy address. Local deployments
// connect directly and fall back to the socket address.
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function keyGenerator(req) {
  const userKey = req.user?.id ? `u${req.user.id}` : 'ip';
  return `${userKey}:${clientIp(req)}`;
}

// Login is keyed by email + IP: it slows down credential guessing against a
// specific account without locking out everyone behind a shared school NAT.
function loginKeyGenerator(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `login:${email || 'no-email'}:${clientIp(req)}`;
}

export function createLimiter({ windowMs, max, message, key = keyGenerator }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: key,
    skip: () => process.env.NODE_ENV === 'test',
    handler(req, res) {
      res.status(429).json({ error: message });
    },
  });
}

// Brute-force / account-spam guards. Limits are per IP (per user when
// authenticated) and deliberately skip automated tests.
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many attempts. Please try again in a few minutes.',
});

export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: loginKeyGenerator,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

export const contactLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Too many messages. Please try again later.',
});

export const analyticsLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many analytics events.',
});
