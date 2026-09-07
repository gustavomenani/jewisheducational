import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-category-visibility-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'category-visibility-secret';
process.env.NODE_ENV = 'test';

const [{ createApp }, db, { signToken }] = await Promise.all([
  import('../app.js?category-visibility'),
  import('../db/index.js?category-visibility'),
  import('../middleware/auth.js?category-visibility'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;
const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

function request(requestPath, token = '') {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('hidden categories and their children are absent from public category responses but remain manageable by an admin', async () => {
  const visible = await db.categoryCreate({ name: 'Visible', slug: 'visible', nav_visible: 1 });
  const hidden = await db.categoryCreate({ name: 'Hidden', slug: 'hidden', nav_visible: 0 });
  await db.categoryCreate({ name: 'Hidden child', slug: 'hidden-child', parent_id: hidden.insertId, nav_visible: 1 });

  const publicResponse = await request('/api/categories');
  assert.equal(publicResponse.status, 200);
  assert.ok(publicResponse.body.categories.some((category) => category.id === visible.insertId));
  assert.equal(publicResponse.body.categories.some((category) => category.id === hidden.insertId), false);
  assert.equal(publicResponse.body.categories.some((category) => category.slug === 'hidden-child'), false);

  const adminResponse = await request('/api/categories?include_hidden=true', adminToken);
  assert.equal(adminResponse.status, 200);
  assert.ok(adminResponse.body.categories.some((category) => category.id === hidden.insertId));
  assert.ok(adminResponse.body.categories.some((category) => category.slug === 'hidden-child'));
});
