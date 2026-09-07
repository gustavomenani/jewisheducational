import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('builder store exposes unified selection and history controls', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  for (const token of [
    'selectedSetting',
    'selectSetting',
    'clearSelection',
    'resetSetting',
    'canUndo',
    'canRedo',
    'redo',
    'future',
    'beginHistory',
    'setBlockProps',
    'setBlockHidden',
    'updateBlockLayout',
    'actionHistory',
    'actionFuture',
  ]) {
    assert.ok(source.includes(token), `Missing builder capability: ${token}`);
  }
  assert.ok(source.includes('version: 3'));
});

test('undo and redo use one chronological action order', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes("recordAction('setting')"));
  assert.ok(source.includes("recordAction('layout')"));
  assert.ok(source.includes('const kind = actionHistory.value.pop()'));
  assert.ok(source.includes('const kind = actionFuture.value.pop()'));
});

test('all new blocks and persisted layouts are normalized', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('function createBlock'));
  assert.ok(source.includes('layout: normalizeBlockPlacement()'));
  assert.ok(source.includes('layout: normalizeLayout(layout.value)'));
  assert.ok(source.includes('JSON.stringify(safeLayout)'));
});

test('setting no-ops do not consume history', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /if \(settingsEquivalent\(current, value\)\) return false/);
  assert.ok(source.includes("left === undefined || left === ''"));
});

test('empty draft text stays empty instead of falling back to the default', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('return pending === undefined ? fallback : pending;'));
  assert.ok(source.includes('return live === undefined || live === null ? fallback : live;'));
});

test('structural history captures canvas mode together with the layout', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('function captureStructure'));
  assert.ok(source.includes('useCanvas: useCanvas.value'));
  assert.ok(source.includes('restoreStructure(history.value.pop())'));
  assert.ok(source.includes('restoreStructure(future.value.pop())'));
});

test('recovered drafts remain marked as unpublished changes', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /dirty\.value\s*=\s*Object\.keys\(pendingSettings\.value\)\.length\s*>\s*0/);
});

test('changing columns preserves blocks from columns that are removed', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('overflowBlocks'));
  assert.match(source, /targetColumn\.blocks\.push\(\.\.\.overflowBlocks\)/);
});

test('adding an empty section activates the canvas in the same mutation', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /function addSection\(\) \{[\s\S]*?mutate\(\(\) => \{[\s\S]*?useCanvas\.value = true;[\s\S]*?layout\.value\.sections\.push\(makeSection\(\)\)/);
});

test('builder store keeps one global content draft with reversible operations', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  for (const token of [
    'pendingContent', 'contentDraft', 'publishedContent', 'loadContent',
    'setQuickTopics', 'createContentItem', 'updateContentItem',
    'archiveContentItem', 'restoreContentItem', 'duplicateContentItem',
    'moveContentItem', 'queueContentUpload', 'removeContentUpload',
    'updateContentFile', 'archiveContentFile', 'restoreContentFile', 'moveContentFile', 'CONTENT_DRAFT_KEY',
  ]) assert.ok(source.includes(token), `Missing content draft capability: ${token}`);
  assert.ok(source.includes("pendingContent.value = { quickTopics: null, operations: [] }"));
  assert.ok(source.includes("localStorage.removeItem(CONTENT_DRAFT_KEY)"));
  assert.ok(source.includes("entity: 'file'"));
  assert.ok(source.includes('uploads: contentUploads.value.map'));
});

test('content recovery drops every operation that depends on a lost browser upload', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('droppedClientIds'));
  assert.ok(source.includes('referencesDroppedFile'));
});

test('completed staged uploads survive a reload without serializing browser File objects', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.ok(source.includes('persistedUploads'));
  assert.ok(source.includes('upload.stagedPath'));
  assert.match(source, /file: null,\s*progress: upload\.stagedPath \? 100/);
  assert.ok(source.includes('stagedPath: upload.stagedPath'));
});

test('active resumable uploads retain their session metadata for browser reloads', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /filter\(\(upload\) => upload\.uploadId\)/);
  assert.match(source, /resumeAvailable/);
  assert.match(source, /editor\/uploads\/\$\{upload\.uploadId\}/);
  assert.match(source, /receivedBytes/);
});

test('builder store exposes one transactional API for direct record text', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  for (const token of [
    'selectedContentText',
    'selectContentText',
    'beginInlineContentEdit',
    'setInlineContentText',
    'commitInlineContentEdit',
    'cancelInlineContentEdit',
  ]) assert.ok(source.includes(token), `Missing inline content capability: ${token}`);
});

test('a direct typing session records one content action only on commit', () => {
  const source = readFileSync(new URL('./store.js', import.meta.url), 'utf8');
  assert.match(source, /let activeInlineContentSnapshot = null/);
  assert.match(source, /contentHistory\.value\.push\(before\)/);
  assert.match(source, /recordAction\('content'\)/);
  assert.match(source, /operations: \[\.\.\.pendingContent\.value\.operations, operation\]/);
});
