import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE_DOCUMENT_KEY, validateSiteDocumentPayload } from './siteDocument.js';

function documentWith(block) {
  return JSON.stringify({
    version: 2,
    pages: {
      library: {
        slots: {
          'before-catalog': {
            sections: [{
              id: 'section_1',
              props: { paddingY: 48, maxWidth: 1140 },
              columns: [{ id: 'column_1', span: 12, blocks: [block] }],
            }],
          },
        },
      },
    },
  });
}

test('server accepts only the bounded presentational document schema', () => {
  const raw = documentWith({
    id: 'block_1', type: 'paragraph',
    props: { text: 'A safe paragraph', align: 'left', textStyle: { fontSize: 18, fontWeight: '700' } },
    layout: { span: 12, start: 1, marginTop: 0, marginBottom: 0 },
  });
  const normalized = JSON.parse(validateSiteDocumentPayload(raw));
  assert.equal(normalized.version, 2);
  assert.equal(normalized.pages.library.slots['before-catalog'].sections[0].columns[0].blocks[0].props.text, 'A safe paragraph');
  assert.equal(SITE_DOCUMENT_KEY, 'site_document_v2_published');
});

test('server rejects executable markup, unsafe URLs and protected-zone escapes', () => {
  assert.throws(() => validateSiteDocumentPayload(documentWith({
    id: 'block_1', type: 'paragraph', props: { text: 'x', html: '<script>alert(1)</script>' }, layout: {},
  })), /HTML content/);
  assert.throws(() => validateSiteDocumentPayload(documentWith({
    id: 'block_1', type: 'button', props: { text: 'Open', link: 'javascript:alert(1)' }, layout: {},
  })), /secure https/);
  assert.throws(() => validateSiteDocumentPayload(JSON.stringify({ version: 2, pages: { library: { slots: { 'inside-catalog': { sections: [] } } } } })), /unsafe insertion zone/);
});
