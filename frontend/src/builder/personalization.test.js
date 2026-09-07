import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = readFileSync(new URL('./registry.js', import.meta.url), 'utf8');
const imageBlock = readFileSync(new URL('./blocks/ImageBlock.vue', import.meta.url), 'utf8');
const store = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('./BlockRenderer.vue', import.meta.url), 'utf8');
const home = readFileSync(new URL('../views/HomeView.vue', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../layouts/PublicLayout.vue', import.meta.url), 'utf8');

test('image blocks support safe presentation controls', () => {
  for (const token of ['caption', 'link', 'align', 'size']) {
    assert.ok(registry.includes(token), `Missing image field: ${token}`);
  }
  assert.ok(imageBlock.includes('<figure'));
  assert.ok(imageBlock.includes('<figcaption'));
  assert.ok(imageBlock.includes('safeLink'));
  assert.ok(imageBlock.includes('sizeClass'));
});

test('store provides responsive image and text section presets', () => {
  assert.ok(store.includes("presetType === 'image-text'"));
  assert.ok(store.includes("presetType === 'text-image'"));
  assert.ok(store.includes("makeColumn(6"));
  assert.ok(store.includes('moveBlockBy'));
  assert.ok(renderer.includes('Move block up'));
  assert.ok(renderer.includes('Move block down'));
});

test('custom blocks are embedded in Home instead of replacing its dynamic page', () => {
  assert.ok(home.includes("import BlockRenderer from '@/builder/BlockRenderer.vue'"));
  assert.ok(home.includes('<BlockRenderer'));
  assert.equal(layout.includes('<BlockRenderer v-if="showCanvas"'), false);
});

test('Home Hero buttons can be hidden and aligned from settings', () => {
  for (const token of ['showHeroPrimary', 'showHeroSecondary', 'heroContentAlign', 'home_hero_cta_primary_show', 'home_hero_cta_secondary_show', 'hero_content_align']) {
    assert.ok(home.includes(token), `Missing Hero control: ${token}`);
  }
  assert.ok(home.includes('v-if="showHeroPrimary"'));
  assert.ok(home.includes('v-if="showHeroSecondary"'));
  assert.ok(home.includes('justifyContent'));
});

test('block renderer helper copy is English-only', () => {
  for (const forbidden of ['Alterar Columns', 'Coluna', 'Pequeno', 'Grande', 'Solte blocos', 'Drag para mover']) {
    assert.equal(renderer.includes(forbidden), false, `Found mixed-language copy: ${forbidden}`);
  }
});
