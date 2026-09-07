const CANVA_HOSTS = new Set(['canva.com', 'www.canva.com']);
const CANVA_DESIGN_PATH = /^(\/design\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)?)\/(view|edit)\/?$/;

export function canvaSourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }

  if (url.protocol !== 'https:' || url.port || !CANVA_HOSTS.has(url.hostname.toLowerCase())) return '';
  const pathname = url.pathname.replace(/\/+$/, '');
  const match = pathname.match(CANVA_DESIGN_PATH);
  if (!match) return '';
  return `https://www.canva.com${match[1]}/view`;
}

export function canvaEmbedUrl(value) {
  const source = canvaSourceUrl(value);
  return source ? `${source}?embed` : '';
}

export function canvaPresentationFile(value) {
  if (!canvaSourceUrl(value)) return null;
  return {
    id: 'canva',
    label: 'Canva presentation',
    original_name: 'Canva presentation',
    file_type: 'canva',
    mime_type: 'application/x-canva-presentation',
    is_primary: 1,
    external_view_only: true,
  };
}
