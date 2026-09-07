import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignBlockPlacement,
  normalizeBlockPlacement,
  normalizeLayout,
  parseLayout,
  makeSection,
} from './layout.js';

test('block placement defaults to a safe full-width position', () => {
  assert.deepEqual(normalizeBlockPlacement(), {
    span: 12,
    start: 1,
    marginTop: 0,
    marginBottom: 0,
  });
});

test('block placement clamps invalid and overflowing values', () => {
  assert.deepEqual(
    normalizeBlockPlacement({ span: 50, start: -4, marginTop: -8, marginBottom: 999 }),
    { span: 12, start: 1, marginTop: 0, marginBottom: 160 }
  );
  assert.deepEqual(normalizeBlockPlacement({ span: 6, start: 12 }), {
    span: 6,
    start: 7,
    marginTop: 0,
    marginBottom: 0,
  });
});

test('alignment keeps the block within the twelve-column grid', () => {
  assert.deepEqual(alignBlockPlacement({ span: 6 }, 'left'), {
    span: 6, start: 1, marginTop: 0, marginBottom: 0,
  });
  assert.equal(alignBlockPlacement({ span: 6 }, 'center').start, 4);
  assert.equal(alignBlockPlacement({ span: 6 }, 'right').start, 7);
});

test('legacy layouts receive placement defaults and at least one column', () => {
  const parsed = parseLayout(JSON.stringify({
    sections: [
      { id: 'sec_a', columns: [{ id: 'col_a', span: 12, blocks: [{ id: 'b_a', type: 'image', props: {} }] }] },
      { id: 'sec_b', columns: [] },
    ],
  }));

  assert.deepEqual(parsed.sections[0].columns[0].blocks[0].layout, normalizeBlockPlacement());
  assert.equal(parsed.sections[1].columns.length, 1);
});

test('normalization repairs duplicate ids without dropping content', () => {
  const normalized = normalizeLayout({
    sections: [
      {
        id: 'same',
        columns: [
          {
            id: 'same',
            blocks: [
              { id: 'same', type: 'paragraph', props: { text: 'A' } },
              { id: 'same', type: 'paragraph', props: { text: 'B' } },
            ],
          },
        ],
      },
    ],
  });
  const ids = [
    normalized.sections[0].id,
    normalized.sections[0].columns[0].id,
    ...normalized.sections[0].columns[0].blocks.map((block) => block.id),
  ];

  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    normalized.sections[0].columns[0].blocks.map((block) => block.props.text),
    ['A', 'B']
  );
});

test('invalid serialized layouts never throw', () => {
  assert.equal(parseLayout('{broken'), null);
  assert.deepEqual(parseLayout({ sections: 'wrong' }), { sections: [] });
});

test('section presets keep their background and spacing properties', () => {
  const section = makeSection(undefined, {
    paddingY: 80,
    bg: 'linear-gradient(90deg, #000, #fff)',
  });
  assert.equal(section.props.paddingY, 80);
  assert.equal(section.props.bg, 'linear-gradient(90deg, #000, #fff)');
  assert.equal(section.props.maxWidth, 1140);
});
