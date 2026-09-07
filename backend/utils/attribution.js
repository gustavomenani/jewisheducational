// Extrai o hostname limpo de um referrer (URL completa ou já um host).
export function referrerHost(referrer) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    // Já pode ser só um host (ex.: "l.instagram.com").
    const h = String(referrer).trim().toLowerCase().replace(/^www\./, '');
    return h && h.includes('.') ? h : null;
  }
}

// Mapeia um host conhecido para a fonte amigável. Usa igualdade/sufixo de
// domínio (não "includes" solto) para evitar falsos positivos tipo "max.com".
function sourceFromHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!h) return null;
  const is = (...domains) => domains.some((d) => h === d || h.endsWith('.' + d));

  if (is('whatsapp.com', 'wa.me')) return 'WhatsApp';
  if (is('instagram.com')) return 'Instagram';
  if (is('facebook.com', 'fb.com', 'fb.me', 'fb.watch')) return 'Facebook';
  if (is('messenger.com')) return 'Messenger';
  if (is('pinterest.com', 'pin.it')) return 'Pinterest';
  if (is('youtube.com', 'youtu.be')) return 'YouTube';
  if (is('tiktok.com')) return 'TikTok';
  if (is('twitter.com', 'x.com', 't.co')) return 'Twitter/X';
  if (is('linkedin.com', 'lnkd.in')) return 'LinkedIn';
  if (is('t.me', 'telegram.org', 'telegram.me')) return 'Telegram';
  if (is('reddit.com')) return 'Reddit';
  if (is('bing.com')) return 'Bing';
  if (is('duckduckgo.com')) return 'DuckDuckGo';
  if (is('yahoo.com', 'search.yahoo.com')) return 'Yahoo';
  if (h.includes('google.')) return 'Google';
  if (h.endsWith('mail.com') || is('gmail.com', 'outlook.com', 'mail.google.com')) return 'Email';
  return null;
}

/**
 * Classifica de onde veio o visitante/usuário.
 * @param {{ utm_source?: string|null, utm_medium?: string|null, referrer?: string|null, host?: string }} input
 */
export function classifyTrafficSource(input = {}) {
  const utm = String(input.utm_source || '').toLowerCase();
  const medium = String(input.utm_medium || '').toLowerCase();
  const ref = String(input.referrer || '').toLowerCase();
  const host = String(input.host || '').toLowerCase();

  // UTM tem prioridade — é o sinal mais confiável (definido por quem compartilha).
  if (utm.includes('whatsapp') || utm === 'wa' || medium.includes('whatsapp')) return 'WhatsApp';
  if (utm.includes('pinterest')) return 'Pinterest';
  if (utm.includes('facebook') || utm === 'fb') return 'Facebook';
  if (utm.includes('instagram') || utm === 'ig') return 'Instagram';
  if (utm.includes('youtube')) return 'YouTube';
  if (utm.includes('tiktok')) return 'TikTok';
  if (utm.includes('twitter') || utm === 'x') return 'Twitter/X';
  if (utm.includes('linkedin')) return 'LinkedIn';
  if (utm.includes('telegram')) return 'Telegram';
  if (medium === 'email' || utm.includes('email') || utm.includes('newsletter') || utm.includes('mail')) return 'Email';
  if (utm.includes('google')) {
    return medium === 'cpc' || medium === 'paid' || medium === 'ppc' ? 'Google (ad)' : 'Google';
  }

  // Depois o referrer: extrai o host e mapeia com precisão.
  const refHost = referrerHost(ref);
  const bySource = sourceFromHost(refHost);
  if (bySource) {
    if (bySource === 'Google' && (medium === 'cpc' || medium === 'paid' || medium === 'ppc')) return 'Google (ad)';
    return bySource;
  }

  // Sem referrer (ou referrer do próprio site) = acesso direto.
  if (!ref || (host && ref.includes(host))) return 'Direct';
  return 'Other website';
}

// Decide a fonte de uma linha de page_view: usa o traffic_source salvo;
// se vazio mas houver sinal (referrer/utm), reclassifica; senão, Desconhecido.
export function sourceForRow(row = {}) {
  const legacyLabels = {
    'E-mail': 'Email',
    Direto: 'Direct',
    'Outro site': 'Other website',
    Desconhecido: 'Unknown',
  };
  if (row.traffic_source) return legacyLabels[row.traffic_source] || row.traffic_source;
  if (row.referrer || row.referrer_host || row.utm_source || row.utm_medium) {
    return classifyTrafficSource({
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      referrer: row.referrer || row.referrer_host,
      host: '',
    });
  }
  return 'Unknown';
}

export const SOURCE_BADGE_CLASS = {
  WhatsApp: 'badge-source-whatsapp',
  Pinterest: 'badge-source-pinterest',
  Facebook: 'badge-source-facebook',
  Messenger: 'badge-source-facebook',
  Instagram: 'badge-source-instagram',
  YouTube: 'badge-source-youtube',
  TikTok: 'badge-source-other',
  'Twitter/X': 'badge-source-other',
  LinkedIn: 'badge-source-other',
  Telegram: 'badge-source-whatsapp',
  Reddit: 'badge-source-other',
  'E-mail': 'badge-source-email',
  Email: 'badge-source-email',
  Google: 'badge-source-google',
  'Google (ad)': 'badge-source-google-ads',
  Bing: 'badge-source-google',
  DuckDuckGo: 'badge-source-google',
  Yahoo: 'badge-source-google',
  Direto: 'badge-source-direct',
  Direct: 'badge-source-direct',
  'Outro site': 'badge-source-other',
  'Other website': 'badge-source-other',
  Desconhecido: 'badge-source-unknown',
  Unknown: 'badge-source-unknown',
};
