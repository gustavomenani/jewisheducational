const FONT_FAMILIES = new Set([
  'Nunito, system-ui, sans-serif',
  'Arial, sans-serif',
  'Georgia, serif',
  'Trebuchet MS, sans-serif',
]);
const FONT_WEIGHTS = new Set(['400', '500', '600', '700', '800']);
const TEXT_ALIGNS = new Set(['left', 'center', 'right', 'justify']);

function pick(source, ...keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') return source[key];
  }
  return undefined;
}

function numberInRange(value, min, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : undefined;
}

export function normalizeTextStyle(raw = {}, legacy = {}) {
  const source = { ...(legacy || {}), ...(raw || {}) };
  const style = {};
  const family = String(pick(source, 'fontFamily', 'font_family') || '');
  const size = numberInRange(pick(source, 'fontSize', 'font_size', 'size'), 10, 72);
  const weight = String(pick(source, 'fontWeight', 'font_weight') || '');
  const color = String(pick(source, 'color') || '');
  const align = String(pick(source, 'textAlign', 'text_align', 'align') || '');
  const opacity = numberInRange(pick(source, 'opacity'), 0.2, 1);
  const width = numberInRange(pick(source, 'width', 'maxWidth'), 25, 100);
  const lineHeight = numberInRange(pick(source, 'lineHeight', 'line_height'), 1, 2.2);
  const letterSpacing = numberInRange(pick(source, 'letterSpacing', 'letter_spacing'), 0, 6);

  if (FONT_FAMILIES.has(family)) style.fontFamily = family;
  if (size !== undefined) style.fontSize = size;
  if (FONT_WEIGHTS.has(weight)) style.fontWeight = weight;
  if (/^#[\da-f]{3,8}$/i.test(color)) style.color = color;
  if (TEXT_ALIGNS.has(align)) style.textAlign = align;
  if (opacity !== undefined) style.opacity = opacity;
  if (width !== undefined) style.width = width;
  if (lineHeight !== undefined) style.lineHeight = lineHeight;
  if (letterSpacing !== undefined) style.letterSpacing = letterSpacing;
  return style;
}

export function textStyleToCss(style = {}) {
  const normalized = normalizeTextStyle(style);
  return {
    ...(normalized.fontFamily ? { fontFamily: normalized.fontFamily } : {}),
    ...(normalized.fontSize ? { fontSize: `${normalized.fontSize}px` } : {}),
    ...(normalized.fontWeight ? { fontWeight: normalized.fontWeight } : {}),
    ...(normalized.color ? { color: normalized.color } : {}),
    ...(normalized.textAlign ? { textAlign: normalized.textAlign } : {}),
    ...(normalized.opacity !== undefined ? { opacity: normalized.opacity } : {}),
    ...(normalized.width ? { width: `${normalized.width}%`, maxWidth: '100%' } : {}),
    ...(normalized.lineHeight ? { lineHeight: normalized.lineHeight } : {}),
    ...(normalized.letterSpacing !== undefined ? { letterSpacing: `${normalized.letterSpacing}px` } : {}),
  };
}

