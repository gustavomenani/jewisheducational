// Versioned document model for the simple visual editor.  It intentionally
// describes only presentational content; searches, forms, payments and file
// actions remain implemented by their existing Vue components.
import {
  clone,
  emptyLayout,
  makeSection,
  normalizeLayout,
  normalizeBlockPlacement,
  parseLayout,
  publishedKey,
  uid,
} from './layout.js';
import { normalizeTextStyle } from './textStyle.js';

export const SITE_DOCUMENT_VERSION = 2;
export const SITE_DOCUMENT_KEY = 'site_document_v2_published';
export const SITE_DOCUMENT_DRAFT_KEY = 'builder_site_document_v2_draft';

export const SITE_DOCUMENT_PAGE_ZONES = Object.freeze({
  home: ['after-hero', 'after-cards', 'after-featured', 'before-footer'],
  library: ['before-library', 'before-catalog', 'after-catalog'],
  resource: ['before-resource', 'after-preview', 'after-resource'],
  download: ['before-download', 'after-download'],
  auth: ['before-auth', 'after-auth'],
  global: ['after-header', 'before-footer'],
});

export const SITE_DOCUMENT_PAGE_IDS = Object.freeze(Object.keys(SITE_DOCUMENT_PAGE_ZONES));
export const SITE_DOCUMENT_BASIC_BLOCK_TYPES = Object.freeze(['heading', 'paragraph', 'image', 'button']);
// Existing Home layouts can still contain the advanced block types. They are
// retained by the legacy renderer; the v2 document accepts them only so a
// future migration never turns a previously valid layout into an unknown one.
export const SITE_DOCUMENT_BLOCK_TYPES = Object.freeze([
  ...SITE_DOCUMENT_BASIC_BLOCK_TYPES,
  'spacer', 'divider', 'cta', 'features', 'alert', 'video',
]);

const BLOCK_DEFAULTS = Object.freeze({
  heading: { text: 'New title', level: 2, align: 'left', color: '', textStyle: {} },
  paragraph: { text: 'Write your text here.', align: 'left', color: '', textStyle: {} },
  image: { src: '', alt: '', caption: '', link: '', align: 'center', size: 'large', radius: 12, maxWidth: 100 },
  button: { text: 'Click here', link: '/', align: 'left', variant: 'primary' },
  spacer: { height: 32 },
  divider: { color: '#dce8f0' },
  cta: { title: 'Ready to get started?', subtitle: '', buttonText: 'Get started', buttonLink: '/', buttonVariant: 'primary', bgStyle: 'gradient', bgColor: '#3bafb8', textColor: '#ffffff', align: 'center' },
  features: { columns: 3, align: 'center', iconColor: '#3bafb8', item1Icon: 'bi-star-fill', item1Title: 'Resource 1', item1Text: '', item2Icon: 'bi-lightning-charge-fill', item2Title: 'Resource 2', item2Text: '', item3Icon: 'bi-shield-check', item3Title: 'Resource 3', item3Text: '' },
  alert: { variant: 'info', title: 'Important note', text: '', icon: '' },
  video: { url: '', aspectRatio: '16:9', maxWidth: 100, align: 'center', title: '' },
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value, max = 6000) {
  return String(value ?? '').slice(0, max);
}

function safeAlign(value, fallback = 'left') {
  return ['left', 'center', 'right', 'justify'].includes(String(value)) ? String(value) : fallback;
}

function safeColor(value) {
  const color = String(value || '');
  return /^#[\da-f]{3,8}$/i.test(color) ? color : '';
}

function safeSectionBackground(value) {
  const background = String(value || '').trim();
  if (!background) return '';
  if (/^#[\da-f]{3,8}$/i.test(background)) return background;
  if (/^linear-gradient\([\w\s#(),.%+-]+\)$/i.test(background)) return background.slice(0, 1200);
  return '';
}

function safeNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function safeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^(mailto:|tel:)/i.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeBlockProps(type, raw = {}) {
  const source = isObject(raw) ? raw : {};
  const defaults = BLOCK_DEFAULTS[type] || {};
  const props = { ...defaults };

  if (type === 'heading' || type === 'paragraph') {
    props.text = boundedString(source.text, 12000);
    props.align = safeAlign(source.align, defaults.align);
    props.color = safeColor(source.color);
    props.textStyle = normalizeTextStyle(source.textStyle, source);
    if (type === 'heading') props.level = Math.round(safeNumber(source.level, 1, 6, defaults.level));
  } else if (type === 'image') {
    props.src = safeUrl(source.src);
    props.alt = boundedString(source.alt, 500);
    props.caption = boundedString(source.caption, 1200);
    props.link = safeUrl(source.link);
    props.align = safeAlign(source.align, defaults.align);
    props.size = ['small', 'medium', 'large', 'full'].includes(String(source.size)) ? String(source.size) : defaults.size;
    props.radius = Math.round(safeNumber(source.radius, 0, 64, defaults.radius));
    props.maxWidth = Math.round(safeNumber(source.maxWidth, 25, 100, defaults.maxWidth));
  } else if (type === 'button') {
    props.text = boundedString(source.text, 500);
    props.link = safeUrl(source.link) || '/';
    props.align = safeAlign(source.align, defaults.align);
    props.variant = ['primary', 'secondary', 'outline'].includes(String(source.variant)) ? String(source.variant) : defaults.variant;
  } else {
    // Advanced legacy props are retained as plain text/number data. Rendering
    // remains owned by the existing legacy block components.
    for (const [key, value] of Object.entries(source)) {
      if (key === 'html' || key === 'innerHTML' || key.startsWith('__')) continue;
      if (typeof value === 'string') props[key] = boundedString(value, 6000);
      else if (typeof value === 'number' || typeof value === 'boolean') props[key] = value;
    }
  }
  return props;
}

function normalizeDocumentBlock(raw = {}) {
  const source = isObject(raw) ? raw : {};
  const type = SITE_DOCUMENT_BLOCK_TYPES.includes(String(source.type)) ? String(source.type) : '';
  if (!type) return null;
  return {
    id: typeof source.id === 'string' && source.id ? source.id.slice(0, 120) : uid('docb'),
    type,
    props: normalizeBlockProps(type, source.props),
    layout: normalizeBlockPlacement(source.layout),
  };
}

function normalizeDocumentLayout(raw) {
  const layout = normalizeLayout(raw || emptyLayout());
  const seen = new Set();
  return {
    sections: layout.sections.slice(0, 60).map((section) => ({
      ...section,
      props: {
        hidden: Boolean(section.props?.hidden),
        bg: safeSectionBackground(section.props?.bg),
        paddingY: Math.round(safeNumber(section.props?.paddingY, 0, 160, 48)),
        maxWidth: Math.round(safeNumber(section.props?.maxWidth, 480, 1440, 1140)),
      },
      columns: section.columns.slice(0, 4).map((column) => ({
        ...column,
        blocks: column.blocks
          .map(normalizeDocumentBlock)
          .filter(Boolean)
          .filter((block) => {
            if (seen.has(block.id)) return false;
            seen.add(block.id);
            return true;
          })
          .slice(0, 48),
      })),
    })),
  };
}

function emptyPageDocument(pageId) {
  return {
    slots: Object.fromEntries(SITE_DOCUMENT_PAGE_ZONES[pageId].map((zone) => [zone, emptyLayout()])),
  };
}

export function emptySiteDocument() {
  return {
    version: SITE_DOCUMENT_VERSION,
    pages: Object.fromEntries(SITE_DOCUMENT_PAGE_IDS.map((pageId) => [pageId, emptyPageDocument(pageId)])),
    legacy: {},
  };
}

export function normalizeSiteDocument(raw) {
  const source = isObject(raw) ? raw : {};
  const document = emptySiteDocument();
  for (const pageId of SITE_DOCUMENT_PAGE_IDS) {
    const rawPage = isObject(source.pages?.[pageId]) ? source.pages[pageId] : {};
    for (const zone of SITE_DOCUMENT_PAGE_ZONES[pageId]) {
      document.pages[pageId].slots[zone] = normalizeDocumentLayout(rawPage.slots?.[zone]);
    }
  }
  if (isObject(source.legacy?.home) && source.legacy.home.sourceKey === publishedKey('home')) {
    document.legacy.home = { sourceKey: publishedKey('home'), preserved: true };
  }
  return document;
}

export function parseSiteDocument(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isObject(parsed) || Number(parsed.version) !== SITE_DOCUMENT_VERSION) return null;
    return normalizeSiteDocument(parsed);
  } catch {
    return null;
  }
}

// The original Home canvas is deliberately referenced rather than copied.
// That avoids duplicating its content while the public renderer still needs
// the legacy block components for advanced layouts.
export function migrateLegacySiteDocument(settings = {}) {
  const document = emptySiteDocument();
  const legacyHome = parseLayout(settings?.[publishedKey('home')]);
  if (legacyHome?.sections?.length) {
    document.legacy.home = { sourceKey: publishedKey('home'), preserved: true };
  }
  return document;
}

export function siteDocumentSlot(document, pageId, zone) {
  const normalized = normalizeSiteDocument(document);
  if (!SITE_DOCUMENT_PAGE_ZONES[pageId]?.includes(zone)) return emptyLayout();
  return normalized.pages[pageId].slots[zone];
}

export function siteDocumentHasContent(document) {
  return SITE_DOCUMENT_PAGE_IDS.some((pageId) => SITE_DOCUMENT_PAGE_ZONES[pageId]
    .some((zone) => siteDocumentSlot(document, pageId, zone).sections.length > 0));
}

export function createSiteDocumentBlock(type) {
  if (!SITE_DOCUMENT_BASIC_BLOCK_TYPES.includes(type)) return null;
  return {
    id: uid('docb'),
    type,
    props: normalizeBlockProps(type, BLOCK_DEFAULTS[type]),
    layout: normalizeBlockPlacement(),
  };
}

export function createSiteDocumentSection() {
  return makeSection();
}

export function cloneSiteDocument(document) {
  return clone(normalizeSiteDocument(document));
}

export function pageIdForRouteSlug(slug) {
  const value = String(slug || 'home');
  if (['library', 'category'].includes(value)) return 'library';
  if (value === 'resource') return 'resource';
  if (value === 'download') return 'download';
  if (['login', 'register', 'forgot-password', 'reset-password', 'account', 'profile', 'favorites'].includes(value)) return 'auth';
  return 'home';
}
