import test from 'node:test';
import assert from 'node:assert/strict';
import { generateImageCover } from './pptxCover.js';

test('turns a native slide image into the same JPEG cover format used by catalog cards', async () => {
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL0NwAAAABJRU5ErkJggg==',
    'base64',
  );

  const cover = await generateImageCover(onePixelPng, { width: 320, height: 180, watermark: 'Test library' });

  assert.ok(Buffer.isBuffer(cover));
  assert.equal(cover[0], 0xff);
  assert.equal(cover[1], 0xd8);
});

test('turns a Google Slides native SVG fallback into a JPEG cover', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#abcdef"/></svg>',
  );

  const cover = await generateImageCover(svg, { width: 320, height: 180, watermark: 'Test library' });

  assert.ok(Buffer.isBuffer(cover));
  assert.equal(cover[0], 0xff);
  assert.equal(cover[1], 0xd8);
});
