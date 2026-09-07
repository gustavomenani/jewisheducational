import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_DRIVER = 'memory';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'reliability-auth-secret';
process.env.AUTH_LOOKUP_TIMEOUT_MS = '100';

const { authenticate, isBlocked, optionalAuth, signToken } = await import('./auth.js?reliability-auth');

const token = signToken({ id: 42, email: 'auth@example.com', role: 'user' });

test('blocking flags treat string false as unblocked', async () => {
  assert.equal(isBlocked('false'), false);
  assert.equal(isBlocked('0'), false);
  assert.equal(isBlocked('true'), true);

  const req = { headers: { authorization: `Bearer ${token}` } };
  let called = 0;
  await authenticate(req, {}, () => { called += 1; }, {
    userFindById: async () => ({ id: 42, email: 'auth@example.com', role: 'user', is_blocked: 'false', password_hash: 'secret' }),
  });
  assert.equal(called, 1);
  assert.equal(req.user.email, 'auth@example.com');
});

test('optionalAuth distinguishes invalid credentials from datastore failure', async () => {
  const invalidReq = { headers: { authorization: 'Bearer definitely-invalid' } };
  let invalidNextCalls = 0;
  await optionalAuth(invalidReq, {}, () => { invalidNextCalls += 1; }, {
    userFindById: async () => { throw new Error('must not query for an invalid token'); },
  });
  assert.equal(invalidNextCalls, 1);
  assert.equal(invalidReq.authError.code, 'TOKEN_INVALID');

  const unavailableReq = { headers: { authorization: `Bearer ${token}` } };
  let unavailableError;
  await optionalAuth(unavailableReq, {}, (error) => { unavailableError = error; }, {
    userFindById: async () => {
      const error = new Error('connection refused');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  });
  assert.equal(unavailableError.code, 'DB_UNAVAILABLE');
  assert.equal(unavailableError.status, 503);
});

test('optionalAuth advances after a lookup timeout instead of hanging', async () => {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const outcome = await Promise.race([
    optionalAuth(req, {}, (error) => error, { userFindById: () => new Promise(() => {}) }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('optionalAuth hung')), 750)),
  ]);
  assert.equal(outcome.code, 'DB_UNAVAILABLE');
  assert.equal(outcome.status, 503);
});
