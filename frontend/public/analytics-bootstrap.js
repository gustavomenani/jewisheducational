(function () {
  var id = String(document.currentScript.dataset.measurementId || '').trim().toUpperCase();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (!window.__jerGaStarted) {
    window.gtag('js', new Date());
    window.__jerGaStarted = true;
  }
  if (!/^G-[A-Z0-9]+$/.test(id)) return;
  var script = document.createElement('script');
  script.id = 'ga-script';
  script.dataset.measurementId = id;
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  script.addEventListener('error', function () { script.dataset.failed = 'true'; });
  document.head.appendChild(script);
}());
