export const DEFAULT_SITE_NAME = 'Jewish Educational Resources';
export const DEFAULT_SITE_DESCRIPTION =
  'Printable Jewish educational resources, worksheets, activities, and presentations for schools, families, and educators.';
export const DEFAULT_SOCIAL_IMAGE = '/images/cta/banner-mascot-clean.png';
export const DEFAULT_SITE_URL = 'https://jewisheducationalresources.org';

const MANAGED_META_ATTRIBUTE = 'data-jer-seo';
const MANAGED_JSON_LD_ATTRIBUTE = 'data-jer-seo-jsonld';
const FILTER_QUERY_KEYS = ['q', 'category', 'type', 'sort', 'access', 'grade', 'material_type', 'page', 'limit', 'offset'];

function configuredSiteUrl() {
  const configured = String(import.meta.env?.VITE_SITE_URL || '').trim();
  if (configured) return configured;
  if (import.meta.env?.DEV && typeof window !== 'undefined') return window.location.origin;
  return DEFAULT_SITE_URL;
}

export function siteOrigin() {
  try {
    const url = new URL(configuredSiteUrl());
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function normalizedPath(path = '/') {
  const raw = String(path || '/').split(/[?#]/, 1)[0] || '/';
  if (!raw.startsWith('/')) return `/${raw}`;
  return raw.length > 1 ? raw.replace(/\/+$/, '') : '/';
}

export function canonicalUrl(path = '/') {
  try {
    const url = /^https?:\/\//i.test(String(path))
      ? new URL(String(path))
      : new URL(normalizedPath(path), `${siteOrigin()}/`);
    url.search = '';
    url.hash = '';
    url.pathname = normalizedPath(url.pathname);
    return url.toString();
  } catch {
    return `${siteOrigin()}${normalizedPath(path)}`;
  }
}

export function absoluteSeoUrl(path = '/') {
  if (!path) return '';
  if (/^https?:\/\//i.test(String(path))) return String(path);
  return canonicalUrl(path);
}

export function clipDescription(value, maxLength = 160) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim();
  return `${clipped || clean.slice(0, maxLength - 1)}…`;
}

function titleWithBrand(title, siteName = DEFAULT_SITE_NAME) {
  const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim() || siteName;
  const cleanSiteName = String(siteName || DEFAULT_SITE_NAME).trim() || DEFAULT_SITE_NAME;
  if (cleanTitle === cleanSiteName || cleanTitle.endsWith(` | ${cleanSiteName}`)) return cleanTitle;
  return `${cleanTitle} | ${cleanSiteName}`;
}

function metaSelector(kind, key) {
  const value = `${kind}:${key}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `meta[${kind}="${key}"], meta[${MANAGED_META_ATTRIBUTE}="${value}"]`;
}

function upsertMeta(kind, key, content) {
  if (typeof document === 'undefined') return;
  const selector = metaSelector(kind, key);
  let element = document.querySelector(selector);
  if (content === null || content === undefined || content === '') {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(kind, key);
    document.head.appendChild(element);
  }
  element.setAttribute(MANAGED_META_ATTRIBUTE, `${kind}:${key}`);
  element.setAttribute('content', String(content));
}

function upsertCanonical(url) {
  if (typeof document === 'undefined') return;
  const links = [...document.querySelectorAll('link[rel="canonical"]')];
  if (!url) {
    links.forEach((link) => link.remove());
    return;
  }
  const element = links[0] || document.createElement('link');
  links.slice(1).forEach((link) => link.remove());
  element.rel = 'canonical';
  element.href = url;
  element.setAttribute(MANAGED_META_ATTRIBUTE, 'canonical');
  if (!element.parentNode) document.head.appendChild(element);
}

function removeJsonLd() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`script[${MANAGED_JSON_LD_ATTRIBUTE}]`).forEach((script) => script.remove());
}

function compact(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null).map(compact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => [key, compact(item)])
  );
}

function setJsonLd(jsonLd) {
  removeJsonLd();
  if (typeof document === 'undefined' || !jsonLd) return;
  const payload = Array.isArray(jsonLd) ? jsonLd.filter(Boolean).map(compact) : compact(jsonLd);
  if (!payload || (Array.isArray(payload) && !payload.length)) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.setAttribute(MANAGED_JSON_LD_ATTRIBUTE, 'true');
  // Prevent user-editable titles/descriptions from closing the script element.
  script.textContent = JSON.stringify(payload).replace(/</g, '\\u003c');
  document.head.appendChild(script);
}

export function setSeo({
  title = DEFAULT_SITE_NAME,
  siteName = DEFAULT_SITE_NAME,
  description = DEFAULT_SITE_DESCRIPTION,
  canonical = '/',
  image = DEFAULT_SOCIAL_IMAGE,
  type = 'website',
  robots = 'index,follow',
  keywords = '',
  article = null,
  jsonLd = null,
} = {}) {
  if (typeof document === 'undefined') return;
  const indexable = !/^noindex\b/i.test(String(robots));
  const resolvedTitle = titleWithBrand(title, siteName);
  const resolvedDescription = clipDescription(description || DEFAULT_SITE_DESCRIPTION);
  const resolvedImage = absoluteSeoUrl(image || DEFAULT_SOCIAL_IMAGE);
  document.title = resolvedTitle;
  document.documentElement.dataset.jerSeoReady = 'true';

  upsertMeta('name', 'description', resolvedDescription);
  upsertMeta('name', 'robots', robots);
  upsertMeta('name', 'keywords', Array.isArray(keywords) ? keywords.join(', ') : keywords);

  if (indexable) {
    const resolvedCanonical = canonical ? canonicalUrl(canonical) : canonicalUrl('/');
    upsertCanonical(resolvedCanonical);
    upsertMeta('property', 'og:site_name', siteName);
    upsertMeta('property', 'og:title', resolvedTitle);
    upsertMeta('property', 'og:description', resolvedDescription);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', resolvedCanonical);
    upsertMeta('property', 'og:image', resolvedImage);
    upsertMeta('property', 'og:image:alt', resolvedTitle);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', resolvedTitle);
    upsertMeta('name', 'twitter:description', resolvedDescription);
    upsertMeta('name', 'twitter:image', resolvedImage);
    upsertMeta('property', 'article:section', article?.section || null);
    upsertMeta('property', 'article:published_time', article?.publishedTime || null);
    upsertMeta('property', 'article:modified_time', article?.modifiedTime || null);
  } else {
    const canonicalizeToParent = canonical && /^noindex\s*,\s*follow\b/i.test(String(robots));
    upsertCanonical(canonicalizeToParent ? canonicalUrl(canonical) : null);
    ['og:site_name', 'og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:image:alt', 'article:section', 'article:published_time', 'article:modified_time']
      .forEach((key) => upsertMeta('property', key, null));
    ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']
      .forEach((key) => upsertMeta('name', key, null));
  }

  setJsonLd(indexable ? jsonLd : null);
}

export function buildBreadcrumbSchema(items = []) {
  const list = items
    .filter((item) => item?.name)
    .map((item, index) => {
      const linkedItem = item.path || item.url ? canonicalUrl(item.path || item.url) : null;
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: String(item.name),
        ...(linkedItem ? { item: linkedItem } : {}),
      };
    });
  return list.length ? { '@type': 'BreadcrumbList', itemListElement: list } : null;
}

export function buildOrganizationSchema(siteName = DEFAULT_SITE_NAME, description = DEFAULT_SITE_DESCRIPTION) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${canonicalUrl('/')}#organization`,
    name: siteName,
    url: canonicalUrl('/'),
    logo: absoluteSeoUrl('/logo-mark.svg'),
    description: clipDescription(description, 300),
  };
}

export function buildWebSiteSchema(siteName = DEFAULT_SITE_NAME, description = DEFAULT_SITE_DESCRIPTION) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${canonicalUrl('/')}#website`,
    name: siteName,
    url: canonicalUrl('/'),
    description: clipDescription(description, 300),
    inLanguage: 'en',
    publisher: { '@id': `${canonicalUrl('/')}#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${canonicalUrl('/library')}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildCollectionPageSchema({ name, description, path, items = [], breadcrumbs = [] } = {}) {
  const url = canonicalUrl(path || '/library');
  const itemList = items.filter((item) => item?.name && item?.path).map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    url: canonicalUrl(item.path),
  }));
  return {
    '@context': 'https://schema.org',
    '@type': ['CollectionPage', 'WebPage'],
    '@id': `${url}#collection`,
    name,
    description: clipDescription(description, 300),
    url,
    inLanguage: 'en',
    isPartOf: { '@id': `${canonicalUrl('/')}#website` },
    breadcrumb: buildBreadcrumbSchema(breadcrumbs),
    mainEntity: itemList.length ? { '@type': 'ItemList', itemListElement: itemList } : undefined,
  };
}

function toIsoDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function buildLearningResourceSchema({ resource, path, image, breadcrumbs = [] } = {}) {
  if (!resource?.title) return null;
  const url = canonicalUrl(path || `/resource/${resource.slug}`);
  const premium = [true, 1, '1', 'true'].includes(resource.is_premium);
  const keywords = Array.isArray(resource.keywords)
    ? resource.keywords.join(', ')
    : String(resource.keywords || '').trim();
  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    '@id': `${url}#learning-resource`,
    name: resource.title,
    headline: resource.title,
    description: clipDescription(resource.description || resource.content_description, 300),
    url,
    image: image ? [absoluteSeoUrl(image)] : undefined,
    inLanguage: 'en',
    isAccessibleForFree: !premium,
    learningResourceType: resource.material_type || 'Educational resource',
    educationalLevel: resource.grade_level || resource.age_range,
    keywords: keywords || undefined,
    about: resource.category_name ? { '@type': 'Thing', name: resource.category_name } : undefined,
    provider: { '@id': `${canonicalUrl('/')}#organization` },
    datePublished: toIsoDate(resource.created_at),
    dateModified: toIsoDate(resource.updated_at || resource.created_at),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    breadcrumb: buildBreadcrumbSchema(breadcrumbs),
  };
}

function hasFilterQuery(route) {
  return FILTER_QUERY_KEYS.some((key) => {
    const value = route?.query?.[key];
    return value !== undefined && value !== null && String(value).trim() !== '';
  });
}

export function isPrivateRoute(route) {
  const name = String(route?.name || '');
  return Boolean(
    route?.meta?.auth
    || route?.meta?.admin
    || route?.meta?.guest
    || ['download', 'presentation', 'present', 'presentation-play', 'login', 'register', 'forgot-password', 'reset-password', 'account', 'profile', 'favorites'].includes(name)
    || name.startsWith('admin-')
  );
}

export function routeSeoPolicy(route) {
  const name = String(route?.name || '');
  if (name === 'home') {
    return {
      title: DEFAULT_SITE_NAME,
      canonical: '/',
      type: 'website',
      robots: 'index,follow',
      jsonLd: [buildWebSiteSchema(), buildOrganizationSchema()],
    };
  }
  if (name === 'library' || name === 'category') {
    const path = name === 'category' && route.params?.slug
      ? `/library/category/${encodeURIComponent(String(route.params.slug))}`
      : '/library';
    const filtered = hasFilterQuery(route);
    return {
      title: 'Resource Library',
      description: 'Explore printable Jewish educational resources by subject, file type, grade, and age group.',
      canonical: path,
      robots: filtered ? 'noindex,follow' : 'index,follow',
      type: 'website',
      jsonLd: buildCollectionPageSchema({ name: 'Resource Library', path }),
    };
  }
  if (name === 'resource' && !route?.query?.assistir) {
    return {
      title: 'Educational Resource',
      description: 'Jewish educational resource for teachers, schools, families, and communities.',
      canonical: `/resource/${encodeURIComponent(String(route.params?.slug || ''))}`,
      type: 'article',
      robots: 'index,follow',
    };
  }
  return {
    title: name === 'download' ? 'Download Resource' : name === 'presentation-play' ? 'Presentation Viewer' : DEFAULT_SITE_NAME,
    description: DEFAULT_SITE_DESCRIPTION,
    canonical: null,
    robots: 'noindex,nofollow,noarchive',
  };
}

export function applyRouteSeo(route) {
  setSeo(routeSeoPolicy(route));
}

export function setResourceMeta({ title, description, image, url, keywords = '', resource, breadcrumbs = [] }) {
  setSeo({
    title: title || resource?.title || DEFAULT_SITE_NAME,
    description: description || resource?.description || resource?.content_description || DEFAULT_SITE_DESCRIPTION,
    image,
    canonical: url || (resource?.slug ? `/resource/${resource.slug}` : '/'),
    type: 'article',
    keywords,
    article: {
      section: resource?.category_name,
      publishedTime: toIsoDate(resource?.created_at),
      modifiedTime: toIsoDate(resource?.updated_at || resource?.created_at),
    },
    jsonLd: resource
      ? [
        buildOrganizationSchema(),
        buildLearningResourceSchema({ resource, path: url || `/resource/${resource.slug}`, image, breadcrumbs }),
      ]
      : null,
  });
}

export function clearResourceMeta(siteName = DEFAULT_SITE_NAME) {
  setSeo({ title: siteName, canonical: '/', jsonLd: [buildWebSiteSchema(siteName), buildOrganizationSchema(siteName)] });
}
