// Validation boundary for the visual SiteDocument. The browser may create
// drafts freely, but only this narrow presentational schema can be published.
export const SITE_DOCUMENT_KEY = 'site_document_v2_published';
export const SITE_DOCUMENT_VERSION = 2;
export const SITE_DOCUMENT_MAX_BYTES = 512 * 1024;

export const SITE_DOCUMENT_PAGE_ZONES = Object.freeze({
  home: ['after-hero', 'after-cards', 'after-featured', 'before-footer'],
  library: ['before-library', 'before-catalog', 'after-catalog'],
  resource: ['before-resource', 'after-preview', 'after-resource'],
  download: ['before-download', 'after-download'],
  auth: ['before-auth', 'after-auth'],
  global: ['after-header', 'before-footer'],
});

const BASIC_BLOCK_TYPES = new Set(['heading', 'paragraph', 'image', 'button']);
const FONT_WEIGHTS = new Set(['400', '500', '600', '700', '800']);
const ALIGNS = new Set(['left', 'center', 'right', 'justify']);

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, name, max = 6000) {
  if (typeof value !== 'string') throw inputError(`${name} must be text.`);
  if (value.length > max) throw inputError(`${name} is too long.`);
  return value;
}

function optionalString(value, name, max = 6000) {
  if (value === undefined || value === null) return '';
  return requireString(value, name, max);
}

function boundedNumber(value, name, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw inputError(`${name} must be between ${min} and ${max}.`);
  }
  return numeric;
}

function safeLink(value, name, { image = false, fallback = '' } = {}) {
  const raw = optionalString(value, name, 2048).trim();
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  if (!image && /^(mailto:|tel:)/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') return parsed.href;
  } catch {
    // Keep the same user-facing error whether parsing failed or a protocol is unsafe.
  }
  throw inputError(`${name} must be an internal path or secure https URL.`);
}

function normalizeTextStyle(raw) {
  if (raw === undefined || raw === null) return {};
  if (!isObject(raw)) throw inputError('Text style must be an object.');
  const style = {};
  if (raw.fontSize !== undefined) style.fontSize = boundedNumber(raw.fontSize, 'Text size', 10, 72, undefined);
  if (raw.fontWeight !== undefined) {
    const weight = String(raw.fontWeight);
    if (!FONT_WEIGHTS.has(weight)) throw inputError('Text weight is invalid.');
    style.fontWeight = weight;
  }
  if (raw.textAlign !== undefined) {
    const align = String(raw.textAlign);
    if (!ALIGNS.has(align)) throw inputError('Text alignment is invalid.');
    style.textAlign = align;
  }
  if (raw.color !== undefined) {
    const color = String(raw.color);
    if (!/^#[\da-f]{3,8}$/i.test(color)) throw inputError('Text color is invalid.');
    style.color = color;
  }
  if (raw.lineHeight !== undefined) style.lineHeight = boundedNumber(raw.lineHeight, 'Line height', 1, 2.2, undefined);
  if (raw.letterSpacing !== undefined) style.letterSpacing = boundedNumber(raw.letterSpacing, 'Letter spacing', 0, 6, undefined);
  return style;
}

function normalizeBlockProps(type, raw) {
  if (!isObject(raw)) throw inputError('Block properties must be an object.');
  if (Object.prototype.hasOwnProperty.call(raw, 'html') || Object.prototype.hasOwnProperty.call(raw, 'innerHTML')) {
    throw inputError('HTML content is not allowed in the visual editor.');
  }
  if (type === 'heading') {
    const level = Math.round(boundedNumber(raw.level, 'Heading level', 1, 6, 2));
    const align = raw.align === undefined ? 'left' : String(raw.align);
    if (!ALIGNS.has(align)) throw inputError('Heading alignment is invalid.');
    const color = optionalString(raw.color, 'Heading color', 16);
    if (color && !/^#[\da-f]{3,8}$/i.test(color)) throw inputError('Heading color is invalid.');
    return { text: requireString(raw.text, 'Heading text', 12000), level, align, color, textStyle: normalizeTextStyle(raw.textStyle) };
  }
  if (type === 'paragraph') {
    const align = raw.align === undefined ? 'left' : String(raw.align);
    if (!ALIGNS.has(align)) throw inputError('Paragraph alignment is invalid.');
    const color = optionalString(raw.color, 'Paragraph color', 16);
    if (color && !/^#[\da-f]{3,8}$/i.test(color)) throw inputError('Paragraph color is invalid.');
    return { text: requireString(raw.text, 'Paragraph text', 12000), align, color, textStyle: normalizeTextStyle(raw.textStyle) };
  }
  if (type === 'image') {
    const align = raw.align === undefined ? 'center' : String(raw.align);
    if (!ALIGNS.has(align)) throw inputError('Image alignment is invalid.');
    const size = raw.size === undefined ? 'large' : String(raw.size);
    if (!['small', 'medium', 'large', 'full'].includes(size)) throw inputError('Image size is invalid.');
    return {
      src: safeLink(raw.src, 'Image source', { image: true }),
      alt: optionalString(raw.alt, 'Image alt text', 500),
      caption: optionalString(raw.caption, 'Image caption', 1200),
      link: safeLink(raw.link, 'Image link'),
      align,
      size,
      radius: Math.round(boundedNumber(raw.radius, 'Image radius', 0, 64, 12)),
      maxWidth: Math.round(boundedNumber(raw.maxWidth, 'Image width', 25, 100, 100)),
    };
  }
  const align = raw.align === undefined ? 'left' : String(raw.align);
  if (!ALIGNS.has(align)) throw inputError('Button alignment is invalid.');
  const variant = raw.variant === undefined ? 'primary' : String(raw.variant);
  if (!['primary', 'secondary', 'outline'].includes(variant)) throw inputError('Button style is invalid.');
  return {
    text: requireString(raw.text, 'Button text', 500),
    link: safeLink(raw.link, 'Button link', { fallback: '/' }),
    align,
    variant,
  };
}

function normalizeBlock(raw) {
  if (!isObject(raw)) throw inputError('A block must be an object.');
  const id = requireString(raw.id, 'Block id', 120);
  if (!/^[a-z0-9_-]+$/i.test(id)) throw inputError('Block id is invalid.');
  const type = String(raw.type || '');
  if (!BASIC_BLOCK_TYPES.has(type)) throw inputError('This block type is not allowed in the simple editor.');
  const layout = isObject(raw.layout) ? raw.layout : {};
  const span = Math.round(boundedNumber(layout.span, 'Block span', 1, 12, 12));
  const start = Math.round(boundedNumber(layout.start, 'Block start', 1, 13 - span, 1));
  return {
    id,
    type,
    props: normalizeBlockProps(type, raw.props),
    layout: {
      span,
      start,
      marginTop: Math.round(boundedNumber(layout.marginTop, 'Block top spacing', 0, 160, 0)),
      marginBottom: Math.round(boundedNumber(layout.marginBottom, 'Block bottom spacing', 0, 160, 0)),
    },
  };
}

function normalizeSection(raw, ids, count) {
  if (!isObject(raw)) throw inputError('A section must be an object.');
  const id = requireString(raw.id, 'Section id', 120);
  if (!/^[a-z0-9_-]+$/i.test(id) || ids.has(id)) throw inputError('Section id is invalid or duplicated.');
  ids.add(id);
  if (!Array.isArray(raw.columns) || raw.columns.length < 1 || raw.columns.length > 4) {
    throw inputError('A section must have one to four columns.');
  }
  const columns = raw.columns.map((column, index) => {
    if (!isObject(column)) throw inputError('A column must be an object.');
    const columnId = requireString(column.id, 'Column id', 120);
    if (!/^[a-z0-9_-]+$/i.test(columnId) || ids.has(columnId)) throw inputError('Column id is invalid or duplicated.');
    ids.add(columnId);
    const span = Math.round(boundedNumber(column.span, 'Column span', 1, 12, index === 0 ? 12 : 1));
    if (!Array.isArray(column.blocks) || column.blocks.length > 48) throw inputError('A column has too many blocks.');
    const blocks = column.blocks.map((block) => {
      count.value += 1;
      if (count.value > 360) throw inputError('The visual document has too many blocks.');
      const normalized = normalizeBlock(block);
      if (ids.has(normalized.id)) throw inputError('Block id is duplicated.');
      ids.add(normalized.id);
      return normalized;
    });
    return { id: columnId, span, blocks };
  });
  if (columns.reduce((total, column) => total + column.span, 0) > 12) throw inputError('Section columns exceed the responsive grid.');
  const props = isObject(raw.props) ? raw.props : {};
  const background = optionalString(props.bg, 'Section background', 1200);
  if (background && !(/^#[\da-f]{3,8}$/i.test(background) || /^linear-gradient\([\w\s#(),.%+-]+\)$/i.test(background))) {
    throw inputError('Section background is invalid.');
  }
  return {
    id,
    props: {
      hidden: Boolean(props.hidden),
      bg: background,
      paddingY: Math.round(boundedNumber(props.paddingY, 'Section spacing', 0, 160, 48)),
      maxWidth: Math.round(boundedNumber(props.maxWidth, 'Section width', 480, 1440, 1140)),
    },
    columns,
  };
}

function normalizeSlot(raw, ids, count) {
  if (raw === undefined || raw === null) return { sections: [] };
  if (!isObject(raw) || !Array.isArray(raw.sections) || raw.sections.length > 60) {
    throw inputError('A visual zone has an invalid number of sections.');
  }
  return { sections: raw.sections.map((section) => normalizeSection(section, ids, count)) };
}

export function validateSiteDocumentPayload(raw) {
  if (typeof raw !== 'string') throw inputError('The visual document must be JSON text.');
  if (Buffer.byteLength(raw, 'utf8') > SITE_DOCUMENT_MAX_BYTES) throw inputError('The visual document is too large.');
  let source;
  try {
    source = JSON.parse(raw);
  } catch {
    throw inputError('The visual document is invalid JSON.');
  }
  if (!isObject(source) || Number(source.version) !== SITE_DOCUMENT_VERSION || !isObject(source.pages)) {
    throw inputError('The visual document version is invalid.');
  }
  const allowedPages = new Set(Object.keys(SITE_DOCUMENT_PAGE_ZONES));
  if (Object.keys(source.pages).some((pageId) => !allowedPages.has(pageId))) throw inputError('The visual document has an unknown page.');

  const ids = new Set();
  const count = { value: 0 };
  const pages = {};
  for (const [pageId, zones] of Object.entries(SITE_DOCUMENT_PAGE_ZONES)) {
    const page = source.pages[pageId] || {};
    if (!isObject(page) || (page.slots !== undefined && !isObject(page.slots))) throw inputError('A visual page is invalid.');
    if (page.slots && Object.keys(page.slots).some((zone) => !zones.includes(zone))) throw inputError('The visual document has an unsafe insertion zone.');
    pages[pageId] = { slots: Object.fromEntries(zones.map((zone) => [zone, normalizeSlot(page.slots?.[zone], ids, count)])) };
  }

  const legacy = {};
  if (source.legacy !== undefined) {
    if (!isObject(source.legacy)) throw inputError('Legacy migration data is invalid.');
    if (source.legacy.home !== undefined) {
      const home = source.legacy.home;
      if (!isObject(home) || home.sourceKey !== 'page_home_layout_published' || home.preserved !== true) {
        throw inputError('Legacy Home migration data is invalid.');
      }
      legacy.home = { sourceKey: 'page_home_layout_published', preserved: true };
    }
  }
  return JSON.stringify({ version: SITE_DOCUMENT_VERSION, pages, legacy });
}
