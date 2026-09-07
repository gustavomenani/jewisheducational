const ANSWERS_RE = /\b(answer|answers|gabarito|resposta|respostas|key)\b/i;
const PAGE_RE = /\b(page|pagina|página)[\s_-]*\d+\b/i;
const PRESENTATION_TYPES = new Set(['ppt', 'pptx', 'canva']);

import { isMaterialActionEnabled } from './materialActions.js';

export function isPresentationFile(file) {
  if (!file) return false;
  const type = (file.file_type || '').toLowerCase();
  if (PRESENTATION_TYPES.has(type)) return true;
  const mime = (file.mime_type || '').toLowerCase();
  return mime.includes('presentation') || mime.includes('powerpoint');
}

export function isPresentationResource(files = []) {
  const primary = pickWorksheetFile(files);
  return isPresentationFile(primary);
}

function isPdfFile(file) {
  return file?.file_type === 'pdf' || (file?.mime_type || '').toLowerCase().includes('pdf');
}

function isSplitPageFile(file) {
  return PAGE_RE.test(`${file?.label || ''} ${file?.original_name || ''}`);
}

function isPrimaryFile(file) {
  return file?.is_primary || Number(file?.is_primary) === 1;
}

function inferBundleFile(files = []) {
  const ordered = sortResourceFiles(files);
  const explicit = ordered.find((file) => !!(file?.is_bundle || Number(file?.is_bundle) === 1));
  if (explicit) return explicit;

  // Older split materials were saved before the bundle flag existed. If at
  // least two files are clearly named as pages, their original PDF is the
  // complete Premium package even when its persisted flags are still zero.
  const pageFiles = ordered.filter(isSplitPageFile);
  if (pageFiles.length < 2) return null;
  return ordered.find((file) => isPdfFile(file) && !isSplitPageFile(file) && !isAnswersFile(file) && isPrimaryFile(file))
    || ordered.find((file) => isPdfFile(file) && !isSplitPageFile(file) && !isAnswersFile(file))
    || null;
}

export function isBundleFile(file, files = []) {
  if (file?.is_bundle || Number(file?.is_bundle) === 1) return true;
  const inferred = files.length ? inferBundleFile(files) : null;
  return !!(inferred && String(inferred.id) === String(file?.id));
}

export function sortResourceFiles(files = []) {
  return [...files].sort((a, b) => {
    const orderA = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 0;
    const orderB = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 0;
    const primaryA = a?.is_primary || Number(a?.is_primary) === 1 ? 1 : 0;
    const primaryB = b?.is_primary || Number(b?.is_primary) === 1 ? 1 : 0;
    const idA = Number.isFinite(Number(a?.id)) ? Number(a.id) : 0;
    const idB = Number.isFinite(Number(b?.id)) ? Number(b.id) : 0;
    return orderA - orderB || primaryB - primaryA || idA - idB;
  });
}

export function pickBundleFile(files = []) {
  return inferBundleFile(files);
}

export function isAnswersFile(file) {
  if (!file) return false;
  const label = `${file.label || ''} ${file.original_name || ''}`;
  return ANSWERS_RE.test(label);
}

export function pickWorksheetFile(files = []) {
  const nonBundle = sortResourceFiles(files).filter((f) => !isBundleFile(f, files));
  const nonAnswers = nonBundle.filter((f) => !isAnswersFile(f));
  if (!nonAnswers.length) return null;
  return nonAnswers.find(isPrimaryFile) || nonAnswers[0];
}

export function pickAnswersFile(files = []) {
  const nonBundle = sortResourceFiles(files).filter((f) => !isBundleFile(f, files));
  return nonBundle.find(isAnswersFile) || null;
}

export function extraWorksheetFiles(files = []) {
  const primary = pickWorksheetFile(files);
  if (!primary) return [];
  return sortResourceFiles(files).filter(
    (f) => !isBundleFile(f, files) && !isAnswersFile(f) && String(f.id) !== String(primary.id)
  );
}

export function classroomShareUrl(slug, title, settings = {}) {
  if (!isClassroomEnabled(settings)) return null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = `${origin}/resource/${slug}`;
  const shareTitle = title || 'Worksheet';
  const template = settings.classroom_share_url?.trim();
  if (template) {
    return template
      .replace(/\{url\}/g, encodeURIComponent(pageUrl))
      .replace(/\{title\}/g, encodeURIComponent(shareTitle));
  }
  const params = new URLSearchParams({ url: pageUrl, title: shareTitle });
  return `https://classroom.google.com/share?${params}`;
}

export function isClassroomEnabled(settings = {}) {
  return isMaterialActionEnabled(settings, 'classroom');
}
