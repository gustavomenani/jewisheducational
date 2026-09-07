const PRESENTATION_TYPES = new Set(['ppt', 'pptx', 'canva']);

export function isPresentationFile(file) {
  if (!file) return false;
  const type = (file.file_type || '').toLowerCase();
  if (PRESENTATION_TYPES.has(type)) return true;
  const mime = (file.mime_type || '').toLowerCase();
  return mime.includes('presentation') || mime.includes('powerpoint');
}
