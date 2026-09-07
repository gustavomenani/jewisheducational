import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CtaBlock.vue', import.meta.url), 'utf8');

test('CTA links navigate outside edit mode and select the block in edit mode', () => {
  assert.ok(source.includes('if (builder.editMode)'));
  assert.ok(source.includes('@click="onButtonClick"'));
  assert.equal(source.includes('@click.prevent.stop="onButtonClick"'), false);
  assert.ok(source.includes('builder.select(props.block.id)'));
});
