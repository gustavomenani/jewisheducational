import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-canva-editor-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'canva-editor-test-secret';
process.env.NODE_ENV = 'test';
const [{ createApp }, { signToken }] = await Promise.all([
  import('../app.js'), import('../middleware/auth.js'),
]);
const server = await new Promise(resolve => {
  const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${server.address().port}`;
const token = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });
const canva = 'https://www.canva.com/design/DAGabc_123/shareKey';

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function resolveLink(url, authenticated = true) {
  return fetch(`${base}/api/editor/canva/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ url }),
  });
}

test('Canva link resolution requires an authenticated administrator', async () => {
  assert.equal((await resolveLink(`${canva}/view`, false)).status, 401);
  const db = await import('../db/index.js');
  const user = await db.userCreate({ name: 'Reader', email: 'reader@example.com', role: 'user', password_hash: 'unused' });
  const denied = await fetch(`${base}/api/editor/canva/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signToken(user)}` },
    body: JSON.stringify({ url: `${canva}/view` }),
  });
  assert.equal(denied.status, 403);
  const response = await resolveLink(`${canva}/edit?utm_source=sharebutton`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: `${canva}/view` });
});

test('Canva resolution rejects unrelated hosts and malformed links', async () => {
  for (const url of ['https://example.com/design/test/view', 'javascript:alert(1)', '', null, 'x'.repeat(2049)]) {
    assert.equal((await resolveLink(url)).status, 400);
  }
});

test('a published Canva library section is returned to visitors without changing the catalog', async () => {
  const before = await (await fetch(`${base}/api/resources`)).json();
  const content = await (await fetch(`${base}/api/editor/content`, { headers: { Authorization: `Bearer ${token}` } })).json();
  const document = { version: 2, pages: { library: { slots: { 'before-library': { sections: [{
    id: 'canva_section', props: { paddingY: 16, maxWidth: 1140 }, columns: [{
      id: 'canva_column', span: 12, blocks: [{ id: 'canva_block', type: 'canva', props: { url: `${canva}/view`, height: 560 } }],
    }],
  }] } } } } };
  const form = new FormData();
  form.append('settings', JSON.stringify({ site_document_v2_published: JSON.stringify(document) }));
  form.append('base_revision', String(content.revision));
  const publication = await fetch(`${base}/api/editor/publish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(publication.status, 200, await publication.text());
  const settings = await (await fetch(`${base}/api/settings`)).json();
  const saved = JSON.parse(settings.settings.site_document_v2_published);
  assert.equal(saved.pages.library.slots['before-library'].sections[0].columns[0].blocks[0].props.url, `${canva}/view`);
  assert.deepEqual(await (await fetch(`${base}/api/resources`)).json(), before);
});
