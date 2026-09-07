import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBreadcrumbSchema,
  buildCollectionPageSchema,
  buildLearningResourceSchema,
  buildWebSiteSchema,
  canonicalUrl,
  clipDescription,
  isPrivateRoute,
  routeSeoPolicy,
} from './seo.js';

test('canonical URLs always use the configured production origin and drop tracking state', () => {
  assert.equal(
    canonicalUrl('/library/?utm_source=search#top'),
    'https://jewisheducationalresources.org/library'
  );
  assert.equal(
    canonicalUrl('https://example.invalid/resource/item?utm_source=spam'),
    'https://example.invalid/resource/item'
  );
});

test('SEO descriptions are whitespace-normalized and bounded without cutting a word when possible', () => {
  assert.equal(clipDescription('  Jewish   worksheets\nfor schools.  '), 'Jewish worksheets for schools.');
  const result = clipDescription('A very long description '.repeat(20), 80);
  assert.ok(result.length <= 80);
  assert.equal(result.endsWith('…'), true);
});

test('breadcrumb schema preserves order and canonicalizes linked crumbs', () => {
  const schema = buildBreadcrumbSchema([
    { name: 'Library', path: '/library' },
    { name: 'Hebrew', path: '/library/category/hebrew' },
    { name: 'Aleph-Bet' },
  ]);
  assert.equal(schema['@type'], 'BreadcrumbList');
  assert.deepEqual(schema.itemListElement.map((item) => item.position), [1, 2, 3]);
  assert.equal(schema.itemListElement[1].item, 'https://jewisheducationalresources.org/library/category/hebrew');
  assert.equal('item' in schema.itemListElement[2], false);
});

test('website schema exposes a real internal search action', () => {
  const schema = buildWebSiteSchema();
  assert.equal(schema['@type'], 'WebSite');
  assert.match(schema.potentialAction.target, /\/library\?q=\{search_term_string\}$/);
  assert.equal(schema.inLanguage, 'en');
});

test('collection schema contains only linked material items', () => {
  const schema = buildCollectionPageSchema({
    name: 'Hebrew Resources',
    path: '/library/category/hebrew',
    items: [
      { name: 'Aleph-Bet', path: '/resource/aleph-bet' },
      { name: 'Unlinked placeholder' },
    ],
  });
  assert.equal(schema['@type'][0], 'CollectionPage');
  assert.equal(schema.mainEntity.itemListElement.length, 1);
  assert.equal(schema.mainEntity.itemListElement[0].url, 'https://jewisheducationalresources.org/resource/aleph-bet');
});

test('learning resource schema describes public educational content without protected file URLs', () => {
  const schema = buildLearningResourceSchema({
    path: '/resource/aleph-bet',
    image: '/uploads/covers/aleph.jpg',
    resource: {
      title: 'Aleph-Bet Practice',
      slug: 'aleph-bet',
      description: 'Practice writing Hebrew letters.',
      category_name: 'Hebrew',
      material_type: 'Worksheet',
      grade_level: 'Kindergarten',
      keywords: 'hebrew, letters',
      is_premium: 0,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  });
  assert.equal(schema['@type'], 'LearningResource');
  assert.equal(schema.isAccessibleForFree, true);
  assert.equal(schema.image[0], 'https://jewisheducationalresources.org/uploads/covers/aleph.jpg');
  assert.equal(JSON.stringify(schema).includes('/downloads/'), false);
  assert.equal(schema.about.name, 'Hebrew');
});

test('protected, guest, and filtered routes are not indexable', () => {
  assert.equal(isPrivateRoute({ name: 'download', meta: { auth: true } }), true);
  assert.equal(isPrivateRoute({ name: 'presentation-play', meta: { auth: true } }), true);
  assert.equal(isPrivateRoute({ name: 'login', meta: { guest: true } }), true);
  assert.equal(isPrivateRoute({ name: 'admin-dashboard', meta: { auth: true, admin: true } }), true);
  assert.equal(isPrivateRoute({ name: 'resource', meta: {} }), false);
});

test('route policy keeps public pages canonical and private/filter states out of the index', () => {
  const resource = routeSeoPolicy({ name: 'resource', params: { slug: 'aleph-bet' }, query: {} });
  assert.equal(resource.canonical, '/resource/aleph-bet');
  assert.equal(resource.robots, 'index,follow');

  const filtered = routeSeoPolicy({ name: 'library', query: { q: 'hebrew' }, params: {} });
  assert.equal(filtered.canonical, '/library');
  assert.equal(filtered.robots, 'noindex,follow');

  const paginated = routeSeoPolicy({ name: 'category', params: { slug: 'hebrew' }, query: { page: '2' } });
  assert.equal(paginated.canonical, '/library/category/hebrew');
  assert.equal(paginated.robots, 'noindex,follow');

  const download = routeSeoPolicy({ name: 'download', meta: { auth: true }, query: {}, params: {} });
  assert.equal(download.canonical, null);
  assert.equal(download.robots, 'noindex,nofollow,noarchive');

  const presentation = routeSeoPolicy({ name: 'presentation-play', meta: { auth: true }, query: {}, params: {} });
  assert.equal(presentation.canonical, null);
  assert.equal(presentation.robots, 'noindex,nofollow,noarchive');
});
