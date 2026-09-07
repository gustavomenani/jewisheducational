import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-reliability-http-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'reliability-http-secret';
process.env.NODE_ENV = 'test';
process.env.STRIPE_SECRET_KEY = 'sk_test_reliability';
process.env.STRIPE_WEBHOOK_SECRET = '';

const [{ createApp }, db, { signToken }, { publicationErrorStatus }] = await Promise.all([
  import('../app.js?reliability-http'),
  import('../db/index.js?reliability-http'),
  import('../middleware/auth.js?reliability-http'),
  import('./editor.js?reliability-http'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;
const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

function request(method, requestPath, { token, body = null, raw = false, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null
      ? null
      : (raw ? (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))) : Buffer.from(JSON.stringify(body)));
    const requestHeaders = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? {
        'Content-Type': raw ? 'application/octet-stream' : 'application/json',
        'Content-Length': payload.length,
      } : {}),
      ...headers,
    };
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers: requestHeaders }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(buffer.toString('utf8')); } catch { /* non-JSON response */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: buffer });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('registration conflicts consistently return 409 and false blocking strings permit login', async () => {
  const body = { name: 'Conflict User', email: 'Conflict@Example.com', password: 'reliability-password' };
  const first = await request('POST', '/api/auth/register', { body });
  assert.equal(first.status, 201);
  const second = await request('POST', '/api/auth/register', { body });
  assert.equal(second.status, 409);

  const user = await db.userFindByEmail('conflict@example.com');
  await db.userUpdate(user.id, { is_blocked: 'false' });
  const login = await request('POST', '/api/auth/login', {
    body: { email: body.email, password: body.password },
  });
  assert.equal(login.status, 200);
});

test('site editor image uploads are stored in the public covers area', async () => {
  const boundary = 'jer-settings-image-boundary';
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="mascot.png"\r\nContent-Type: image/png\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await request('POST', '/api/settings/upload', {
    token: adminToken,
    raw: true,
    body,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  });
  assert.equal(response.status, 200);
  const uploaded = JSON.parse(response.rawBody.toString('utf8'));
  assert.match(uploaded.url, /^\/uploads\/covers\//);
  assert.ok(await db.storageStat(uploaded.url.slice('/uploads/'.length)));
});

test('legacy private setting images are served only through the scoped image proxy', async () => {
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await db.storageUpload(image, 'files/legacy-mascot.png', 'image/png');
  await db.settingsUpsert(
    'home_hero_image',
    'https://storage.googleapis.com/example-bucket/files/legacy-mascot.png',
  );

  const settingsResponse = await request('GET', '/api/settings');
  assert.equal(settingsResponse.status, 200);
  assert.equal(settingsResponse.body.settings.home_hero_image, '/api/settings/media/home_hero_image');

  const mediaResponse = await request('GET', settingsResponse.body.settings.home_hero_image);
  assert.equal(mediaResponse.status, 200);
  assert.equal(mediaResponse.headers['content-type'], 'image/png');
  assert.deepEqual(mediaResponse.rawBody, image);

  const traversal = await request('GET', '/api/settings/media/../home_hero_image');
  assert.notEqual(traversal.status, 200);
});

test('pageview attribution is derived from request signals, not client labels', async () => {
  const response = await request('POST', '/api/analytics/pageview', {
    body: {
      path: '/reliability-attribution',
      referrer: 'https://instagram.com/example',
      traffic_source: 'Google',
      referrer_host: 'google.com',
    },
  });
  assert.equal(response.status, 201);
  const stats = await db.pageViewStats();
  assert.ok(stats.topTrafficSources.some((row) => row.source === 'Instagram'));
  assert.equal(stats.topTrafficSources.some((row) => row.source === 'Google'), false);
});

test('pageview analytics accepts this site’s Firebase Hosting preview domains without opening CORS to other sites', async () => {
  const previewOrigin = 'https://jewish-educational-resources--editor-v2-u1kcsrib.web.app';
  const preview = await request('POST', '/api/analytics/pageview', {
    body: { path: '/preview-cors-regression' },
    headers: { Origin: previewOrigin },
  });
  assert.equal(preview.status, 201);
  assert.equal(preview.headers['access-control-allow-origin'], previewOrigin);

  const unrelated = await request('POST', '/api/analytics/pageview', {
    body: { path: '/unrelated-preview-cors-regression' },
    headers: { Origin: 'https://other-site--editor-v2-u1kcsrib.web.app' },
  });
  assert.notEqual(unrelated.status, 201);
  assert.notEqual(unrelated.headers['access-control-allow-origin'], 'https://other-site--editor-v2-u1kcsrib.web.app');
});

test('client interaction analytics requires auth, validates records, and deduplicates event IDs', async () => {
  const resource = await db.resourceCreate({
    title: 'Analytics reliability resource',
    slug: 'analytics-reliability-resource',
    is_published: 1,
    is_archived: 0,
  });
  const file = await db.fileCreate(resource.id, {
    file_type: 'pdf',
    original_name: 'analytics.pdf',
    is_archived: 0,
  });
  const before = (await db.interactionEventStats()).totals?.resource_preview_open || 0;
  const payload = {
    eventName: 'resource_preview_open',
    eventId: 'reliability-preview-event-1',
    resourceId: resource.id,
    fileId: file.id,
    resourceTitle: 'forged title must be ignored',
    path: '/forged-path',
  };
  const anonymous = await request('POST', '/api/analytics/event', { body: payload });
  assert.equal(anonymous.status, 401);
  const first = await request('POST', '/api/analytics/event', { token: adminToken, body: payload });
  const second = await request('POST', '/api/analytics/event', { token: adminToken, body: payload });
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  const stats = await db.interactionEventStats();
  assert.equal(stats.totals.resource_preview_open, before + 1);
  const row = stats.recent.find((event) => event.event_key === payload.eventId);
  assert.equal(row.resource_title, resource.title);
  assert.equal(row.path, `/resource/${resource.slug}`);

  const forgedServerEvent = await request('POST', '/api/analytics/event', {
    token: adminToken,
    body: { ...payload, eventName: 'download_completed', eventId: 'reliability-forged-server-event' },
  });
  assert.equal(forgedServerEvent.status, 400);
});

test('Stripe webhook event IDs make retries idempotent', async () => {
  const event = {
    id: 'evt_reliability_http',
    type: 'charge.succeeded',
    data: { object: { id: 'ch_reliability' } },
  };
  const first = await request('POST', '/api/payments/stripe/webhook', {
    body: event,
    raw: true,
    headers: { 'Content-Type': 'application/json' },
  });
  const second = await request('POST', '/api/payments/stripe/webhook', {
    body: event,
    raw: true,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.duplicate, false);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
});

test('editor publication maps internal failures to server errors', () => {
  assert.equal(publicationErrorStatus(new Error('unexpected failure')), 500);
  assert.equal(publicationErrorStatus(Object.assign(new Error('database down'), { code: 'ECONNREFUSED' })), 503);
  assert.equal(publicationErrorStatus(Object.assign(new Error('bad manifest'), { status: 400 })), 400);
});

test('resumable completion rejects a chunk whose magic bytes do not match', async () => {
  const validStart = await request('POST', '/api/editor/uploads/start', {
    token: adminToken,
    body: { name: 'valid.pdf', mimeType: 'application/pdf', size: 5, kind: 'file' },
  });
  assert.equal(validStart.status, 200);
  const validId = validStart.body.uploadId;
  const validChunk = await request('PUT', `/api/editor/uploads/${validId}/chunk`, {
    token: adminToken,
    body: Buffer.from('%PDF-'),
    raw: true,
    headers: { 'Content-Range': 'bytes 0-4/5' },
  });
  assert.equal(validChunk.status, 200);
  const validComplete = await request('POST', `/api/editor/uploads/${validId}/complete`, {
    token: adminToken,
    body: {},
  });
  assert.equal(validComplete.status, 200);
  const lateChunk = await request('PUT', `/api/editor/uploads/${validId}/chunk`, {
    token: adminToken,
    body: Buffer.from('%PDF-'),
    raw: true,
    headers: { 'Content-Range': 'bytes 0-4/5' },
  });
  assert.equal(lateChunk.status, 409);

  const invalidStart = await request('POST', '/api/editor/uploads/start', {
    token: adminToken,
    body: { name: 'invalid.pdf', mimeType: 'application/pdf', size: 5, kind: 'file' },
  });
  assert.equal(invalidStart.status, 200);
  const invalidId = invalidStart.body.uploadId;
  const invalidChunk = await request('PUT', `/api/editor/uploads/${invalidId}/chunk`, {
    token: adminToken,
    body: Buffer.from('hello'),
    raw: true,
    headers: { 'Content-Range': 'bytes 0-4/5' },
  });
  assert.equal(invalidChunk.status, 200);
  const invalidComplete = await request('POST', `/api/editor/uploads/${invalidId}/complete`, {
    token: adminToken,
    body: {},
  });
  assert.equal(invalidComplete.status, 400);

  await request('DELETE', `/api/editor/uploads/${validId}`, { token: adminToken });
  await request('DELETE', `/api/editor/uploads/${invalidId}`, { token: adminToken });
});
