export function mediaUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_MEDIA_ORIGIN || '';
  return `${base}${path}`;
}
