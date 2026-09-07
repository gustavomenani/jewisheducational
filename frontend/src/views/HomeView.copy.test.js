import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('homepage fixed copy is English', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8');
  for (const phrase of [
    'Download imediato',
    'Organizado por tema',
    'Feito para educadores',
    'Visualize antes',
    'Guia gratuito',
    'BAIXAR',
    'COMO AJUDAR SEUS FILHOS NO ESTUDO JUDAICO',
  ]) {
    assert.equal(source.includes(phrase), false, `Portuguese homepage copy remains: ${phrase}`);
  }
});

test('public layout waits for published settings instead of flashing legacy defaults', () => {
  const layout = readFileSync(new URL('../layouts/PublicLayout.vue', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../stores/index.js', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../utils/theme.js', import.meta.url), 'utf8');
  assert.ok(layout.includes('v-if="!settings.ready"'));
  assert.ok(layout.includes('k5-site-loading'));
  assert.ok(layout.includes('@click="settings.load"'));
  assert.ok(store.includes('const ready = ref(false)'));
  assert.ok(store.includes('const loadError = ref(null)'));
  assert.ok(store.includes("api.get('/settings', { timeout: 15000 })"));
  assert.ok(store.includes('ready.value = false'));
  assert.match(theme, /home_canva_url:\s*'',/);
});

test('homepage does not expose the removed Canva showcase', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8');
  assert.ok(!source.includes('homeCanvaEmbedUrl'));
  assert.ok(!source.includes('k5-canva-showcase'));
  assert.ok(!source.includes('home_canva_url'));
});

test('homepage restores the complete native layout when every editable section is hidden', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../assets/k5-home.css', import.meta.url), 'utf8');
  assert.ok(source.includes('restoreDefaultHome'));
  assert.ok(source.includes('rawShowHero.value || restoreDefaultHome.value'));
  assert.ok(source.includes('rawShowCards.value || restoreDefaultHome.value'));
  assert.ok(source.includes('rawShowTopics.value || restoreDefaultHome.value'));
  assert.ok(source.includes('rawShowFeatured.value || restoreDefaultHome.value'));
  assert.ok(source.includes('rawShowRecent.value || restoreDefaultHome.value'));
  assert.equal(source.includes('showSafeHome'), false);
  assert.equal(source.includes('k5-safe-home'), false);
  assert.equal(styles.includes('.k5-safe-home'), false);
});
