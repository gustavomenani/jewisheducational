export const DEFAULT_CONTACT_EMAIL = 'jewisheducationalresources1@gmail.com';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidContactEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

export function normalizeContactEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return isValidContactEmail(email) ? email : DEFAULT_CONTACT_EMAIL;
}

export function normalizeContactRedirect(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export function isValidContactRedirect(value) {
  const raw = String(value || '').trim();
  return !raw || Boolean(normalizeContactRedirect(raw));
}

export function normalizeRedirectDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10, Math.max(0, Math.floor(parsed)));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
