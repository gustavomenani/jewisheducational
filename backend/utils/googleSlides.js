const GOOGLE_SLIDES_HOST = 'docs.google.com';
const PRESENTATION_ID = /^[A-Za-z0-9_-]+$/;
const IMPORTED_FILE_NAME = /^Google Slides - ([A-Za-z0-9_-]+)\.pptx$/i;
const MAX_FIRST_SLIDE_BYTES = 12 * 1024 * 1024;

function googleSlidesParts(value, { allowBareId = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (allowBareId && PRESENTATION_ID.test(raw)) {
    return { id: raw, published: false };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== GOOGLE_SLIDES_HOST) return null;
  const match = url.pathname.match(/^\/presentation\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)(?:\/|$)/i);
  return match && PRESENTATION_ID.test(match[2])
    ? { id: match[2], published: Boolean(match[1]) }
    : null;
}

function presentationSourceParts(value) {
  return googleSlidesParts(value, { allowBareId: true });
}

function normalizedPageId(value) {
  const raw = String(value || '').trim();
  const id = raw.startsWith('id.') ? raw.slice(3) : raw;
  return PRESENTATION_ID.test(id) ? id : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstSlidePageIdFromEmbed(html) {
  const text = String(html || '');
  const docData = text.match(/docData\s*:\s*\[\s*\[[^\]]*\]\s*,\s*\[\s*\[\s*["']([A-Za-z0-9_-]+)["']\s*,\s*\d+/);
  if (docData) return normalizedPageId(docData[1]);

  const loadedPage = text.match(/SK_viewerApp\.setPageData\(\s*["']([A-Za-z0-9_-]+)["']/);
  return normalizedPageId(loadedPage?.[1]);
}

function decodeGoogleJavaScriptString(value) {
  return String(value || '').replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\\'"/bfnrtv])/g, (_, escaped) => {
    if (escaped.startsWith('x')) return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
    if (escaped.startsWith('u')) return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
    return {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    }[escaped] ?? escaped;
  });
}

function firstSlideSvgFromEmbed(html, pageId) {
  const safePageId = normalizedPageId(pageId);
  if (!safePageId) return null;

  const page = escapeRegExp(safePageId);
  const matcher = new RegExp(
    `SK_svgData\\s*=\\s*'((?:\\\\.|[^'\\\\])*)';\\s*SK_viewerApp\\.setPageData\\(\\s*'${page}'`,
    's',
  );
  const encoded = String(html || '').match(matcher)?.[1];
  if (!encoded) return null;

  const svg = decodeGoogleJavaScriptString(encoded);
  return /^\s*<svg\b/i.test(svg) ? Buffer.from(svg, 'utf8') : null;
}

async function downloadEmbedHtml(value, { fetchImpl, maxBytes }) {
  const url = googleSlidesEmbedUrl(value);
  if (!url) throw new Error('Invalid Google Slides presentation link.');

  let response;
  try {
    response = await fetchImpl(url, { redirect: 'follow' });
  } catch {
    throw new Error('Could not retrieve the Google Slides presentation.');
  }

  const contentLength = Number(response.headers?.get?.('content-length'));
  if (!response.ok || (Number.isFinite(contentLength) && contentLength > maxBytes)) {
    throw new Error('Google Slides did not return a valid presentation preview.');
  }

  const html = await response.text();
  if (Buffer.byteLength(html, 'utf8') > maxBytes) {
    throw new Error('Google Slides presentation preview is too large.');
  }
  return html;
}

async function downloadGoogleSlidesPng(url, { fetchImpl, maxBytes }) {
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'follow' });
  } catch {
    throw new Error('Could not retrieve the first Google Slides page.');
  }

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (!response.ok || !contentType.startsWith('image/') || (Number.isFinite(contentLength) && contentLength > maxBytes)) {
    throw new Error('Google Slides did not return a valid first-slide image.');
  }

  const image = Buffer.from(await response.arrayBuffer());
  const isPng = image.length >= 4
    && image[0] === 0x89
    && image[1] === 0x50
    && image[2] === 0x4e
    && image[3] === 0x47;
  if (!isPng || image.length > maxBytes) {
    throw new Error('Google Slides did not return a valid first-slide image.');
  }

  return image;
}

export function googleSlidesPresentationId(value) {
  return googleSlidesParts(value)?.id || '';
}

export function googleSlidesSourceUrl(value) {
  const parts = googleSlidesParts(value);
  if (!parts) return '';
  const prefix = parts.published ? 'e/' : '';
  const action = parts.published ? 'pub' : 'edit';
  return `https://${GOOGLE_SLIDES_HOST}/presentation/d/${prefix}${parts.id}/${action}`;
}

export function googleSlidesPresentationIdFromImportedFile(file) {
  const name = String(file?.original_name || file?.file_name || '').trim();
  return name.match(IMPORTED_FILE_NAME)?.[1] || '';
}

export function googleSlidesSourceUrlFromImportedFile(file) {
  const id = googleSlidesPresentationIdFromImportedFile(file);
  return id ? `https://${GOOGLE_SLIDES_HOST}/presentation/d/${id}/edit` : '';
}

export function googleSlidesEmbedUrl(value) {
  const parts = presentationSourceParts(value);
  if (!parts) return '';
  const prefix = parts.published ? 'e/' : '';
  return `https://${GOOGLE_SLIDES_HOST}/presentation/d/${prefix}${parts.id}/embed`;
}

// Published Slides URLs use a publication id (the /d/e/ variant), not the
// editable Drive id accepted by Google's export endpoint. Returning an empty
// URL here deliberately avoids silently requesting a different presentation.
export function googleSlidesFirstSlideUrl(value, pageId) {
  const parts = presentationSourceParts(value);
  const firstPageId = normalizedPageId(pageId);
  return parts && !parts.published && firstPageId
    ? `https://${GOOGLE_SLIDES_HOST}/presentation/d/${parts.id}/export/png?pageid=${encodeURIComponent(firstPageId)}`
    : '';
}

export function googleSlidesPptxExportUrl(value) {
  const parts = presentationSourceParts(value);
  return parts && !parts.published
    ? `https://${GOOGLE_SLIDES_HOST}/presentation/d/${parts.id}/export/pptx`
    : '';
}

export async function downloadGoogleSlidesFirstSlide(value, {
  fetchImpl = fetch,
  maxBytes = MAX_FIRST_SLIDE_BYTES,
} = {}) {
  const parts = presentationSourceParts(value);
  if (!parts) throw new Error('Invalid Google Slides presentation link.');

  const html = await downloadEmbedHtml(value, { fetchImpl, maxBytes });
  const firstPageId = firstSlidePageIdFromEmbed(html);
  if (!firstPageId) throw new Error('Could not determine the first Google Slides page.');

  const fallbackSvg = firstSlideSvgFromEmbed(html, firstPageId);
  const pngUrl = googleSlidesFirstSlideUrl(value, firstPageId);
  if (!pngUrl) {
    if (fallbackSvg) return fallbackSvg;
    throw new Error('Google Slides did not provide a downloadable first-slide image.');
  }

  try {
    return await downloadGoogleSlidesPng(pngUrl, { fetchImpl, maxBytes });
  } catch (error) {
    if (fallbackSvg) return fallbackSvg;
    throw error;
  }
}
