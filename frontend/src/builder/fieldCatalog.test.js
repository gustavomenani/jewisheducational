import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDITOR_AREAS,
  fieldByKey,
  fieldsForArea,
  normalizeEditorUrl,
} from './fieldCatalog.js';

test('catalog exposes all supported editor areas', () => {
  assert.deepEqual(
    EDITOR_AREAS.map((area) => area.id),
    ['global', 'home', 'library', 'resource', 'download', 'auth'],
  );
});

test('catalog exposes global and page fields', () => {
  assert.ok(fieldsForArea('global').some((field) => field.key === 'site_name'));
  assert.ok(fieldsForArea('home').some((field) => field.key === 'hero_title'));
  assert.ok(!fieldsForArea('home').some((field) => field.key === 'home_canva_url'));
  assert.equal(fieldByKey('library_clear_filters_label').default, 'Clear filters');
  assert.equal(fieldByKey('auth_login_title').default, 'Welcome back');
});

test('Hero controls expose visibility toggles and safe alignment choices', () => {
  const fields = fieldsForArea('home');
  const alignment = fieldByKey('hero_content_align');
  const primary = fieldByKey('home_hero_cta_primary_show');
  const secondary = fieldByKey('home_hero_cta_secondary_show');
  assert.equal(alignment.type, 'select');
  assert.deepEqual(alignment.options.map((option) => option.value), ['left', 'center', 'right']);
  assert.equal(primary.type, 'boolean');
  assert.equal(secondary.type, 'boolean');
  assert.ok(fields.includes(alignment));
  assert.ok(fields.includes(primary));
  assert.ok(fields.includes(secondary));
});

test('catalog keys are unique', () => {
  const keys = EDITOR_AREAS.flatMap((area) => fieldsForArea(area.id).map((field) => field.key));
  assert.equal(new Set(keys).size, keys.length);
});

test('URL normalization rejects unsafe protocols', () => {
  assert.equal(normalizeEditorUrl('javascript:alert(1)'), null);
  assert.equal(normalizeEditorUrl('//unsafe.example'), null);
  assert.equal(normalizeEditorUrl('/library'), '/library');
  assert.equal(normalizeEditorUrl('mailto:hello@example.com'), 'mailto:hello@example.com');
  assert.equal(normalizeEditorUrl('tel:+17863996386'), 'tel:+17863996386');
  assert.equal(normalizeEditorUrl('https://example.com'), 'https://example.com/');
});
