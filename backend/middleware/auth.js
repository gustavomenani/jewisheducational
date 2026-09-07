import jwt from 'jsonwebtoken';
import * as db from '../db/index.js';

const OPTIONAL_AUTH_TIMEOUT_MS = Math.max(100, Number(process.env.AUTH_LOOKUP_TIMEOUT_MS) || 2500);

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export function isBlocked(value) {
  if (typeof value === 'string') {
    return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

function databaseUnavailable(error) {
  const nextError = error instanceof Error ? error : new Error('Database unavailable.');
  nextError.code = 'DB_UNAVAILABLE';
  nextError.status = 503;
  return nextError;
}

function withTimeout(work, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Database lookup timed out.');
      error.code = 'DB_UNAVAILABLE';
      error.status = 503;
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
}

export async function authenticate(req, res, next, database = db) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token was not provided.' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token is invalid or expired.' });
  }

  try {
    const user = await withTimeout(() => database.userFindById(payload.id), OPTIONAL_AUTH_TIMEOUT_MS);

    if (!user) return res.status(401).json({ error: 'User not found.' });
    if (isBlocked(user.is_blocked)) return res.status(403).json({ error: 'Account blocked.' });

    delete user.password_hash;
    req.user = user;
    return next();
  } catch (error) {
    return next(databaseUnavailable(error));
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

export async function optionalAuth(req, res, next, database = db) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    // Invalid optional credentials do not turn a public request into a 401.
    // They are deliberately distinguishable from a datastore outage below.
    req.authError = { code: 'TOKEN_INVALID', status: 401 };
    return next();
  }

  try {
    const user = await withTimeout(() => database.userFindById(payload.id), OPTIONAL_AUTH_TIMEOUT_MS);
    if (user && !isBlocked(user.is_blocked)) {
      delete user.password_hash;
      req.user = user;
    }
    return next();
  } catch (error) {
    // Never leave Express waiting on a rejected DB lookup. A database outage
    // must not be mistaken for an anonymous visitor.
    return next(databaseUnavailable(error));
  }
}
