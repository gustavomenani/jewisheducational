import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-google-slides-cover-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'google-slides-cover-secret';
process.env.NODE_ENV = 'test';

const [{ createApp }, db, { signToken }] = await Promise.all([
  import('../app.js?google-slides-cover'),
  import('../db/index.js?google-slides-cover'),
  import('../middleware/auth.js?google-slides-cover'),
]);

const app = createApp();
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;
const adminToken = signToken({ id: 1, email: 'admin@example.com', role: 'admin' });

function request(method, requestPath, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, body: JSON.parse(raw.toString('utf8')) });
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

test('regenerating an imported presentation cover uses Google’s native first slide before the PPTX fallback', async () => {
  const resource = await db.resourceCreate({
    title: 'Native Google cover',
    slug: 'native-google-cover',
    google_slides_url: 'https://docs.google.com/presentation/d/abc_123/edit',
    is_published: 1,
    is_archived: 0,
  });
  await db.fileCreate(resource.id, {
    file_name: 'imported-slides.pptx',
    original_name: 'Google Slides - abc_123.pptx',
    file_type: 'pptx',
  });

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url === 'https://docs.google.com/presentation/d/abc_123/embed') {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => 'docData: [[1280,720],[["actual_first",0,"",[]]]];',
      };
    }
    assert.equal(url, 'https://docs.google.com/presentation/d/abc_123/export/png?pageid=actual_first');
    return new Response(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==', 'base64'),
      { headers: { 'content-type': 'image/png' } },
    );
  };

  try {
    const response = await request('POST', `/api/resources/${resource.id}/generate-cover`);
    assert.equal(response.status, 200);
    assert.match(response.body.cover_image, /^\/uploads\/covers\//);
  } finally {
    global.fetch = originalFetch;
  }
});

test('importing Google Slides retains its safe source URL for the native viewer and cover', async () => {
  const resource = await db.resourceCreate({
    title: 'Imported source',
    slug: 'imported-source',
    cover_image: '/uploads/covers/outdated.jpg',
    is_published: 1,
    is_archived: 0,
  });
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    if (url.endsWith('/export/pptx')) {
      return new Response(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14]), {
        headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      });
    }
    if (url === 'https://docs.google.com/presentation/d/import_456/embed') {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => 'docData: [[1280,720],[["first_real_slide",0,"",[]]]];',
      };
    }
    assert.equal(url, 'https://docs.google.com/presentation/d/import_456/export/png?pageid=first_real_slide');
    return new Response(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==', 'base64'),
      { headers: { 'content-type': 'image/png' } },
    );
  };

  try {
    const response = await request('POST', `/api/resources/${resource.id}/import-google-slides`, {
      url: 'https://docs.google.com/presentation/d/import_456/edit?usp=sharing',
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const refreshed = await db.resourceFindById(resource.id);
    assert.equal(
      refreshed.google_slides_url,
      'https://docs.google.com/presentation/d/import_456/edit',
    );
    assert.match(refreshed.cover_image, /^\/uploads\/covers\//);
    assert.notEqual(refreshed.cover_image, '/uploads/covers/outdated.jpg');
    assert.deepEqual(requestedUrls, [
      'https://docs.google.com/presentation/d/import_456/export/pptx',
      'https://docs.google.com/presentation/d/import_456/embed',
      'https://docs.google.com/presentation/d/import_456/export/png?pageid=first_real_slide',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('admin refreshes existing covers for every imported Google Slides presentation only', async () => {
  const imported = await db.resourceCreate({
    title: 'Refresh imported Google cover',
    slug: 'refresh-imported-google-cover',
    cover_image: '/uploads/covers/outdated-google-cover.jpg',
    is_published: 1,
    is_archived: 0,
  });
  await db.fileCreate(imported.id, {
    file_name: 'refresh-imported-slides.pptx',
    original_name: 'Google Slides - refresh_123.pptx',
    file_type: 'pptx',
  });
  const untouched = await db.resourceCreate({
    title: 'Keep non-Google cover',
    slug: 'keep-non-google-cover',
    cover_image: '/uploads/covers/manual-cover.jpg',
    is_published: 1,
    is_archived: 0,
  });
  await db.fileCreate(untouched.id, {
    file_name: 'manual-presentation.pptx',
    original_name: 'Manual presentation.pptx',
    file_type: 'pptx',
  });
  const withoutCover = await db.resourceCreate({
    title: 'Do not create a new Google cover',
    slug: 'do-not-create-a-new-google-cover',
    is_published: 1,
    is_archived: 0,
  });
  await db.fileCreate(withoutCover.id, {
    file_name: 'no-cover-slides.pptx',
    original_name: 'Google Slides - no_cover_123.pptx',
    file_type: 'pptx',
  });

  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    const pageIds = {
      'https://docs.google.com/presentation/d/abc_123/embed': 'actual_first',
      'https://docs.google.com/presentation/d/import_456/embed': 'first_real_slide',
      'https://docs.google.com/presentation/d/refresh_123/embed': 'current_first_slide',
    };
    if (pageIds[url]) {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => `docData: [[1280,720],[["${pageIds[url]}",0,"",[]]]];`,
      };
    }
    assert.match(url, /^https:\/\/docs\.google\.com\/presentation\/d\/(?:abc_123|import_456|refresh_123)\/export\/png\?pageid=/);
    return new Response(
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==', 'base64'),
      { headers: { 'content-type': 'image/png' } },
    );
  };

  try {
    const response = await request('POST', '/api/resources/admin/refresh-google-slides-covers');
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { total: 3, generated: 3, skipped: [] });
    assert.match((await db.resourceFindById(imported.id)).cover_image, /^\/uploads\/covers\//);
    assert.notEqual((await db.resourceFindById(imported.id)).cover_image, '/uploads/covers/outdated-google-cover.jpg');
    assert.equal((await db.resourceFindById(untouched.id)).cover_image, '/uploads/covers/manual-cover.jpg');
    assert.equal((await db.resourceFindById(withoutCover.id)).cover_image, null);
    assert.ok(requestedUrls.includes('https://docs.google.com/presentation/d/refresh_123/embed'));
    assert.ok(requestedUrls.includes('https://docs.google.com/presentation/d/refresh_123/export/png?pageid=current_first_slide'));
    assert.equal(requestedUrls.some((url) => String(url).includes('no_cover_123')), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a published Google Slides link remains a direct native presentation instead of using a different Drive export URL', async () => {
  const resource = await db.resourceCreate({
    title: 'Published source',
    slug: 'published-source',
    is_published: 1,
    is_archived: 0,
  });
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    assert.equal(url, 'https://docs.google.com/presentation/d/e/2PACX-published/embed');
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => [
        'docData: [[1280,720],[["published_first",0,"",[]]]];',
        "SK_svgData = '\\x3csvg width=\\x221280\\x22 height=\\x22720\\x22 xmlns=\\x22http://www.w3.org/2000/svg\\x22\\x3e\\x3crect width=\\x221280\\x22 height=\\x22720\\x22 fill=\\x22#abcdef\\x22/\\x3e\\x3c/svg\\x3e';",
        "SK_viewerApp.setPageData('published_first', SK_svgData, []);",
      ].join(' '),
    };
  };

  try {
    const response = await request('POST', `/api/resources/${resource.id}/import-google-slides`, {
      url: 'https://docs.google.com/presentation/d/e/2PACX-published/pub?start=false',
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.linked_only, true);
    const refreshed = await db.resourceFindById(resource.id);
    assert.equal(
      refreshed.google_slides_url,
      'https://docs.google.com/presentation/d/e/2PACX-published/pub',
    );
    assert.match(refreshed.cover_image, /^\/uploads\/covers\//);
    assert.deepEqual(requestedUrls, ['https://docs.google.com/presentation/d/e/2PACX-published/embed']);
  } finally {
    global.fetch = originalFetch;
  }
});
