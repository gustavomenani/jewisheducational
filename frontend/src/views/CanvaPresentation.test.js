import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('admin, resource page and player expose Canva as a linked view-only presentation', () => {
  const form = read('./admin/MaterialFormView.vue');
  const resource = read('./ResourceView.vue');
  const player = read('./PresentationView.vue');
  const library = read('./LibraryView.vue');
  const favorites = read('./FavoritesView.vue');
  const account = read('./AccountView.vue');

  assert.ok(form.includes('Link from Canva (optional)'));
  assert.ok(form.includes("fd.append('canva_url'"));
  assert.ok(resource.includes('canvaPresentationFile'));
  assert.ok(resource.includes('canvaInlineEmbedUrl'));
  assert.ok(resource.includes(':src="canvaInlineEmbedUrl"'));
  assert.ok(resource.includes('class="k5-preview-canva-frame"'));
  assert.ok(resource.includes('class="k5-preview-canva-open"'));
  assert.ok(player.includes('canvaEmbedUrl'));
  assert.ok(player.includes('Canva presentation'));
  assert.ok(library.includes("fileId: item.canva_url ? 'canva' : item.primary_file_id"));
  assert.ok(favorites.includes('canvaPresentationFile'));
  assert.ok(favorites.includes('@open-presentation="openPresentationView(item)"'));
  assert.ok(account.includes('canvaPresentationFile'));
  assert.ok(account.includes('@open-presentation="openPresentationView(item)"'));
  assert.equal(player.includes('/downloads/'), true, 'PPTX fallback must remain available for viewing');
});
