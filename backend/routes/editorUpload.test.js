import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const editorSource = readFileSync(new URL('./editor.js', import.meta.url), 'utf8');
const dbIndexSource = readFileSync(new URL('../db/index.js', import.meta.url), 'utf8');
const schemaSource = readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8');

test('editor publish requires a base revision and returns temporary id mappings', () => {
  assert.match(editorSource, /EDITOR_REVISION_REQUIRED/);
  assert.match(editorSource, /EDITOR_REVISION_MISMATCH/);
  assert.match(editorSource, /idMap/);
  assert.match(editorSource, /editorRevisionBump\(Number\.isFinite\(expectedRevision\) \? expectedRevision : null\)/);
});

test('resumable uploads are authenticated, bounded and resumable after reload', () => {
  assert.match(editorSource, /EDITOR_UPLOAD_CHUNK_SIZE = 8 \* 1024 \* 1024/);
  assert.match(editorSource, /editorUploadSessionCreate/);
  assert.match(editorSource, /editorUploadSessionFind/);
  assert.match(editorSource, /router\.get\('\/uploads\/:uploadId'/);
  assert.match(editorSource, /Content-Range must match/);
  assert.match(editorSource, /session_url/);
  assert.match(editorSource, /editorUploadSessionListExpired/);
  assert.match(dbIndexSource, /editorUploadSessionDelete/);
});

test('upload sessions and cover reference cleanup are persisted by the database schema', () => {
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS editor_upload_sessions/);
  assert.match(schemaSource, /size_bytes BIGINT/);
  assert.match(schemaSource, /expires_at DATETIME/);
  assert.match(editorSource, /cleanupUnreferencedCover/);
  assert.match(editorSource, /resourceCoverReferenceCount/);
});

test('staged uploads are kept for retry and only permanent copies are removed on promotion errors', () => {
  assert.match(editorSource, /Staged sessions remain available for a corrected Publish retry/);
  assert.doesNotMatch(editorSource, /Promise\.all\(\[\.\.\.permanentPaths, \.\.\.stagedPaths\]/);
});
