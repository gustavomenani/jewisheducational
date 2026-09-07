import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-http-behavior-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'behavior-test-secret';
process.env.NODE_ENV = 'test';

const [{ createApp }, db, { signToken }] = await Promise.all([
  import('../app.js'),
  import('../db/index.js'),
  import('../middleware/auth.js'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;

function request(method, requestPath, { token, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const requestHeaders = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers,
    };
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers: requestHeaders }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('HTTP duplication copies multiple files and removes partial copies on failure', async () => {
  const source = await db.resourceCreate({ title: 'HTTP source', slug: 'http-source', is_published: 1 });
  const first = await db.fileCreate(source.id, { file_name: 'source-one.pdf', original_name: 'One.pdf', mime_type: 'application/pdf', file_type: 'pdf' });
  const second = await db.fileCreate(source.id, { file_name: 'source-two.pdf', original_name: 'Two.pdf', mime_type: 'application/pdf', file_type: 'pdf' });
  await db.storageUpload(Buffer.from('one'), `files/${first.file_name}`, 'application/pdf');
  await db.storageUpload(Buffer.from('two'), `files/${second.file_name}`, 'application/pdf');

  const copied = await request('POST', `/api/resources/${source.id}/duplicate`, { token: adminToken });
  assert.equal(copied.status, 201);
  const clonedFiles = copied.body.length ? JSON.parse(copied.body.toString()).resource.files : [];
  assert.equal(clonedFiles.length, 2);
  assert.notEqual(clonedFiles[0].file_name, first.file_name);
  assert.notEqual(clonedFiles[1].file_name, second.file_name);
  assert.ok(await db.storageStat(`files/${clonedFiles[0].file_name}`));
  assert.ok(await db.storageStat(`files/${clonedFiles[1].file_name}`));

  const broken = await db.resourceCreate({ title: 'HTTP broken', slug: 'http-broken', is_published: 1 });
  await db.fileCreate(broken.id, { file_name: 'missing.pdf', original_name: 'Missing.pdf', mime_type: 'application/pdf', file_type: 'pdf' });
  const before = (await db.resourceAdminList()).resources.length;
  const failed = await request('POST', `/api/resources/${broken.id}/duplicate`, { token: adminToken });
  assert.equal(failed.status, 500);
  assert.equal((await db.resourceAdminList()).resources.length, before);
});

test('HTTP download has a view-only first step and one idempotent delivery', async () => {
  const user = await db.userCreate({ name: 'Behavior user', email: 'behavior@example.com', password_hash: 'not-used' });
  const token = signToken({ id: user.id, email: user.email, role: 'user' });
  const resource = await db.resourceCreate({ title: 'HTTP download', slug: 'http-download', is_published: 1 });
  const file = await db.fileCreate(resource.id, {
    file_name: 'download.pdf', original_name: 'Download.pdf', mime_type: 'application/pdf', file_type: 'pdf',
  });
  await db.storageUpload(Buffer.from('download-payload'), `files/${file.file_name}`, 'application/pdf');

  assert.equal(await db.downloadCountByUser(user.id, { period: 'day', mode: 'global' }), 0);
  const prepared = await request('GET', `/api/downloads/prepare/${resource.id}/${file.id}`, { token });
  assert.equal(prepared.status, 200);
  const view = await request('GET', `/api/downloads/view/${resource.id}/${file.id}`, { token });
  assert.equal(view.status, 200);
  assert.match(view.headers['content-disposition'], /^inline;/);
  assert.equal(view.body.toString(), 'download-payload');
  assert.equal(await db.downloadCountByUser(user.id, { period: 'day', mode: 'global' }), 0);

  const requestId = 'behavior-download-request';
  const delivered = await request('GET', `/api/downloads/${resource.id}/${file.id}`, {
    token,
    headers: { 'X-Download-Request-Id': requestId },
  });
  assert.equal(delivered.status, 200);
  assert.match(delivered.headers['content-disposition'], /^attachment;/);
  assert.equal(delivered.body.toString(), 'download-payload');

  for (let i = 0; i < 20 && !(await db.downloadCountByUser(user.id, { period: 'day', mode: 'global' })); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(await db.downloadCountByUser(user.id, { period: 'day', mode: 'global' }), 1);
  assert.equal((await db.resourceFindById(resource.id)).download_count, 1);
  const duplicate = await request('GET', `/api/downloads/${resource.id}/${file.id}`, {
    token,
    headers: { 'X-Download-Request-Id': requestId },
  });
  assert.equal(duplicate.status, 409);
});

test('protected preview respects quota without creating a download', async () => {
  const user = await db.userCreate({ name: 'Quota user', email: 'quota@example.com', password_hash: 'not-used' });
  const token = signToken({ id: user.id, email: user.email, role: 'user' });
  const resource = await db.resourceCreate({ title: 'Quota preview', slug: 'quota-preview', is_published: 1 });
  const file = await db.fileCreate(resource.id, {
    file_name: 'quota.pdf', original_name: 'Quota.pdf', mime_type: 'application/pdf', file_type: 'pdf',
  });
  await db.storageUpload(Buffer.from('quota-payload'), 'files/quota.pdf', 'application/pdf');
  await db.settingsUpsert('download_limit_enabled', 'true');
  await db.settingsUpsert('download_limit_max', '1');
  await db.settingsUpsert('download_limit_period', 'day');
  await db.settingsUpsert('download_limit_mode', 'global');
  await db.downloadCreate({ resource_id: resource.id, file_id: file.id, user_id: user.id });

  const view = await request('GET', `/api/downloads/view/${resource.id}/${file.id}`, { token });
  assert.equal(view.status, 429);
  assert.equal(await db.downloadCountByUser(user.id, { period: 'day', mode: 'global' }), 1);
});
