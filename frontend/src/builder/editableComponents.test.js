import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('editable settings support direct plain-text editing and keep advanced controls available', () => {
  const source = readFileSync(new URL('./EditableSetting.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('@click="beginInlineEdit"'));
  assert.ok(source.includes('builder.selectSetting(metadata.value)'));
  assert.ok(source.includes(':contenteditable="canEditInline ?'));
  assert.ok(source.includes('cleanPaste'));
  assert.ok(source.includes('beginInlineSettingEdit'));
  assert.ok(source.includes('commitInlineSettingEdit'));
  assert.ok(source.includes('font_family'));
  assert.ok(source.includes('is-selected'));
  assert.ok(source.includes('visibilityKey'));
  assert.ok(source.includes('allowRemove'));
});

test('legacy text blocks are edited directly as clean text and coalesce undo history', () => {
  const source = readFileSync(new URL('./EditableText.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('selectId'));
  assert.ok(source.includes('builder.select(props.selectId)'));
  assert.ok(source.includes(':contenteditable="isDirectlyEditable ?'));
  assert.ok(source.includes("defineEmits(['update:modelValue', 'commit'])"));
  assert.ok(source.includes('cleanPaste'));
  assert.ok(source.includes('builder.beginHistory()'));
});

test('homepage benefit cards expose editable title and description settings', () => {
  const home = readFileSync(new URL('../views/HomeView.vue', import.meta.url), 'utf8');
  const catalog = readFileSync(new URL('./fieldCatalog.js', import.meta.url), 'utf8');
  assert.ok(home.includes('home_benefit_${index + 1}_title'));
  assert.ok(home.includes('home_benefit_${index + 1}_text'));
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(catalog.includes(`home_benefit_${index}_title`));
    assert.ok(catalog.includes(`home_benefit_${index}_text`));
  }
});

test('editable image exposes direct replacement, sizing, alt text and hide controls', () => {
  const source = readFileSync(new URL('./EditableImage.vue', import.meta.url), 'utf8');
  assert.ok(source.includes('altSettingKey'));
  assert.ok(source.includes('selectSetting'));
  assert.ok(source.includes('Image removed'));
  assert.ok(source.includes('visibilityKey'));
  assert.ok(source.includes('type="file" accept="image/jpeg,image/png,image/webp"'));
  assert.ok(source.includes('uploadImage'));
  assert.ok(source.includes('updateWidth'));
  assert.ok(source.includes('Alt text'));
  assert.ok(source.includes('Hide image'));
});

test('button links keep visitor navigation while selecting in editor mode', () => {
  const source = readFileSync(new URL('./blocks/ButtonBlock.vue', import.meta.url), 'utf8');
  assert.equal(source.includes('@click.prevent.stop="onClick"'), false);
  assert.ok(source.includes('builder.editMode'));
  assert.ok(source.includes('block.props.link'));
});
