import api from '@/api';
import { captureAttribution, getAttribution } from '@/utils/attribution';
import { referrerHost } from '@/utils/attributionShared';
import { useSettingsStore } from '@/stores';

const GA_CONSOLE_URL = import.meta.env.VITE_GA_CONSOLE_URL
  || 'https://console.firebase.google.com/project/jewish-educational-resources/analytics';

export const INTERACTION_EVENTS = Object.freeze([
  'resource_preview_open',
  'resource_download_click',
  'resource_page_click',
  'download_page_open',
  'download_started',
  'download_completed',
]);

const SERVER_ONLY_INTERACTION_EVENTS = new Set([
  'download_started',
  'download_completed',
]);

const AUTHENTICATED_EVENTS = new Set([
  'resource_preview_open',
  'resource_page_click',
  'resource_download_click',
  'download_page_open',
  'download_started',
  'download_completed',
]);
let firstGaPageViewMeasurementId = '';

export function getMeasurementId() {
  try {
    const settings = useSettingsStore();
    const databaseId = String(settings.settings?.google_analytics_id || '').trim();
    if (databaseId) return databaseId;
  } catch {
    // The settings store is not available during the first synchronous boot.
  }
  return String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
}

export function getGaConsoleUrl() {
  return GA_CONSOLE_URL;
}

export function isAnalyticsEnabled() {
  return Boolean(getMeasurementId());
}

function getSessionId() {
  const key = 'jer_session_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export function initAnalytics() {
  captureAttribution();
  const measurementId = getMeasurementId();
  if (!measurementId || typeof window === 'undefined') return;
  const existing = document.getElementById('ga-script');
  if (existing?.dataset.measurementId === measurementId && window.gtag) return;
  existing?.remove();

  const script = document.createElement('script');
  script.id = 'ga-script';
  script.dataset.measurementId = measurementId;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args) {
    window.dataLayer.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });
  window.__jerGaMeasurementId = measurementId;
}

export function trackPageView(path, title = document.title, options = {}) {
  const attr = getAttribution();

  const measurementId = getMeasurementId();
  const isBootstrapDuplicate = options.bootstrap && firstGaPageViewMeasurementId === measurementId;
  if (isAnalyticsEnabled() && window.gtag && !isBootstrapDuplicate) {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title,
      traffic_source: attr.source,
      utm_source: attr.utm_source || undefined,
      utm_medium: attr.utm_medium || undefined,
      utm_campaign: attr.utm_campaign || undefined,
    });
    firstGaPageViewMeasurementId = measurementId;
  }

  if (options.persist === false) return;
  api.post('/analytics/pageview', {
    path,
    pageTitle: title,
    referrer: document.referrer || attr.referrer || null,
    sessionId: getSessionId(),
    utm_source: attr.utm_source,
    utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign,
    traffic_source: attr.source,
    referrer_host: referrerHost(document.referrer || attr.referrer),
  }).catch(() => {});
}

export function trackDownload({
  resourceId,
  resourceTitle,
  fileId,
  fileLabel,
  fileName,
}) {
  const label = fileLabel || fileName || 'file';

  if (isAnalyticsEnabled() && window.gtag) {
    window.gtag('event', 'file_download', {
      resource_id: resourceId,
      resource_title: resourceTitle,
      file_id: fileId,
      file_label: label,
    });
  }
}

export function trackInteraction(eventName, payload = {}, options = {}) {
  if (!INTERACTION_EVENTS.includes(eventName)) return;

  if (AUTHENTICATED_EVENTS.has(eventName)
    && options.allowAnonymous !== true
    && !localStorage.getItem('token')) {
    return;
  }

  const safePayload = Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  const eventPayload = { ...safePayload };

  if (typeof window !== 'undefined' && isAnalyticsEnabled() && window.gtag) {
    window.gtag('event', eventName, eventPayload);
  }

  const path = typeof window !== 'undefined'
    ? `${window.location.pathname}${window.location.search}`
    : '';
  const eventId = options.eventId
    || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (options.persist !== false && !SERVER_ONLY_INTERACTION_EVENTS.has(eventName)) {
    api.post('/analytics/event', {
      eventName,
      eventId,
      ...safePayload,
      path,
      sessionId: typeof window !== 'undefined' ? getSessionId() : undefined,
    }).catch(() => {});
  }
}
