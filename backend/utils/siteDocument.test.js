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

test('Canva blocks publish only canonical Canva embeds with a bounded height', () => {
  const raw = documentWith({ id: 'canva_1', type: 'canva', props: {
    url: 'https://www.canva.com/design/DAGabc_123/shareKey/edit?utm_source=sharebutton',
    height: 760, hidden: true, iframe: '<iframe src="https://example.com">',
  } });
  const block = JSON.parse(validateSiteDocumentPayload(raw)).pages.library.slots['before-catalog'].sections[0].columns[0].blocks[0];
  assert.deepEqual(block.props, {
    url: 'https://www.canva.com/design/DAGabc_123/shareKey/view', height: 760, hidden: true,
  });
  for (const url of ['javascript:alert(1)', 'https://example.com/design/DAGabc_123/view', 'https://www.canva.com:444/design/DAGabc_123/view']) {
    assert.throws(() => validateSiteDocumentPayload(documentWith({ id: 'canva_1', type: 'canva', props: { url } })), /public Canva/);
  }
  assert.throws(() => validateSiteDocumentPayload(documentWith({ id: 'canva_1', type: 'canva', props: { url: '', height: 10000 } })), /Canva height/);
});
