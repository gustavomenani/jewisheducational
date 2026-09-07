import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRobotsTxt,
  buildSitemapXml,
  collectSitemapResources,
  escapeXml,
  renderSeoShell,
} from './seo.js';

test('robots output is plain text, blocks private paths, and points to the configured sitemap origin', () => {
  const robots = buildRobotsTxt('https://custom.example');
  assert.match(robots, /^User-agent: \*/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/resource\/\*\/download\//);
  assert.match(robots, /Disallow: \/resource\/\*\/present\//);
  assert.match(robots, /Sitemap: https:\/\/custom\.example\/sitemap\.xml/);
  assert.doesNotMatch(robots, /<!doctype html>/i);
});

test('sitemap resource collection follows adapter pagination until total is exhausted', async () => {
  const calls = [];
  const resources = await collectSitemapResources(async (params) => {
    calls.push(params);
    if (params.offset === 0) return { resources: [{ slug: 'first' }, { slug: 'second' }], total: 3 };
    return { resources: [{ slug: 'third' }], total: 3 };
  }, { pageSize: 2 });
  assert.deepEqual(resources.map((resource) => resource.slug), ['first', 'second', 'third']);
  assert.deepEqual(calls.map((call) => call.offset), [0, 2]);
  assert.deepEqual(calls.map((call) => call.limit), [2, 2]);
});

test('sitemap includes public core, category, and resource URLs with escaped XML', () => {
  const xml = buildSitemapXml({
    categories: [
      { id: 1, slug: 'hebrew', name: 'Hebrew', is_archived: 0, sort_order: 1 },
      { id: 2, slug: 'archived', name: 'Archived', is_archived: 1, sort_order: 2 },
      { id: 3, slug: 'child-of-archived', name: 'Child', parent_id: 2, is_archived: 0, sort_order: 3 },
    ],
    resources: [
      { slug: 'aleph-bet', title: 'Aleph & Bet', category_id: 1, is_published: 1, is_archived: 0 },
      { slug: 'hidden', title: 'Hidden', category_id: 2, is_published: 1, is_archived: 0 },
      { slug: 'draft', title: 'Draft', category_id: 1, is_published: 0, is_archived: 0 },
    ],
  });
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /https:\/\/jewisheducationalresources\.org\/library/);
  assert.match(xml, /https:\/\/jewisheducationalresources\.org\/library\/category\/hebrew/);
  assert.match(xml, /https:\/\/jewisheducationalresources\.org\/resource\/aleph%20-bet|https:\/\/jewisheducationalresources\.org\/resource\/aleph-bet/);
  assert.doesNotMatch(xml, /\/category\/archived|\/category\/child-of-archived|\/resource\/hidden|\/resource\/draft/);
  assert.doesNotMatch(xml, /\/downloads\//);
  assert.equal(escapeXml('A & <B> "C"'), 'A &amp; &lt;B&gt; &quot;C&quot;');
});

test('sitemap emits a safe core fallback when there is no public data', () => {
  const xml = buildSitemapXml();
  assert.match(xml, /https:\/\/jewisheducationalresources\.org\//);
  assert.match(xml, /https:\/\/jewisheducationalresources\.org\/library/);
  assert.doesNotMatch(xml, /undefined|null/);
});

test('sitemap treats string and boolean publication flags consistently', () => {
  const xml = buildSitemapXml({
    categories: [{ id: 1, slug: 'hebrew', is_archived: '0' }],
    resources: [
      { slug: 'published-string', category_id: 1, is_published: '1', is_archived: '0' },
      { slug: 'published-boolean', category_id: 1, is_published: true, is_archived: false },
      { slug: 'draft-boolean', category_id: 1, is_published: false, is_archived: false },
      { slug: 'draft-string', category_id: 1, is_published: '0', is_archived: '0' },
    ],
  });
  assert.match(xml, /published-string/);
  assert.match(xml, /published-boolean/);
  assert.doesNotMatch(xml, /draft-boolean|draft-string/);
});

test('server-rendered public shell exposes canonical social metadata and JSON-LD before JavaScript runs', () => {
  const html = renderSeoShell(
    '<html><head><title>Default</title><meta name="description" content="Default"><link rel="canonical" href="https://old.example/"></head><body></body></html>',
    {
      siteName: 'Jewish Educational Resources',
      title: 'Aleph < Bet',
      description: 'Printable Hebrew worksheets.',
      canonical: '/resource/aleph-bet',
      image: '/images/cover.png',
      jsonLd: { '@context': 'https://schema.org', name: '</script><script>alert(1)</script>' },
    }
  );
  assert.match(html, /<title>Aleph &lt; Bet \| Jewish Educational Resources<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/jewisheducationalresources\.org\/resource\/aleph-bet"/);
  assert.match(html, /property="og:title" content="Aleph &lt; Bet \| Jewish Educational Resources"/);
  assert.match(html, /data-jer-seo-jsonld/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test('server-rendered private shell removes canonical and social index signals', () => {
  const html = renderSeoShell(
    '<html><head><title>Default</title><meta property="og:title" content="Default"><link rel="canonical" href="https://old.example/"></head><body></body></html>',
    {
      siteName: 'Jewish Educational Resources',
      title: 'Download Resource',
      description: 'Private page',
      canonical: null,
      robots: 'noindex,nofollow,noarchive',
    }
  );
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /property="og:title"/);
});

test('server-rendered filtered catalog shell keeps only the parent canonical', () => {
  const html = renderSeoShell(
    '<html><head><title>Default</title><meta name="description" content="Default"><link rel="canonical" href="https://old.example/"></head><body></body></html>',
    {
      siteName: 'Jewish Educational Resources',
      title: 'Resource Library',
      description: 'Filtered results',
      canonical: '/library',
      robots: 'noindex,follow',
    }
  );
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/jewisheducationalresources\.org\/library"/);
  assert.doesNotMatch(html, /property="og:title"/);
  assert.doesNotMatch(html, /data-jer-seo-jsonld/);
});
