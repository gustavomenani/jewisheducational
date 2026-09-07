import { classifyTrafficSource } from './attributionShared.js';

const STORAGE_KEY = 'jer_attribution';

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function currentHost() {
  return typeof window !== 'undefined' ? window.location.hostname : '';
}

/**
 * Captura UTM + referrer na primeira visita (não sobrescreve depois).
 */
export function captureAttribution() {
  const existing = readStored();
  if (existing) return existing;

  const params = new URLSearchParams(window.location.search);
  const data = {
    referrer: document.referrer || null,
    landing_path: `${window.location.pathname}${window.location.search}`,
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    captured_at: new Date().toISOString(),
  };
  data.source = classifyTrafficSource({
    utm_source: data.utm_source,
    utm_medium: data.utm_medium,
    referrer: data.referrer,
    host: currentHost(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

export function getAttribution() {
  return readStored() || captureAttribution();
}

/** Payload para enviar no cadastro/login Google (novos usuários). */
export function getSignupAttribution(method = 'email') {
  const attr = getAttribution();
  return {
    signup_method: method,
    signup_source: attr.source,
    signup_referrer: attr.referrer,
    signup_utm_source: attr.utm_source,
    signup_utm_medium: attr.utm_medium,
    signup_utm_campaign: attr.utm_campaign,
    signup_landing_path: attr.landing_path,
  };
}
