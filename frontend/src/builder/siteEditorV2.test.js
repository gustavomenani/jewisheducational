import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('v2 visual slots are mounted around, never inside, protected page workflows', () => {
  const layouts = read('../layouts/PublicLayout.vue');
  const home = read('../views/HomeView.vue');
  const library = read('../views/LibraryView.vue');
  const resource = read('../views/ResourceView.vue');
  const download = read('../views/DownloadView.vue');
  const login = read('../views/LoginView.vue');
  const account = read('../views/AccountView.vue');

  for (const [source, zones] of [
    [layouts, ['global" zone="after-header', 'global" zone="before-footer']],
    [home, ['home" zone="after-hero', 'home" zone="after-cards', 'home" zone="after-featured', 'home" zone="before-footer']],
    [library, ['library" zone="before-library', 'library" zone="before-catalog', 'library" zone="after-catalog']],
    [resource, ['resource" zone="before-resource', 'resource" zone="after-preview', 'resource" zone="after-resource']],
    [download, ['download" zone="before-download', 'download" zone="after-download']],
    [login, ['auth" zone="before-auth', 'auth" zone="after-auth']],
    [account, ['auth" zone="before-auth', 'auth" zone="after-auth']],
  ]) {
    assert.ok(source.includes("import SiteContentSlot from '@/builder/SiteContentSlot.vue'"));
    for (const zone of zones) assert.ok(source.includes(zone), `Missing safe slot ${zone}`);
  }

  // Existing behavior stays implemented by its original component/function,
  // rather than being converted into an editable content block.
  assert.ok(library.includes('class="search-panel library-filters')); 
  assert.ok(resource.includes('<K5WorksheetActions'));
  assert.ok(download.includes('@click="confirmDownload"'));
  assert.ok(login.includes('<form @submit.prevent="submit">'));
  assert.ok(account.includes('<PayPalCheckout'));
});

test('site content slot gives blocks and sections direct safe editing controls', () => {
  const slot = read('./SiteContentSlot.vue');
  for (const token of [
    'contenteditable', 'cleanPaste', 'text/plain', 'moveDocumentBlock',
    'moveDocumentSectionTo', 'Duplicate section', 'Delete section', 'requestSectionRemoval',
    'Confirm delete section', 'Delete this section?', 'site-slot-delete-section', 'position: sticky',
    'type="file" accept="image/jpeg,image/png,image/webp"', 'Image alt text',
    'More options', 'site-slot-grid', 'maxWidth', 'paddingY',
  ]) assert.ok(slot.includes(token), `Missing v2 direct-editing control: ${token}`);
});

test('site document history, fallback and atomically published payload stay in the store contract', () => {
  const store = read('./store.js');
  for (const token of [
    'SITE_DOCUMENT_KEY', 'migrateLegacySiteDocument', 'parseSiteDocument',
    'siteDocumentDirty', 'beginDocumentHistory', 'commitDocumentHistory',
    'moveDocumentSectionTo', "recordAction('document')", 'SITE_DOCUMENT_DRAFT_KEY',
    'payload[SITE_DOCUMENT_KEY]', 'publishedSiteDocument',
  ]) assert.ok(store.includes(token), `Missing SiteDocument lifecycle capability: ${token}`);
});
