const CANVA_HOSTS = new Set(['canva.com', 'www.canva.com']);
const CANVA_SHORT_HOST = 'canva.link';
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

export async function resolveCanvaSourceUrl(value, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const direct = canvaSourceUrl(value);
  if (direct) return direct;

  let current;
  try {
    current = new URL(String(value || '').trim());
  } catch {
    return '';
  }
  if (current.protocol !== 'https:' || current.port || current.hostname.toLowerCase() !== CANVA_SHORT_HOST) return '';
  if (!/^\/[A-Za-z0-9_-]+\/?$/.test(current.pathname) || typeof fetchImpl !== 'function') return '';

  try {
    for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
      const response = await fetchImpl(current.href, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = response.headers?.get?.('location');
      if (!location) return '';
      const next = new URL(location, current);
      const host = next.hostname.toLowerCase();
      if (CANVA_HOSTS.has(host)) return canvaSourceUrl(next.href);
      if (host !== CANVA_SHORT_HOST || next.protocol !== 'https:' || next.port) return '';
      current = next;
    }
  } catch {
    return '';
  }
  return '';
}
