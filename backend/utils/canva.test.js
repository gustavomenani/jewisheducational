import test from 'node:test';
import assert from 'node:assert/strict';
import { canvaEmbedUrl, canvaSourceUrl, resolveCanvaSourceUrl } from './canva.js';

test('normalizes public Canva design links and creates a safe embed URL', () => {
  const shared = 'https://www.canva.com/design/DAGabc_123/shareKey/view?utm_content=DAGabc_123&utm_campaign=designshare';
  assert.equal(
    canvaSourceUrl(shared),
    'https://www.canva.com/design/DAGabc_123/shareKey/view',
  );
  assert.equal(
    canvaEmbedUrl(shared),
    'https://www.canva.com/design/DAGabc_123/shareKey/view?embed',
  );
  assert.equal(
    canvaEmbedUrl('https://canva.com/design/DAGabc_123/view?embed'),
    'https://www.canva.com/design/DAGabc_123/view?embed',
  );
});

test('converts edit links to view-only URLs and rejects unrelated or unsafe links', () => {
  assert.equal(
    canvaSourceUrl('https://www.canva.com/design/DAGabc_123/shareKey/edit?utm_source=sharebutton'),
    'https://www.canva.com/design/DAGabc_123/shareKey/view',
  );
  assert.equal(canvaSourceUrl('https://www.canva.com/templates/'), '');
  assert.equal(canvaSourceUrl('https://example.com/design/DAGabc_123/view'), '');
  assert.equal(canvaSourceUrl('https://www.canva.com:444/design/DAGabc_123/view'), '');
  assert.equal(canvaSourceUrl('javascript:alert(1)'), '');
});

test('resolves a Canva short link only through Canva-owned redirects', async () => {
  const fetchImpl = async () => ({
    status: 301,
    headers: new Headers({
      location: 'https://www.canva.com/design/DAHUORXo498/CCTIyWkykmcErxu_r7Ja0g/edit?utm_source=sharebutton',
    }),
  });
  assert.equal(
    await resolveCanvaSourceUrl('https://canva.link/9p33qw4qjy7ru1c', { fetchImpl }),
    'https://www.canva.com/design/DAHUORXo498/CCTIyWkykmcErxu_r7Ja0g/view',
  );
  assert.equal(
    await resolveCanvaSourceUrl('https://example.com/9p33qw4qjy7ru1c', { fetchImpl }),
    '',
  );
});
