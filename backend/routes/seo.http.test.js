import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-seo-http-'));
process.env.DB_DRIVER = 'memory';
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');
process.env.JWT_SECRET = 'seo-http-test-secret';
process.env.NODE_ENV = 'test';

const { default: seoRoutes } = await import('./seo.js');
const app = express();
app.use('/', seoRoutes);
const server = await new Promise((resolve) => {
  const instance = app.listen(0, () => resolve(instance));
});
const port = server.address().port;

function request(requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('HTTP sitemap endpoint returns crawlable XML and safe cache headers', async () => {
  const response = await request('/sitemap.xml');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/xml/);
  assert.match(response.headers['cache-control'], /max-age=300/);
  assert.match(response.body, /<urlset/);
  assert.match(response.body, /https:\/\/jewisheducationalresources\.org\/library/);
});

test('HTTP robots endpoint returns plain crawl rules instead of the SPA shell', async () => {
  const response = await request('/robots.txt');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /text\/plain/);
  assert.match(response.headers['cache-control'], /max-age=3600/);
  assert.match(response.body, /User-agent: \*/);
  assert.match(response.body, /Sitemap: https:\/\/jewisheducationalresources\.org\/sitemap\.xml/);
  assert.doesNotMatch(response.body, /<!doctype html>/i);
});

test('HTTP public shell serves server metadata before the Vue bundle', async () => {
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-type'], /text\/html/);
  assert.match(home.body, /<meta name="robots" content="index,follow">/);
  assert.match(home.body, /rel="canonical" href="https:\/\/jewisheducationalresources\.org\/"/);
  assert.match(home.body, /data-jer-seo-jsonld/);

  const missingResource = await request('/resource/does-not-exist');
  assert.equal(missingResource.status, 404);
  assert.match(missingResource.body, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(missingResource.body, /rel="canonical"/);
});

test('HTTP filtered catalog URLs are noindex before JavaScript runs', async () => {
  const response = await request('/library?q=hebrew');
  assert.equal(response.status, 200);
  assert.match(response.body, /name="robots" content="noindex,follow"/);
  assert.match(response.body, /rel="canonical" href="https:\/\/jewisheducationalresources\.org\/library"/);
  assert.doesNotMatch(response.body, /data-jer-seo-jsonld/);

  const paginated = await request('/library?page=2');
  assert.equal(paginated.status, 200);
  assert.match(paginated.body, /name="robots" content="noindex,follow"/);
  assert.match(paginated.body, /rel="canonical" href="https:\/\/jewisheducationalresources\.org\/library"/);
});
