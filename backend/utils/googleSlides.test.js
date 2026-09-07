import test from 'node:test';
import assert from 'node:assert/strict';
import {
  googleSlidesEmbedUrl,
  googleSlidesFirstSlideUrl,
  googleSlidesPptxExportUrl,
  googleSlidesPresentationId,
  googleSlidesPresentationIdFromImportedFile,
  googleSlidesSourceUrl,
  googleSlidesSourceUrlFromImportedFile,
  downloadGoogleSlidesFirstSlide,
} from './googleSlides.js';

test('preserves the Google Slides source variant while building native URLs', () => {
  assert.equal(
    googleSlidesPresentationId('https://docs.google.com/presentation/d/abc_123/edit?usp=sharing'),
    'abc_123',
  );
  assert.equal(
    googleSlidesPresentationIdFromImportedFile({ original_name: 'Google Slides - abc_123.pptx' }),
    'abc_123',
  );
  assert.equal(
    googleSlidesSourceUrlFromImportedFile({ original_name: 'Google Slides - abc_123.pptx' }),
    'https://docs.google.com/presentation/d/abc_123/edit',
  );
  assert.equal(
    googleSlidesEmbedUrl('https://docs.google.com/presentation/d/abc_123/edit?usp=sharing'),
    'https://docs.google.com/presentation/d/abc_123/embed',
  );
  assert.equal(
    googleSlidesFirstSlideUrl('https://docs.google.com/presentation/d/abc_123/edit', 'slide_first_7'),
    'https://docs.google.com/presentation/d/abc_123/export/png?pageid=slide_first_7',
  );
  assert.equal(
    googleSlidesPptxExportUrl('https://docs.google.com/presentation/d/abc_123/edit'),
    'https://docs.google.com/presentation/d/abc_123/export/pptx',
  );
  assert.equal(
    googleSlidesSourceUrl('https://docs.google.com/presentation/d/e/2PACX-published/pub?start=false'),
    'https://docs.google.com/presentation/d/e/2PACX-published/pub',
  );
  assert.equal(
    googleSlidesEmbedUrl('https://docs.google.com/presentation/d/e/2PACX-published/pub?start=false'),
    'https://docs.google.com/presentation/d/e/2PACX-published/embed',
  );
  assert.equal(
    googleSlidesFirstSlideUrl('https://docs.google.com/presentation/d/e/2PACX-published/pub', 'slide_first_7'),
    '',
  );
  assert.equal(
    googleSlidesPptxExportUrl('https://docs.google.com/presentation/d/e/2PACX-published/pub'),
    '',
  );
});

test('resolves the actual first slide from the Google embed document before exporting it', async () => {
  const nativeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const requestedUrls = [];
  const result = await downloadGoogleSlidesFirstSlide('https://docs.google.com/presentation/d/abc_123/edit', {
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url === 'https://docs.google.com/presentation/d/abc_123/embed') {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => 'docData: [[1280,720],[["slide_first_7",0,"",[]]]];',
        };
      }
      assert.equal(url, 'https://docs.google.com/presentation/d/abc_123/export/png?pageid=slide_first_7');
      return new Response(nativeImage, { headers: { 'content-type': 'image/png' } });
    },
  });

  assert.deepEqual(result, nativeImage);
  assert.deepEqual(requestedUrls, [
    'https://docs.google.com/presentation/d/abc_123/embed',
    'https://docs.google.com/presentation/d/abc_123/export/png?pageid=slide_first_7',
  ]);
});

test('uses the published Google source itself when it cannot export a private Drive PNG', async () => {
  const requestedUrls = [];
  const result = await downloadGoogleSlidesFirstSlide('https://docs.google.com/presentation/d/e/2PACX-published/pub', {
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      assert.equal(url, 'https://docs.google.com/presentation/d/e/2PACX-published/embed');
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => [
          'docData: [[1280,720],[["published_first",0,"",[]]]];',
          "SK_svgData = '\\x3csvg width=\\x221280\\x22 height=\\x22720\\x22 xmlns=\\x22http://www.w3.org/2000/svg\\x22\\x3e\\x3crect width=\\x221280\\x22 height=\\x22720\\x22 fill=\\x22#abcdef\\x22/\\x3e\\x3c/svg\\x3e';",
          "SK_viewerApp.setPageData('published_first', SK_svgData, []);",
        ].join(' '),
      };
    },
  });

  assert.match(result.toString('utf8'), /^<svg\b/);
  assert.deepEqual(requestedUrls, ['https://docs.google.com/presentation/d/e/2PACX-published/embed']);
});
