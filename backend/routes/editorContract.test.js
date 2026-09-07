import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./editor.js', import.meta.url), 'utf8');

test('editor content API is admin-only and returns archived data for the panel', () => {
  assert.match(source, /router\.get\('\/content', authenticate, requireAdmin/);
  assert.match(source, /router\.post\('\/publish', authenticate, requireAdmin/);
  for (const flag of ['is_archived', 'nav_visible', 'is_published']) {
    assert.ok(source.includes(flag), `Missing content flag: ${flag}`);
  }
  for (const action of ['create', 'update', 'archive', 'restore', 'reorder']) {
    assert.ok(source.includes(`action === '${action}'`) || source.includes(`action: '${action}'`), `Missing content action: ${action}`);
  }
  for (const token of ['applyFileOperation', "entity === 'file'", 'is_archived', 'includeArchived']) {
    assert.ok(source.includes(token), `Missing file content capability: ${token}`);
  }
});

test('publish route accepts settings, operations and file manifests and compensates on failure', () => {
  for (const phrase of ['file_manifest', 'processUploadedFiles', 'settingsUpsert', 'loadEditorContent', 'storageDelete']) {
    assert.ok(source.includes(phrase), `Missing publish contract: ${phrase}`);
  }
  assert.ok(source.includes('for (const revert of [...undo].reverse())'));
});

test('publish returns server-normalized settings to keep the editor preview in sync', () => {
  const editor = readFileSync(new URL('./editor.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../../frontend/src/builder/store.js', import.meta.url), 'utf8');
  assert.match(editor, /publishedSettings:\s*settings/);
  assert.match(store, /data\?\.publishedSettings\s*\|\|\s*payload/);
});

test('inline text updates are plain text and keep public slugs stable', () => {
  for (const token of [
    'normalizeEditorTextFields',
    'CATEGORY_TEXT_FIELDS',
    'MATERIAL_TEXT_FIELDS',
    'normalizeEditorPageLayout',
  ]) assert.ok(source.includes(token), 'Missing inline text safeguard: ' + token);

  const categoryUpdate = source.slice(
    source.indexOf('const next = pickFields(data, CATEGORY_FIELDS);'),
    source.indexOf('await db.categoryUpdate(id, next);')
  );
  const materialUpdate = source.slice(
    source.indexOf('const next = pickFields(data, MATERIAL_FIELDS);'),
    source.indexOf('if (cover) {')
  );
  assert.doesNotMatch(categoryUpdate, /next\.slug/);
  assert.doesNotMatch(materialUpdate, /next\.slug/);
});

test('duplicated materials resolve edits to cloned file rows', () => {
  assert.match(source, /source\.clientId && !source\.sourceFileId/);
  assert.match(source, /clientIds\.set\(String\(source\.clientId\), id\)/);
});

test('pending editor images can be cleaned up safely on discard', () => {
  const settings = readFileSync(new URL('../routes/settings.js', import.meta.url), 'utf8');
  assert.match(settings, /router\.delete\('\/upload', authenticate, requireAdmin/);
  assert.match(settings, /pathValue\.startsWith\('covers\/'\)/);
});

test('archived files stay hidden from public downloads', () => {
  const downloads = readFileSync(new URL('./downloads.js', import.meta.url), 'utf8');
  assert.match(downloads, /file\.is_archived\s*&&\s*req\.user\?\.role\s*!==\s*'admin'/);
});
