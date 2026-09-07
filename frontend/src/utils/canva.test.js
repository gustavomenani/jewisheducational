import test from 'node:test';
import assert from 'node:assert/strict';
import { canvaEmbedUrl, canvaPresentationFile } from './canva.js';

test('turns a public Canva link into an allowlisted embed URL', () => {
  assert.equal(
    canvaEmbedUrl('https://www.canva.com/design/DAGabc_123/shareKey/view?utm_source=uniquelinks'),
    'https://www.canva.com/design/DAGabc_123/shareKey/view?embed',
  );
  assert.equal(canvaEmbedUrl('https://example.com/design/DAGabc_123/view'), '');
  assert.equal(canvaEmbedUrl('https://www.canva.com:444/design/DAGabc_123/view'), '');
});

test('turns a Canva edit link into a view-only embed', () => {
  assert.equal(
    canvaEmbedUrl('https://www.canva.com/design/DAHUORXo498/CCTIyWkykmcErxu_r7Ja0g/edit?utm_source=sharebutton'),
    'https://www.canva.com/design/DAHUORXo498/CCTIyWkykmcErxu_r7Ja0g/view?embed',
  );
});

test('creates a view-only virtual presentation without a downloadable file', () => {
  assert.deepEqual(
    canvaPresentationFile('https://www.canva.com/design/DAGabc_123/view'),
    {
      id: 'canva',
      label: 'Canva presentation',
      original_name: 'Canva presentation',
      file_type: 'canva',
      mime_type: 'application/x-canva-presentation',
      is_primary: 1,
      external_view_only: true,
    },
  );
  assert.equal(canvaPresentationFile('https://example.com/design/DAGabc_123/view'), null);
});
