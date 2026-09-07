import test from 'node:test';
import assert from 'node:assert/strict';
import { googleSlidesEmbedUrl, googleSlidesEmbedUrlForFile } from './googleSlides.js';

test('converts Google Slides edit and published links to safe embed URLs', () => {
  assert.equal(
    googleSlidesEmbedUrl('https://docs.google.com/presentation/d/abc_123/edit?usp=sharing'),
    'https://docs.google.com/presentation/d/abc_123/embed'
  );
  assert.equal(
    googleSlidesEmbedUrl('https://docs.google.com/presentation/d/e/2PACX-published/pub'),
    'https://docs.google.com/presentation/d/e/2PACX-published/embed'
  );
});

test('rejects non-Google Slides URLs', () => {
  assert.equal(googleSlidesEmbedUrl('https://example.com/presentation/d/abc/edit'), '');
  assert.equal(googleSlidesEmbedUrl('javascript:alert(1)'), '');
});

test('recovers the source presentation from imported Google Slides files', () => {
  assert.equal(
    googleSlidesEmbedUrlForFile({ original_name: 'Google Slides - abc_123.pptx' }),
    'https://docs.google.com/presentation/d/abc_123/embed'
  );
  assert.equal(googleSlidesEmbedUrlForFile({ original_name: 'classroom.pptx' }), '');
});
