import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-canva-presentation-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'canva-presentation-secret';
process.env.NODE_ENV = 'test';

const [{ createApp }, db, { signToken }] = await Promise.all([
  import('../app.js?canva-presentation'),
  import('../db/index.js?canva-presentation'),
  import('../middleware/auth.js?canva-presentation'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;
const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

function multipart(fields) {
  const boundary = 'jer-canva-presentation-boundary';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function request(method, requestPath, { token = '', body = null, contentType = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': contentType, 'Content-Length': body.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('admin creates a Canva-only presentation with no downloadable file', async () => {
  const payload = multipart({
    title: 'Canva linked presentation',
    canva_url: 'https://www.canva.com/design/DAGabc_123/shareKey/view?utm_source=uniquelinks',
    material_type: 'Presentation',
    is_published: 'true',
  });
  const created = await request('POST', '/api/resources', {
    token: adminToken,
    body: payload.body,
    contentType: payload.contentType,
  });

  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.resource.canva_url, 'https://www.canva.com/design/DAGabc_123/shareKey/view');
  assert.deepEqual(created.body.resource.files, []);

  const publicResource = await request('GET', `/api/resources/${created.body.resource.slug}`);
  assert.equal(publicResource.status, 200);
  assert.equal(publicResource.body.resource.canva_url, created.body.resource.canva_url);
  assert.deepEqual(publicResource.body.resource.files, []);
});

test('API rejects unsafe Canva links and competing presentation providers', async () => {
  const invalid = multipart({ title: 'Unsafe Canva', canva_url: 'https://example.com/design/DAGabc_123/view' });
  const invalidResponse = await request('POST', '/api/resources', {
    token: adminToken, body: invalid.body, contentType: invalid.contentType,
  });
  assert.equal(invalidResponse.status, 400);

  const competing = multipart({
    title: 'Two providers',
    canva_url: 'https://www.canva.com/design/DAGabc_123/view',
    google_slides_url: 'https://docs.google.com/presentation/d/abc_123/edit',
  });
  const competingResponse = await request('POST', '/api/resources', {
    token: adminToken, body: competing.body, contentType: competing.contentType,
  });
  assert.equal(competingResponse.status, 400);
});

test('linking Google Slides explicitly replaces an existing Canva provider', async () => {
  const resource = await db.resourceCreate({
    title: 'Switch provider',
    slug: 'switch-provider',
    canva_url: 'https://www.canva.com/design/DAGabc_123/view',
    is_published: 1,
  });
  const body = Buffer.from(JSON.stringify({
    url: 'https://docs.google.com/presentation/d/e/2PACX-published/pub',
  }));
  const response = await request('POST', `/api/resources/${resource.id}/import-google-slides`, {
    token: adminToken,
    body,
    contentType: 'application/json',
  });

  assert.equal(response.status, 201, JSON.stringify(response.body));
  const updated = await db.resourceFindById(resource.id);
  assert.equal(updated.canva_url, null);
  assert.equal(updated.google_slides_url, 'https://docs.google.com/presentation/d/e/2PACX-published/pub');
});

test('presentation catalog filters and adapter projections include Canva-only materials', async () => {
  const resource = await db.resourceCreate({
    title: 'Canva catalog presentation',
    slug: 'canva-catalog-presentation',
    canva_url: 'https://www.canva.com/design/DAGcatalog_123/view',
    is_published: 1,
  });

  const catalog = await request('GET', '/api/resources?type=presentation');
  assert.equal(catalog.status, 200, JSON.stringify(catalog.body));
  const item = catalog.body.resources.find((candidate) => Number(candidate.id) === Number(resource.id));
  assert.ok(item, 'Canva-only material must remain in the presentation catalog filter');
  assert.equal(item.canva_url, resource.canva_url);

  const firestoreSource = fs.readFileSync(new URL('../db/firestoreDb.js', import.meta.url), 'utf8');
  const mysqlSource = fs.readFileSync(new URL('../db/mysqlDb.js', import.meta.url), 'utf8');
  assert.match(firestoreSource, /r\.canva_url\s*\|\|\s*\(types/);
  assert.match(firestoreSource, /canva_url:\s*r\.canva_url\s*\|\|\s*null/);
  assert.match(mysqlSource, /r\.canva_url IS NOT NULL/);
});

test('favorite projections preserve Canva presentation links in production adapters', () => {
  const firestoreSource = fs.readFileSync(new URL('../db/firestoreDb.js', import.meta.url), 'utf8');
  const mysqlSource = fs.readFileSync(new URL('../db/mysqlDb.js', import.meta.url), 'utf8');
  assert.match(firestoreSource, /canva_url:\s*r\.canva_url\s*\|\|\s*null[\s\S]*files:\s*await filesByResource/);
  assert.match(mysqlSource, /SELECT r\.id, r\.title, r\.slug, r\.description, r\.cover_image, r\.canva_url/);
});
