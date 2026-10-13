const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareSettingsRestore } = require('./restore-admin-settings');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(path.resolve(__dirname, '..'), 'jer-settings-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const currentDist = path.join(temp, 'current');
  const outputDist = path.join(temp, 'restored');
  fs.mkdirSync(path.join(currentDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(currentDist, 'index.html'), '<html><head><script type="module" src="/assets/index-live.js"></script></head><body></body></html>');
  fs.writeFileSync(path.join(currentDist, 'assets/index-live.js'), 'import("./SettingsView-live.js"); export { store as B };');
  fs.writeFileSync(path.join(currentDist, 'assets/SettingsView-live.js'), 'old settings');
  fs.writeFileSync(path.join(currentDist, 'assets/materialTypes-live.js'), 'export { parse as p };');
  fs.writeFileSync(path.join(currentDist, 'assets/materials-live.js'), 'preserve bulk upload and AI description');
  const settingsBundle = path.join(temp, 'SettingsView-new.js');
  fs.writeFileSync(settingsBundle, 'import { B as store } from "./index-new.js"; import { p as parse } from "./materialTypes-new.js"; const field="home_canva_url", label="Canva design link";');
  return { currentDist, outputDist, settingsBundle };
}

test('restores Settings without changing existing assets and loads its dependencies from the current build', t => {
  const args = fixture(t);
  const result = prepareSettingsRestore(args);
  for (const name of fs.readdirSync(path.join(args.currentDist, 'assets'))) {
    assert.deepEqual(fs.readFileSync(path.join(args.outputDist, 'assets', name)), fs.readFileSync(path.join(args.currentDist, 'assets', name)));
  }
  const html = fs.readFileSync(path.join(args.outputDist, 'index.html'), 'utf8');
  assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
  const restored = fs.readFileSync(path.join(args.outputDist, 'assets', result.restoredSettings), 'utf8');
  assert.ok(restored.includes('./index-live.js'));
  assert.ok(restored.includes('./materialTypes-live.js'));
  assert.equal(result.imports['/assets/SettingsView-live.js'], `/assets/${result.restoredSettings}`);
});

test('rejects missing Canva fields and incompatible shared dependencies before creating output', t => {
  const args = fixture(t);
  fs.writeFileSync(args.settingsBundle, 'old settings');
  assert.throws(() => prepareSettingsRestore(args), /expose the Canva home field/);
  assert.equal(fs.existsSync(args.outputDist), false);
  fs.writeFileSync(args.settingsBundle, 'import { missing } from "./index-new.js"; const field="home_canva_url", label="Canva design link";');
  assert.throws(() => prepareSettingsRestore(args), /does not export missing/);
  assert.equal(fs.existsSync(args.outputDist), false);
});

test('rejects output nested inside the source build', t => {
  const args = fixture(t);
  assert.throws(() => prepareSettingsRestore({ ...args, outputDist: path.join(args.currentDist, 'nested') }), /outside the current build/);
  assert.equal(fs.existsSync(path.join(args.currentDist, 'nested')), false);
});

test('updates Settings in an existing import map while preserving the current layout and other mappings', t => {
  const args = fixture(t);
  const oldMap = { imports: { '/assets/SettingsView-live.js': '/assets/SettingsView-prior.js', '/assets/PublicLayout-live.js': '/assets/PublicLayout-fixed.js' }, scopes: { '/extra/': { other: '/assets/other.js' } } };
  fs.writeFileSync(path.join(args.currentDist, 'index.html'), `<html><head><script type="importmap">${JSON.stringify(oldMap)}</script><script type="module" src="/assets/index-live.js"></script></head></html>`);
  const result = prepareSettingsRestore(args);
  const html = fs.readFileSync(path.join(args.outputDist, 'index.html'), 'utf8');
  assert.equal((html.match(/type="importmap"/g) || []).length, 1);
  const map = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]);
  assert.equal(map.imports['/assets/SettingsView-live.js'], `/assets/${result.restoredSettings}`);
  assert.equal(map.imports['/assets/PublicLayout-live.js'], '/assets/PublicLayout-fixed.js');
  assert.deepEqual(map.scopes, oldMap.scopes);
});

test('rejects malformed and competing import maps before writing output', t => {
  const args = fixture(t);
  const shell = '<script type="module" src="/assets/index-live.js"></script>';
  for (const maps of ['<script type="importmap">not json</script>', '<script type="importmap">{}</script><script type="importmap">{}</script>', '<script type="importmap">{"scopes":{"/admin/":{"/assets/SettingsView-live.js":"/other.js"}}}</script>']) {
    fs.writeFileSync(path.join(args.currentDist, 'index.html'), `<html><head>${maps}${shell}</head></html>`);
    assert.throws(() => prepareSettingsRestore(args), /import map|Settings/);
    assert.equal(fs.existsSync(args.outputDist), false);
  }
});
