/**
 * Classificação compartilhada (espelhada no backend).
 * @param {{ utm_source?: string|null, utm_medium?: string|null, referrer?: string|null, host?: string }} input
 */
export function classifyTrafficSource(input = {}) {
  const utm = String(input.utm_source || '').toLowerCase();
  const medium = String(input.utm_medium || '').toLowerCase();
  const ref = String(input.referrer || '').toLowerCase();
  const host = String(input.host || '').toLowerCase();

  if (utm.includes('whatsapp') || utm === 'wa' || medium.includes('whatsapp')) return 'WhatsApp';
  if (utm.includes('pinterest') || ref.includes('pinterest')) return 'Pinterest';
  if (utm.includes('facebook') || utm === 'fb' || ref.includes('facebook') || ref.includes('fb.com')) return 'Facebook';
  if (utm.includes('instagram') || ref.includes('instagram')) return 'Instagram';
  if (utm.includes('youtube') || ref.includes('youtube')) return 'YouTube';
  if (medium === 'email' || utm.includes('email') || utm.includes('newsletter') || utm.includes('mail')) return 'Email';
  if (ref.includes('google.') || utm.includes('google')) {
    return medium === 'cpc' || medium === 'paid' || medium === 'ppc' ? 'Google (ad)' : 'Google';
  }
  if (!ref || (host && ref.includes(host))) return 'Direct';
  return 'Other website';
}

export function referrerHost(referrer) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
