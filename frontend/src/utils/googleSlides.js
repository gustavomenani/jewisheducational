const GOOGLE_SLIDES_HOST = 'docs.google.com';
const PRESENTATION_ID = '[A-Za-z0-9_-]+';

export function googleSlidesEmbedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }

  if (url.protocol !== 'https:' || url.hostname !== GOOGLE_SLIDES_HOST) return '';

  const match = url.pathname.match(
    new RegExp(`^/presentation/(?:u/\\d+/)?d/(e/)?(${PRESENTATION_ID})(?:/[^/]*)?/?$`, 'i')
  );
  if (!match) return '';

  const publishedPrefix = match[1] ? 'e/' : '';
  return `https://${GOOGLE_SLIDES_HOST}/presentation/d/${publishedPrefix}${match[2]}/embed`;
}

export function googleSlidesEmbedUrlForFile(file, resourceUrl = '') {
  const directUrl = googleSlidesEmbedUrl(resourceUrl || file?.google_slides_url || file?.googleSlidesUrl);
  if (directUrl) return directUrl;

  const originalName = String(file?.original_name || file?.file_name || '').trim();
  const match = originalName.match(/^Google Slides - ([A-Za-z0-9_-]+)\.pptx$/i);
  return match ? googleSlidesEmbedUrl(`https://${GOOGLE_SLIDES_HOST}/presentation/d/${match[1]}/edit`) : '';
}
