import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse, compileScript } from '@vue/compiler-sfc';
import { ref, computed } from 'vue';

const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const compiled = compileScript(descriptor, { id: 'canva-home-settings-test' }).content
  .replace(/^import .*?;\s*$/gm, '')
  .replace('export default', 'globalThis.component =');
const oldLink = 'https://www.canva.com/design/OLD_HOME/share/view';
const newLink = 'https://www.canva.com/design/NEW_HOME/share/view';

async function screen({ home = '', mode = 'native', reject = false } = {}) {
  const persisted = {
    home_canva_url: home, canva_design_reference_url: oldLink, canva_integration_mode: mode,
    library_root_catalog_show: 'true', google_analytics_id: 'G-EXAMPLE',
    download_limit_enabled: 'true', download_limit_max: '10',
    page_home_layout_published: '{"sections":[{"id":"keep-native-home"}]}',
    theme_custom_css: '.keep-theme { color: navy; }', paypal_enabled: 'true',
  };
  const saved = [];
  let mounted;
  const store = { settings: { ...persisted }, async load() { this.settings = { ...persisted }; } };
  const context = {
    ref, computed, URL, onMounted(callback) { mounted = callback; }, useSettingsStore: () => store,
    api: { async put(url, body) {
      assert.equal(url, '/settings');
      if (reject) throw { response: { data: { error: 'Enter a public Canva link.' } } };
      saved.push(structuredClone(body.settings));
      Object.assign(persisted, body.settings);
    } }, LineListEditor: {}, MaterialTypeListEditor: {}, setTimeout() {},
  };
  vm.runInNewContext(compiled, context);
  const view = context.component.setup({}, { expose() {} });
  await mounted();
  return { view, saved, persisted };
}

test('changing the visible Canva field replaces the active home and preserves library and download settings', async () => {
  const { view, saved, persisted } = await screen();
  view.canvaDesignLink.value = newLink;
  await view.save();
  assert.equal(saved[0].home_canva_url, newLink);
  assert.equal(saved[0].canva_integration_mode, 'canva');
  assert.equal(persisted.canva_design_reference_url, oldLink);
  assert.equal(persisted.library_root_catalog_show, 'true');
  assert.equal(persisted.google_analytics_id, 'G-EXAMPLE');
  assert.equal(persisted.download_limit_max, '10');
  assert.equal(persisted.paypal_enabled, 'true');
  assert.equal(persisted.theme_custom_css, '.keep-theme { color: navy; }');
  assert.equal(persisted.page_home_layout_published, '{"sections":[{"id":"keep-native-home"}]}');
});

test('clearing the Canva field restores the saved native home instead of reusing the old reference', async () => {
  const { view, saved } = await screen({ home: oldLink, mode: 'canva' });
  view.canvaDesignLink.value = '';
  await view.save();
  assert.equal(saved[0].home_canva_url, '');
  assert.equal(saved[0].canva_integration_mode, 'native');
  const reloaded = await screen({ home: '', mode: 'native' });
  assert.equal(reloaded.view.canvaDesignLink.value, '');
});

test('a rejected Canva link shows the API error and leaves the saved home unchanged', async () => {
  const { view, persisted, saved } = await screen({ home: oldLink, mode: 'canva', reject: true });
  view.canvaDesignLink.value = 'https://example.com/design/not-canva';
  await view.save();
  assert.equal(view.error.value, 'Enter a public Canva link.');
  assert.equal(persisted.home_canva_url, oldLink);
  assert.equal(saved.length, 0);
});
