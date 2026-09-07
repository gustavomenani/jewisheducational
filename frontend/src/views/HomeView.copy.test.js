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

test('homepage uses a native editable split hero instead of embedding Canva', () => {
  const source = readFileSync(new URL('./HomeView.vue', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../assets/k5-home.css', import.meta.url), 'utf8');
  assert.ok(source.includes('k5-hero-media'));
  assert.ok(source.includes('k5-hero-eyebrow'));
  assert.ok(source.includes('home_intro_title'));
  assert.ok(source.includes('home_intro_image'));
  assert.ok(source.includes(':cover="true"'));
  assert.ok(source.includes('home_intro_primary'));
  assert.equal(source.includes('<iframe'), false);
  assert.equal(source.includes('homeCanvaEmbedUrl'), false);
  assert.ok(styles.includes('grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr)'));
  assert.ok(styles.includes('.k5-hero-image'));
  assert.ok(styles.includes('@media (max-width: 991px)'));
});
