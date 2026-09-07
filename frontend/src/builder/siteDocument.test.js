import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_DOCUMENT_KEY,
  SITE_DOCUMENT_VERSION,
  createSiteDocumentBlock,
  emptySiteDocument,
  migrateLegacySiteDocument,
  normalizeSiteDocument,
  pageIdForRouteSlug,
  parseSiteDocument,
  siteDocumentHasContent,
  siteDocumentSlot,
} from './siteDocument.js';
import { publishedKey } from './layout.js';

test('v2 document exposes a safe, responsive slot map for every editor area', () => {
  const document = emptySiteDocument();
  assert.equal(document.version, SITE_DOCUMENT_VERSION);
  assert.deepEqual(Object.keys(document.pages), ['home', 'library', 'resource', 'download', 'auth', 'global']);
  assert.deepEqual(siteDocumentSlot(document, 'resource', 'after-preview'), { sections: [] });
  assert.equal(siteDocumentHasContent(document), false);
});

test('v2 document normalizes blocks, links and visual values without accepting executable data', () => {
  const document = normalizeSiteDocument({
    version: 2,
    pages: {
      library: {
        slots: {
          'before-catalog': {
            sections: [{
              props: { paddingY: 999, bg: 'javascript:alert(1)' },
              columns: [{
                blocks: [
                  { id: 'copy', type: 'paragraph', props: { text: 'Hello', textStyle: { fontSize: 24, fontWeight: '700' } } },
                  { id: 'bad', type: 'script', props: { html: '<script>' } },
                  { id: 'button', type: 'button', props: { text: 'Open', link: 'javascript:alert(1)' } },
                ],
              }],
            }],
          },
        },
      },
    },
  });
  const slot = siteDocumentSlot(document, 'library', 'before-catalog');
  assert.equal(slot.sections[0].props.paddingY, 160);
  assert.equal(slot.sections[0].props.bg, '');
  assert.deepEqual(slot.sections[0].columns[0].blocks.map((block) => block.id), ['copy', 'button']);
  assert.equal(slot.sections[0].columns[0].blocks[1].props.link, '/');
  assert.equal(slot.sections[0].columns[0].blocks[0].props.textStyle.fontWeight, '700');
  assert.equal(siteDocumentHasContent(document), true);
});

test('legacy Home canvas is preserved as a non-duplicating migration fallback', () => {
  const settings = {
    [publishedKey('home')]: JSON.stringify({ sections: [{ id: 'legacy', columns: [{ id: 'column', span: 12, blocks: [] }] }] }),
  };
  const migrated = migrateLegacySiteDocument(settings);
  assert.deepEqual(migrated.legacy.home, { sourceKey: publishedKey('home'), preserved: true });
  assert.equal(siteDocumentHasContent(migrated), false);
  assert.equal(parseSiteDocument(JSON.stringify({ ...migrated, version: SITE_DOCUMENT_VERSION })).version, 2);
  assert.equal(SITE_DOCUMENT_KEY, 'site_document_v2_published');
});

test('new editor blocks are deliberately limited to the simple client palette', () => {
  assert.equal(createSiteDocumentBlock('heading').type, 'heading');
  assert.equal(createSiteDocumentBlock('image').props.maxWidth, 100);
  assert.equal(createSiteDocumentBlock('video'), null);
  assert.equal(pageIdForRouteSlug('category'), 'library');
  assert.equal(pageIdForRouteSlug('forgot-password'), 'auth');
});
