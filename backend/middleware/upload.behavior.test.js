import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-upload-reliability-'));
process.env.DB_DRIVER = 'memory';
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');

const { contentMatchesType, processUploadedFiles, uploadStorageSubdir } = await import('./upload.js?reliability-upload');

after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test('content magic checks reject spoofed document payloads', () => {
  assert.equal(contentMatchesType(Buffer.from('%PDF-1.7\n'), 'application/pdf'), true);
  assert.equal(contentMatchesType(Buffer.from('<!doctype html>'), 'application/pdf'), false);
  assert.equal(contentMatchesType(Buffer.from('not-an-image'), 'image/png'), false);
});

test('image material files use file storage while covers use cover storage', () => {
  assert.equal(uploadStorageSubdir({ fieldname: 'file', mimetype: 'image/png' }), 'files');
  assert.equal(uploadStorageSubdir({ fieldname: 'files', mimetype: 'image/png' }), 'files');
  assert.equal(uploadStorageSubdir({ fieldname: 'cover', mimetype: 'image/png' }), 'covers');
  assert.equal(uploadStorageSubdir({ fieldname: 'file_thumbnails', mimetype: 'image/png' }), 'covers');
});

test('site editor image uploads can explicitly use public cover storage', () => {
  assert.equal(
    uploadStorageSubdir({ fieldname: 'file', storageSubdir: 'covers', mimetype: 'image/png' }),
    'covers',
  );
});

test('multipart processing removes earlier staged files when a later file fails', async () => {
  const validPath = path.join(tempRoot, 'valid.pdf');
  const invalidPath = path.join(tempRoot, 'invalid.pdf');
  fs.writeFileSync(validPath, Buffer.from('%PDF-1.7\nvalid'));
  fs.writeFileSync(invalidPath, Buffer.from('<html>bad</html>'));

  await assert.rejects(
    processUploadedFiles([
      { path: validPath, mimetype: 'application/pdf', originalname: 'valid.pdf' },
      { path: invalidPath, mimetype: 'application/pdf', originalname: 'invalid.pdf' },
    ]),
    (error) => error.status === 400
  );
  assert.equal(fs.existsSync(validPath), false);
  assert.equal(fs.existsSync(invalidPath), false);
});
