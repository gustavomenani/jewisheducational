// Canonical paths for material files. Older imports stored values as
// `foo.pdf`, `files/foo.pdf`, or `/uploads/files/foo.pdf`; all adapters and
// cleanup paths must resolve those forms to the same Storage object.
export function normalizeFileStoragePath(value) {
  let raw = String(value || '').trim().replace(/^[/\\]+/, '');
  raw = raw.replace(/^uploads\//i, '');
  if (!raw) return '';
  return raw.startsWith('files/') ? raw : `files/${raw}`;
}

export function normalizeFileName(value) {
  return normalizeFileStoragePath(value).replace(/^files\//, '');
}

export function normalizeImportedStoragePath(value) {
  let raw = String(value || '').trim().replace(/^[/\\]+/, '').replace(/^uploads\//i, '');
  if (raw.startsWith('files/') || raw.startsWith('covers/')) return raw;
  return normalizeFileStoragePath(raw);
}
