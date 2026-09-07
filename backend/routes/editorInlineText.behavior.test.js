import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-inline-editor-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'inline-editor-secret';
process.env.NODE_ENV = 'test';

const [{ createApp }, { signToken }] = await Promise.all([
  import('../app.js?inline-editor-text'),
  import('../middleware/auth.js?inline-editor-text'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;
const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

function request(method, requestPath, { token, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(String(body)));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(payload ? { 'Content-Length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(rawBody.toString('utf8')); } catch { /* non-JSON response */ }
        resolve({ status: res.statusCode, body: parsed, rawBody });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(fields) {
  const boundary = 'jer-inline-editor-boundary';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from('--' + boundary + '\r\n'
      + 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n'
      + String(value) + '\r\n'));
  }
  chunks.push(Buffer.from('--' + boundary + '--\r\n'));
  return {
    body: Buffer.concat(chunks),
    contentType: 'multipart/form-data; boundary=' + boundary,
  };
}

async function loadContent() {
  const response = await request('GET', '/api/editor/content', { token: adminToken });
  assert.equal(response.status, 200, response.rawBody.toString('utf8'));
  return response.body;
}

async function publish(operations) {
  const current = await loadContent();
  const form = multipart({
    settings: '{}',
    content: JSON.stringify({
      baseRevision: current.revision,
      quickTopics: current.quickTopics,
      operations,
    }),
    file_manifest: '[]',
    base_revision: String(current.revision),
  });
  return request('POST', '/api/editor/publish', {
    token: adminToken,
    body: form.body,
    headers: { 'Content-Type': form.contentType },
  });
}

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('inline category and material text updates preserve their public URLs', async () => {
  const before = await loadContent();
  const category = before.categories[0];
  const material = before.materials[0];
  const categorySlug = category.slug;
  const materialSlug = material.slug;
  const heroLayout = JSON.stringify({ hero: { title: 'Canvas material title', subtitle: 'Canvas subtitle' } });

  const response = await publish([
    { entity: 'category', action: 'update', id: category.id, data: { name: 'Canvas category', description: 'Visible category description' } },
    { entity: 'material', action: 'update', id: material.id, data: { title: 'Canvas material', content_description: 'Visible material body', page_layout: heroLayout } },
  ]);
  assert.equal(response.status, 200, response.rawBody.toString('utf8'));

  const afterPublish = await loadContent();
  const updatedCategory = afterPublish.categories.find((item) => item.id === category.id);
  const updatedMaterial = afterPublish.materials.find((item) => item.id === material.id);
  assert.equal(updatedCategory.name, 'Canvas category');
  assert.equal(updatedCategory.description, 'Visible category description');
  assert.equal(updatedCategory.slug, categorySlug);
  assert.equal(updatedMaterial.title, 'Canvas material');
  assert.equal(updatedMaterial.content_description, 'Visible material body');
  assert.equal(updatedMaterial.slug, materialSlug);
  assert.equal(JSON.parse(updatedMaterial.page_layout).hero.title, 'Canvas material title');
});

test('inline text rejects blank required titles and malformed layout without changing saved data', async () => {
  const before = await loadContent();
  const category = before.categories[0];
  const material = before.materials[0];

  const blankCategory = await publish([
    { entity: 'category', action: 'update', id: category.id, data: { name: '   ' } },
  ]);
  assert.equal(blankCategory.status, 400);

  const badLayout = await publish([
    { entity: 'material', action: 'update', id: material.id, data: { page_layout: '{not-json' } },
  ]);
  assert.equal(badLayout.status, 400);

  const afterRejects = await loadContent();
  assert.equal(afterRejects.categories.find((item) => item.id === category.id).name, category.name);
  assert.equal(afterRejects.materials.find((item) => item.id === material.id).page_layout, material.page_layout);
});
