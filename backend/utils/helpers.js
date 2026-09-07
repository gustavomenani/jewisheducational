export function slugify(text) {
  const source = String(text ?? '');
  const slug = source
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    // Keep letters and numbers from Hebrew and other supported scripts. A
    // slug made only from non-Latin text must remain routable instead of
    // becoming an empty string.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  let hash = 0;
  for (const char of source) hash = ((hash * 31) + char.codePointAt(0)) >>> 0;
  return `item-${hash.toString(36) || '0'}`;
}

export async function uniqueSlug(base, checkFn) {
  let slug = slugify(base);
  let candidate = slug;
  let i = 1;
  while (await checkFn(candidate)) {
    candidate = `${slug}-${i++}`;
  }
  return candidate;
}

export function settingsToObject(rows) {
  return rows.reduce((acc, row) => {
    acc[row.setting_key] = row.setting_value ?? '';
    return acc;
  }, {});
}
