const PAGE_RE = /\b(page|pagina|página)[\s_-]*\d+\b/i;
const ANSWERS_RE = /\b(answer|answers|gabarito|resposta|respostas|key)\b/i;

function isFlagged(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isPdfFile(file) {
  return file?.file_type === 'pdf' || String(file?.mime_type || '').toLowerCase().includes('pdf');
}

function isSplitPageFile(file) {
  return PAGE_RE.test(`${file?.label || ''} ${file?.original_name || ''}`);
}

function isAnswerFile(file) {
  return ANSWERS_RE.test(`${file?.label || ''} ${file?.original_name || ''}`);
}

function isPrimaryFile(file) {
  return isFlagged(file?.is_primary);
}

function orderFiles(files = []) {
  return [...files].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 0;
    const orderB = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 0;
    const primaryA = isPrimaryFile(a) ? 1 : 0;
    const primaryB = isPrimaryFile(b) ? 1 : 0;
    return orderA - orderB || primaryB - primaryA || (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
}

export function findBundleFile(files = []) {
  const ordered = orderFiles(files);
  const explicit = ordered.find((file) => isFlagged(file?.is_bundle));
  if (explicit) return explicit;

  // Backward compatibility for materials split before the bundle flag was
  // persisted: a PDF with at least two page-labelled siblings is the full
  // Premium source file.
  if (ordered.filter(isSplitPageFile).length < 2) return null;
  return ordered.find((file) => isPdfFile(file) && !isSplitPageFile(file) && !isAnswerFile(file) && isPrimaryFile(file))
    || ordered.find((file) => isPdfFile(file) && !isSplitPageFile(file) && !isAnswerFile(file))
    || null;
}

export function normalizeBundleFiles(files = []) {
  const bundle = findBundleFile(files);
  if (!bundle) return files;
  return files.map((file) => String(file.id) === String(bundle.id)
    ? { ...file, is_bundle: 1, premium_only: 1 }
    : file);
}

export function isBundleFile(file, files = []) {
  const bundle = findBundleFile(files);
  return !!(bundle && String(bundle.id) === String(file?.id));
}
