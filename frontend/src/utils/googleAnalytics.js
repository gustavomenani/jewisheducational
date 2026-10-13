// Queue route changes until settings resolve. The HTML entry loads the tag
// independently; slow or failed settings still use the deployment ID.
export function createGoogleAnalytics({ window, document, getMeasurementId }) {
  let measurementId = '';
  let resolved = false;
  let pending = [];
  let fallbackTimer;
  let firstPageViewId = '';
  let previousLocation = document.referrer || '';

  function ensureTag(id) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args) {
      window.dataLayer.push(args);
    };
    if (!window.__jerGaStarted) {
      window.gtag('js', new Date());
      window.__jerGaStarted = true;
    }
    if (!id) return;

    const existing = document.getElementById('ga-script');
    if (existing?.dataset.measurementId === id && existing.dataset.failed !== 'true') return;
    existing?.remove();
    const script = document.createElement('script');
    script.id = 'ga-script';
    script.dataset.measurementId = id;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.addEventListener('error', () => { script.dataset.failed = 'true'; });
    document.head.appendChild(script);
  }

  function send(item) {
    if (item.bootstrap && firstPageViewId === measurementId) return;
    window.gtag('event', item.name, { ...item.payload, send_to: measurementId });
    if (item.name === 'page_view') firstPageViewId = measurementId;
  }

  function initialize() {
    window.clearTimeout(fallbackTimer);
    const id = getMeasurementId();
    resolved = true;
    ensureTag(id);
    if (!id) {
      measurementId = '';
      pending = [];
      return;
    }
    if (id !== measurementId) {
      window.gtag('config', id, { send_page_view: false });
      measurementId = id;
      window.__jerGaMeasurementId = id;
    }
    const queued = pending;
    pending = [];
    queued.forEach(send);
  }

  function start() {
    ensureTag(getMeasurementId());
    fallbackTimer = window.setTimeout(initialize, 3000);
    // Short visits must also flush while the settings request is pending.
    window.addEventListener('pagehide', initialize);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') initialize();
    });
  }

  function event(name, payload, options = {}) {
    const item = { name, payload, bootstrap: options.bootstrap };
    if (resolved && getMeasurementId() !== measurementId) initialize();
    if (measurementId) {
      ensureTag(measurementId);
      send(item);
    } else if (!resolved) {
      pending.push(item);
    }
  }

  function pageView(path, title, attribution = {}, options = {}) {
    const location = new URL(path, window.location.origin).href;
    event('page_view', {
      page_path: path,
      page_title: title,
      page_location: location,
      page_referrer: previousLocation,
      traffic_source: attribution.source,
      utm_source: attribution.utm_source || undefined,
      utm_medium: attribution.utm_medium || undefined,
      utm_campaign: attribution.utm_campaign || undefined,
    }, options);
    if (!options.bootstrap) previousLocation = location;
  }

  return { start, initialize, pageView, event };
}
