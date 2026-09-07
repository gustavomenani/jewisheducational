import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from '../db/index.js';

const router = Router();
const DEFAULT_SITE_URL = 'https://jewisheducationalresources.org';
const DEFAULT_SITE_NAME = 'Jewish Educational Resources';
const DEFAULT_SITE_DESCRIPTION = 'Printable Jewish educational resources, worksheets, activities, and presentations for schools, families, and educators.';
const ROBOTS_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
const SITEMAP_PAGE_SIZE = 500;
const SITEMAP_MAX_URLS = 50000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEO_SHELL_PATH = path.join(__dirname, '..', 'generated', 'index.html');
const SOURCE_SEO_SHELL_PATH = path.join(__dirname, '..', '..', 'frontend', 'index.html');

function siteOrigin() {
  const configured = String(
    process.env.SEO_SITE_URL
      || process.env.VITE_SITE_URL
      || process.env.FRONTEND_URL?.split(',')[0]
      || DEFAULT_SITE_URL
  ).trim();
  try {
    const url = new URL(configured);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function routeUrl(path) {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

function slugPath(prefix, slug) {
  return `${prefix}/${encodeURIComponent(String(slug || '').trim())}`;
}

function flagIsTrue(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function flagIsFalse(value) {
  return value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false';
}

function isArchived(value) {
  return flagIsTrue(value);
}

function isPublished(value) {
  return value === undefined || value === null || !flagIsFalse(value);
}

function lastModified(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textClip(value, maxLength = 160) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim();
  return `${clipped || clean.slice(0, maxLength - 1)}…`;
}

function brandTitle(title, siteName) {
  const cleanTitle = String(title || siteName).trim() || siteName;
  return cleanTitle === siteName || cleanTitle.endsWith(` | ${siteName}`)
    ? cleanTitle
    : `${cleanTitle} | ${siteName}`;
}

function absolutePageUrl(value) {
  if (!value) return '';
  if (/^https?:\/\//i.test(String(value))) return String(value);
  return routeUrl(String(value).startsWith('/') ? value : `/${value}`);
}

function schemaBreadcrumbs(items = []) {
  const valid = items.filter((item) => item?.name);
  if (!valid.length) return undefined;
  return {
    '@type': 'BreadcrumbList',
    itemListElement: valid.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absolutePageUrl(item.path) } : {}),
    })),
  };
}

function organizationSchema(siteName, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${routeUrl('/')}#organization`,
    name: siteName,
    url: routeUrl('/'),
    logo: absolutePageUrl('/logo-mark.svg'),
    description: textClip(description, 300),
  };
}

function websiteSchema(siteName, description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${routeUrl('/')}#website`,
    name: siteName,
    url: routeUrl('/'),
    description: textClip(description, 300),
    inLanguage: 'en',
    publisher: { '@id': `${routeUrl('/')}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${routeUrl('/library')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

function collectionSchema({ name, description, path: pagePath, items = [], breadcrumbs = [] }) {
  const pageUrl = routeUrl(pagePath);
  return {
    '@context': 'https://schema.org',
    '@type': ['CollectionPage', 'WebPage'],
    '@id': `${pageUrl}#collection`,
    name,
    description: textClip(description, 300),
    url: pageUrl,
    inLanguage: 'en',
    isPartOf: { '@id': `${routeUrl('/')}#website` },
    breadcrumb: schemaBreadcrumbs(breadcrumbs),
    mainEntity: items.length
      ? {
        '@type': 'ItemList',
        itemListElement: items.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: absolutePageUrl(item.path),
        })),
      }
      : undefined,
  };
}

function learningResourceSchema(resource, pagePath, image, breadcrumbs) {
  const pageUrl = routeUrl(pagePath);
  const premium = [true, 1, '1', 'true'].includes(resource.is_premium);
  const toIso = (value) => {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    '@id': `${pageUrl}#learning-resource`,
    name: resource.title,
    headline: resource.title,
    description: textClip(resource.description || resource.content_description, 300),
    url: pageUrl,
    image: image ? [absolutePageUrl(image)] : undefined,
    inLanguage: 'en',
    isAccessibleForFree: !premium,
    learningResourceType: resource.material_type || 'Educational resource',
    educationalLevel: resource.grade_level || resource.age_range,
    keywords: resource.keywords || undefined,
    about: resource.category_name ? { '@type': 'Thing', name: resource.category_name } : undefined,
    provider: { '@id': `${routeUrl('/')}#organization` },
    datePublished: toIso(resource.created_at),
    dateModified: toIso(resource.updated_at || resource.created_at),
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    breadcrumb: schemaBreadcrumbs(breadcrumbs),
  };
}

function settingsMap(rows) {
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.setting_key, row.setting_value]));
}

function hasCatalogFilter(query = {}) {
  return ['q', 'category', 'type', 'sort', 'access', 'grade', 'material_type', 'page', 'limit', 'offset']
    .some((key) => query[key] !== undefined && query[key] !== null && String(query[key]).trim() !== '');
}

function jsonLdScript(jsonLd) {
  if (!jsonLd) return '';
  const payload = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  return `<script type="application/ld+json" data-jer-seo-jsonld="true">${payload}</script>`;
}

export function renderSeoShell(template, {
  title,
  siteName = DEFAULT_SITE_NAME,
  description = DEFAULT_SITE_DESCRIPTION,
  canonical,
  image = '/images/cta/banner-mascot-clean.png',
  robots = 'index,follow',
  type = 'website',
  jsonLd = null,
} = {}) {
  const indexable = !/^noindex\b/i.test(robots);
  const canonicalizeToParent = canonical && /^noindex\s*,\s*follow\b/i.test(String(robots));
  const resolvedTitle = brandTitle(title, siteName);
  const resolvedDescription = textClip(description);
  const tags = [
    `<meta name="description" content="${htmlEscape(resolvedDescription)}">`,
    `<meta name="robots" content="${htmlEscape(robots)}">`,
  ];
  if (indexable) {
    const canonicalHref = absolutePageUrl(canonical || '/');
    const imageUrl = absolutePageUrl(image);
    tags.push(
      `<meta property="og:site_name" content="${htmlEscape(siteName)}">`,
      `<meta property="og:title" content="${htmlEscape(resolvedTitle)}">`,
      `<meta property="og:description" content="${htmlEscape(resolvedDescription)}">`,
      `<meta property="og:type" content="${htmlEscape(type)}">`,
      `<meta property="og:url" content="${htmlEscape(canonicalHref)}">`,
      `<meta property="og:image" content="${htmlEscape(imageUrl)}">`,
      `<meta property="og:image:alt" content="${htmlEscape(resolvedTitle)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${htmlEscape(resolvedTitle)}">`,
      `<meta name="twitter:description" content="${htmlEscape(resolvedDescription)}">`,
      `<meta name="twitter:image" content="${htmlEscape(imageUrl)}">`,
    );
  }
  if (indexable || canonicalizeToParent) {
    const canonicalHref = absolutePageUrl(canonical || '/');
    tags.push(`<link rel="canonical" href="${htmlEscape(canonicalHref)}">`);
  }

  let html = String(template || '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(resolvedTitle)}</title>`)
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']author["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>\s*/gi, '')
    .replace(/<\/head>/i, `${tags.join('\n    ')}\n    ${jsonLdScript(indexable ? jsonLd : null)}\n  </head>`);
  return html;
}

function readSeoShell() {
  for (const shellPath of [SEO_SHELL_PATH, SOURCE_SEO_SHELL_PATH]) {
    try {
      return fs.readFileSync(shellPath, 'utf8');
    } catch {
      // The generated shell is present in a Firebase function release; the
      // tracked frontend entry keeps clean-clone SSR checks self-contained.
    }
  }
  return null;
}

function withTimeout(promise, fallback, timeoutMs = 1500) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
  ]).catch(() => fallback);
}

function categoryPublic(category, categories) {
  if (!category) return false;
  const byId = new Map(categories.map((item) => [Number(item.id), item]));
  const visited = new Set();
  let current = category;
  while (current) {
    const id = Number(current.id);
    if (visited.has(id) || isArchived(current.is_archived)) return false;
    visited.add(id);
    current = current.parent_id ? byId.get(Number(current.parent_id)) : null;
  }
  return true;
}

async function serverPageMeta(req) {
  const rows = await withTimeout(db.settingsGetAll(), [], 1200);
  const settings = settingsMap(rows);
  const siteName = settings.site_name || 'Jewish Educational Resources';
  const siteDescription = settings.site_description || 'Printable Jewish educational resources, worksheets, activities, and presentations for schools, families, and educators.';
  const pagePath = req.path || '/';

  if (pagePath === '/') {
    return {
      siteName,
      title: siteName,
      description: siteDescription,
      canonical: '/',
      jsonLd: [websiteSchema(siteName, siteDescription), organizationSchema(siteName, siteDescription)],
    };
  }
  if (pagePath === '/library') {
    const filtered = hasCatalogFilter(req.query);
    const result = await withTimeout(db.resourceListFiltered({ params: {}, orderBy: 'featured', limit: 50, offset: 0 }), { resources: [] });
    const items = (result?.resources || []).filter((item) => item?.slug).map((item) => ({ name: item.title, path: `/resource/${item.slug}` }));
    return {
      siteName,
      title: 'Resource Library',
      description: 'Explore printable Jewish educational resources by subject, file type, grade, and age group.',
      canonical: '/library',
      robots: filtered ? 'noindex,follow' : 'index,follow',
      jsonLd: [
        websiteSchema(siteName, siteDescription),
        organizationSchema(siteName, siteDescription),
        collectionSchema({ name: 'Resource Library', description: 'Explore printable Jewish educational resources by subject, file type, grade, and age group.', path: '/library', items, breadcrumbs: [{ name: 'Library', path: '/library' }] }),
      ],
    };
  }

  const categoryMatch = pagePath.match(/^\/library\/category\/([^/]+)$/);
  if (categoryMatch) {
    const filtered = hasCatalogFilter(req.query);
    const slug = decodeURIComponent(categoryMatch[1]);
    const [category, categories] = await Promise.all([
      withTimeout(db.categoryFindBySlug(slug), null),
      withTimeout(db.categoryListAll(), []),
    ]);
    if (!category || !categoryPublic(category, categories)) {
      return { siteName, title: 'Category not found', description: siteDescription, canonical: null, robots: 'noindex,nofollow,noarchive', status: 404 };
    }
    const categoryIds = [Number(category.id), ...categories.filter((item) => Number(item.parent_id) === Number(category.id)).map((item) => Number(item.id))];
    const result = await withTimeout(db.resourceListFiltered({ params: { categoryIds }, orderBy: 'featured', limit: 50, offset: 0 }), { resources: [] });
    const items = (result?.resources || []).filter((item) => item?.slug).map((item) => ({ name: item.title, path: `/resource/${item.slug}` }));
    return {
      siteName,
      title: `${category.name} Resources`,
      description: category.description || `Browse Jewish educational resources in ${category.name} and related subtopics.`,
      canonical: `/library/category/${encodeURIComponent(category.slug)}`,
      robots: filtered ? 'noindex,follow' : 'index,follow',
      jsonLd: [
        websiteSchema(siteName, siteDescription),
        organizationSchema(siteName, siteDescription),
        collectionSchema({
          name: `${category.name} Resources`,
          description: category.description || `Browse Jewish educational resources in ${category.name} and related subtopics.`,
          path: `/library/category/${encodeURIComponent(category.slug)}`,
          items,
          breadcrumbs: [{ name: 'Library', path: '/library' }, { name: category.name }],
        }),
      ],
    };
  }

  const resourceMatch = pagePath.match(/^\/resource\/([^/]+)$/);
  if (resourceMatch) {
    if (req.query.assistir !== undefined) {
      return {
        siteName,
        title: 'Presentation Viewer',
        description: siteDescription,
        canonical: null,
        robots: 'noindex,nofollow,noarchive',
      };
    }
    const slug = decodeURIComponent(resourceMatch[1]);
    const resource = await withTimeout(db.resourceFindBySlug(slug, true), null);
    if (!resource) {
      return { siteName, title: 'Resource not found', description: siteDescription, canonical: null, robots: 'noindex,nofollow,noarchive', status: 404 };
    }
    const resourcePath = `/resource/${encodeURIComponent(resource.slug)}`;
    const breadcrumbs = [{ name: 'Library', path: '/library' }];
    if (resource.parent_category_name && resource.parent_category_slug) {
      breadcrumbs.push({ name: resource.parent_category_name, path: `/library/category/${encodeURIComponent(resource.parent_category_slug)}` });
    }
    if (resource.category_name && resource.category_slug) {
      breadcrumbs.push({ name: resource.category_name, path: `/library/category/${encodeURIComponent(resource.category_slug)}` });
    }
    breadcrumbs.push({ name: resource.title });
    return {
      siteName,
      title: resource.title,
      description: resource.description || resource.content_description || siteDescription,
      canonical: resourcePath,
      image: resource.cover_image,
      type: 'article',
      jsonLd: [
        organizationSchema(siteName, siteDescription),
        learningResourceSchema(resource, resourcePath, resource.cover_image, breadcrumbs),
      ],
    };
  }
  return null;
}

export function buildRobotsTxt(origin = siteOrigin()) {
  const sitemapOrigin = String(origin || siteOrigin()).replace(/\/+$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /login',
    'Disallow: /sign-up',
    'Disallow: /forgot-password',
    'Disallow: /reset-password',
    'Disallow: /my-account',
    'Disallow: /profile',
    'Disallow: /my-list',
    'Disallow: /resource/*/download/',
    'Disallow: /resource/*/present/',
    '',
    `Sitemap: ${sitemapOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

router.get('/robots.txt', (req, res) => {
  res
    .status(200)
    .type('text/plain')
    .set('Cache-Control', ROBOTS_CACHE_CONTROL)
    .send(buildRobotsTxt());
});

router.get(['/', '/library', '/library/category/:slug', '/resource/:slug'], async (req, res, next) => {
  const template = readSeoShell();
  if (!template) return next();
  const meta = await serverPageMeta(req);
  if (!meta) return next();
  res
    .status(meta.status || 200)
    .type('html')
    .set('Cache-Control', meta.status ? 'public, max-age=60' : 'public, max-age=60, stale-while-revalidate=300')
    .send(renderSeoShell(template, meta));
});

function publicCategoryIds(categories) {
  const byId = new Map(categories.map((category) => [Number(category.id), category]));
  const memo = new Map();
  function isPublic(id) {
    const numericId = Number(id);
    if (!numericId) return true;
    if (memo.has(numericId)) return memo.get(numericId);
    const category = byId.get(numericId);
    if (!category || isArchived(category.is_archived)) {
      memo.set(numericId, false);
      return false;
    }
    const result = !category.parent_id || isPublic(category.parent_id);
    memo.set(numericId, result);
    return result;
  }
  return new Set(categories.filter((category) => isPublic(category.id)).map((category) => Number(category.id)));
}

function urlEntry(path, { priority, changefreq, lastmod } = {}) {
  const modified = lastModified(lastmod);
  return [
    '  <url>',
    `    <loc>${escapeXml(routeUrl(path))}</loc>`,
    modified ? `    <lastmod>${escapeXml(modified)}</lastmod>` : '',
    changefreq ? `    <changefreq>${escapeXml(changefreq)}</changefreq>` : '',
    priority ? `    <priority>${escapeXml(priority)}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

export function buildSitemapXml({ categories = [], resources = [] } = {}) {
  const publicIds = publicCategoryIds(categories);
  const entries = [
    urlEntry('/', { priority: '1.0', changefreq: 'weekly' }),
    urlEntry('/library', { priority: '0.9', changefreq: 'daily' }),
  ];
  const seen = new Set(['/','/library']);

  [...categories]
    .filter((category) => publicIds.has(Number(category.id)) && category.slug)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.name).localeCompare(String(b.name)))
    .forEach((category) => {
      const path = slugPath('/library/category', category.slug);
      if (seen.has(path)) return;
      seen.add(path);
      entries.push(urlEntry(path, { priority: '0.7', changefreq: 'weekly', lastmod: category.updated_at }));
    });

  resources
    .filter((resource) => resource?.slug && !isArchived(resource.is_archived) && isPublished(resource.is_published) && (!resource.category_id || publicIds.has(Number(resource.category_id))))
    .forEach((resource) => {
      const path = slugPath('/resource', resource.slug);
      if (seen.has(path)) return;
      seen.add(path);
      entries.push(urlEntry(path, { priority: '0.8', changefreq: 'monthly', lastmod: resource.updated_at || resource.created_at }));
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries.join('\n'),
    '</urlset>',
    '',
  ].join('\n');
}

export async function collectSitemapResources(fetchPage, {
  pageSize = SITEMAP_PAGE_SIZE,
  maxUrls = SITEMAP_MAX_URLS,
} = {}) {
  const resources = [];
  let offset = 0;
  let total = null;

  while (resources.length < maxUrls) {
    const result = await fetchPage({
      params: {},
      orderBy: 'featured',
      limit: pageSize,
      offset,
    });
    const page = Array.isArray(result?.resources) ? result.resources : [];
    if (!page.length) break;

    resources.push(...page);
    const reportedTotal = Number(result?.total);
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) total = reportedTotal;
    offset += page.length;

    if (total !== null && offset >= total) break;
    if (page.length < pageSize && total === null) break;
  }

  return resources.slice(0, maxUrls);
}

export async function listPublicResourcesForSitemap() {
  return collectSitemapResources((params) => db.resourceListFiltered(params));
}

router.get('/sitemap.xml', async (req, res) => {
  let categories = [];
  let resources = [];
  const [categoryResult, resourceResult] = await Promise.allSettled([
    db.categoryListAll(),
    listPublicResourcesForSitemap(),
  ]);

  if (categoryResult.status === 'fulfilled') {
    categories = Array.isArray(categoryResult.value) ? categoryResult.value : [];
  } else {
    console.warn('SEO sitemap category fallback:', categoryResult.reason?.message || categoryResult.reason);
  }
  if (resourceResult.status === 'fulfilled') {
    resources = resourceResult.value;
  } else {
    console.warn('SEO sitemap resource fallback:', resourceResult.reason?.message || resourceResult.reason);
  }

  res
    .status(200)
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
    .send(buildSitemapXml({ categories, resources }));
});

export default router;
