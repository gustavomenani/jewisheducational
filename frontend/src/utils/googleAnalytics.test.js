import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createGoogleAnalytics } from './googleAnalytics.js';

function fixture() {
  let id = 'G-DEFAULT01';
  let script;
  let fallback;
  const listeners = {};
  const document = {
    referrer: 'https://www.google.com/',
    visibilityState: 'visible',
    currentScript: { dataset: { measurementId: id } },
    getElementById: () => script,
    createElement: () => ({
      dataset: {},
      addEventListener(name, listener) { this[name] = listener; },
      remove() { script = undefined; },
    }),
    head: { appendChild(value) { script = value; } },
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  const window = {
    location: { origin: 'https://jewisheducationalresources.org' },
    setTimeout(fn) { fallback = fn; return 1; },
    clearTimeout() {},
    addEventListener(name, listener) { listeners[name] = listener; },
  };
  const analytics = createGoogleAnalytics({ window, document, getMeasurementId: () => id });
  const commands = () => window.dataLayer.map((entry) => Array.from(entry));
  const events = () => commands().filter((entry) => entry[0] === 'event');
  return {
    window, document, analytics, commands, events, listeners,
    setId(value) { id = value; },
    script: () => script,
    fallback: () => fallback(),
  };
}

test('queues early navigation in order and configures the settings ID before sending', () => {
  const f = fixture();
  f.analytics.start();
  f.analytics.pageView('/', 'Home');
  f.analytics.pageView('/library?q=hebrew', 'Library');
  assert.equal(f.events().length, 0);
  f.setId('G-SETTINGS02');
  f.analytics.initialize();
  assert.equal(f.commands()[1][0], 'config');
  assert.equal(f.commands()[1][1], 'G-SETTINGS02');
  assert.deepEqual(f.events().map((event) => event[2].page_path), ['/', '/library?q=hebrew']);
  assert.ok(f.events().every((event) => event[2].send_to === 'G-SETTINGS02'));
  assert.equal(f.events()[0][2].page_referrer, 'https://www.google.com/');
  assert.equal(f.events()[1][2].page_referrer, 'https://jewisheducationalresources.org/');
  assert.equal(f.events()[1][2].page_location, 'https://jewisheducationalresources.org/library?q=hebrew');
});

test('slow or failed settings use the deployment ID and bootstrap does not double count', () => {
  const f = fixture();
  f.analytics.start();
  f.analytics.pageView('/', 'Home');
  f.fallback();
  f.analytics.initialize();
  f.analytics.pageView('/', 'Home', {}, { bootstrap: true });
  assert.equal(f.events().length, 1);
  assert.equal(f.commands().filter((entry) => entry[0] === 'config').length, 1);
  assert.equal(f.events()[0][2].send_to, 'G-DEFAULT01');
});

test('an early settings response records the initial route exactly once', () => {
  const f = fixture();
  f.analytics.start();
  f.analytics.initialize();
  f.analytics.pageView('/', 'Home');
  f.analytics.pageView('/', 'Home', {}, { bootstrap: true });
  f.analytics.pageView('/library', 'Library');
  assert.deepEqual(f.events().map((entry) => entry[2].page_path), ['/', '/library']);
});

test('short visits flush while settings are pending', () => {
  const f = fixture();
  f.analytics.start();
  f.analytics.pageView('/', 'Home');
  f.document.visibilityState = 'hidden';
  f.listeners.visibilitychange();
  f.listeners.pagehide();
  assert.equal(f.events().length, 1);
});

test('reuses the HTML loader, queues interactions, and retries a failed tag load', () => {
  const f = fixture();
  const source = readFileSync(new URL('../../public/analytics-bootstrap.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: f.window, document: f.document });
  const original = f.script();
  f.analytics.start();
  assert.equal(f.script(), original);
  f.analytics.event('file_download', { file_id: 3 });
  f.analytics.initialize();
  assert.equal(f.commands().filter((entry) => entry[0] === 'js').length, 1);
  assert.equal(f.events()[0][1], 'file_download');
  original.error();
  f.analytics.pageView('/library', 'Library');
  assert.notEqual(f.script(), original);
  assert.equal(f.events().length, 2);
});

test('a changed settings ID receives subsequent events without duplicate destinations', () => {
  const f = fixture();
  f.analytics.start();
  f.analytics.initialize();
  f.analytics.pageView('/', 'Home');
  f.setId('G-SETTINGS02');
  f.analytics.pageView('/library', 'Library');
  assert.deepEqual(f.events().map((entry) => entry[2].send_to), ['G-DEFAULT01', 'G-SETTINGS02']);
});

test('an unconfigured site does not send queued or subsequent events', () => {
  const f = fixture();
  f.setId('');
  f.analytics.start();
  f.analytics.pageView('/', 'Home');
  f.analytics.initialize();
  f.analytics.pageView('/library', 'Library');
  assert.equal(f.events().length, 0);
  assert.equal(f.script(), undefined);
});

test('HTML loads the analytics bootstrap before the Vue app and rejects invalid tag IDs', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('/analytics-bootstrap.js') < html.indexOf('/src/main.js'));
  const f = fixture();
  f.document.currentScript.dataset.measurementId = '%VITE_GA_MEASUREMENT_ID%';
  const source = readFileSync(new URL('../../public/analytics-bootstrap.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: f.window, document: f.document });
  assert.equal(f.script(), undefined);
});
