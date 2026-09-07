import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sortResourceFiles,
  pickBundleFile,
  pickWorksheetFile,
  extraWorksheetFiles,
} from './utils/resourceFiles.js';

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('resource files keep a deterministic page order', () => {
  const files = [
    { id: 9, sort_order: '2' },
    { id: 3, sort_order: '0', is_primary: 1 },
    { id: 5, sort_order: 1 },
  ];
  assert.deepEqual(sortResourceFiles(files).map((file) => file.id), [3, 5, 9]);
});

test('legacy split materials keep the original PDF as the Premium bundle', () => {
  const files = [
    { id: 135, label: 'OUTLINE (11)', original_name: 'OUTLINE (11).pdf', sort_order: 0, is_primary: 1, file_type: 'pdf' },
    { id: 136, label: 'Alef', original_name: 'OUTLINE (11) — Page 1.pdf', sort_order: 1, file_type: 'pdf' },
    { id: 137, label: 'Page 2', original_name: 'OUTLINE (11) — Page 2.pdf', sort_order: 2, file_type: 'pdf' },
  ];
  assert.equal(pickBundleFile(files)?.id, 135);
  assert.equal(pickWorksheetFile(files)?.id, 136);
  assert.deepEqual(extraWorksheetFiles(files).map((file) => file.id), [137]);
});

test('PDF preview opens the full protected file and exposes separate actions', () => {
  const modal = source('./components/K5PreviewModal.vue');
  const download = source('./views/DownloadView.vue');
  assert.ok(modal.includes("/downloads/view/${resourceId}/${fileId}"));
  assert.ok(modal.includes('responseType: \'blob\''));
  assert.ok(modal.includes("if (isPdfWorksheet.value) return 'pdf'"));
  assert.ok(modal.includes("emit('download', props.worksheetFile)"));
  assert.ok(!modal.includes('Open in new tab'));
  assert.ok(modal.includes('Full PDF preview'));
  assert.ok(download.includes('v-if="isPdf && previewBlobUrl"'));
  assert.ok(download.includes('title="Full PDF preview"'));
});

test('resource file cards provide explicit Preview and Download actions', () => {
  const resource = source('./views/ResourceView.vue');
  assert.ok(resource.includes('openPreviewModal(true, bundleFile.value || previewWorksheetFile.value)'));
  assert.ok(resource.includes('openPreviewModal(true, file)'));
  assert.ok(resource.includes('class="k5-file-action k5-file-action-preview"'));
  assert.match(resource, /class="k5-file-action"[\s\S]*?Download/);
  assert.ok(resource.includes(':worksheet-file="previewFile || previewWorksheetFile"'));
  assert.ok(resource.includes(':title="isPresentation ? \'Watch\' : \'Preview full PDF\'"'));
  assert.ok(resource.includes('@download="onPreviewDownload"'));
  assert.ok(resource.includes('function openDownloadPage(file)'));
  assert.ok(resource.includes('@download="openDownloadPage"'));
  assert.equal(resource.includes('function directDownload'), false);
});

test('complete PDF keeps a same-site premium preview action', () => {
  const actions = source('./components/K5WorksheetActions.vue');
  assert.ok(actions.includes('showBundlePreviewModal'));
  assert.ok(actions.includes(':worksheet-file="bundleFile"'));
  assert.ok(actions.includes('Preview full PDF (Premium)'));
});

test('per-material action visibility falls back to global settings', () => {
  const actions = source('./components/K5WorksheetActions.vue');
  assert.ok(actions.includes('actionVisibility: { type: Object'));
  assert.ok(actions.includes('actionId === \'worksheet\' ? overrides.download'));
  assert.ok(actions.includes("isMaterialActionEnabled(settingsStore.settings, actionId)"));
  assert.ok(actions.includes("actionEnabled('answers') && !!answersFile.value"));
  assert.ok(actions.includes("actionEnabled('classroom') && !!classroomUrl.value"));
  assert.ok(actions.includes("actionEnabled('pinterest') && !!pinterestUrl.value"));
  assert.ok(!actions.includes('const showAnswers = computed(() => false)'));
  assert.ok(!actions.includes('const showClassroom = computed(() => false)'));
  assert.ok(actions.includes('@download="onModalDownload"'));
});

test('file actions are not rendered when a material has no downloadable file', () => {
  const actions = source('./components/K5WorksheetActions.vue');
  assert.match(actions, /const showWorksheet = computed\(\(\) => \([\s\S]*worksheetFile\.value \|\| bundleFile\.value/);
  assert.ok(actions.includes(':disabled="!worksheetFile && !bundleFile"'));
});

test('resource action overrides accept JSON returned by the database', () => {
  const resource = source('./views/ResourceView.vue');
  assert.ok(resource.includes('JSON.parse(raw)'));
  assert.ok(resource.includes('typeof raw === \'object\''));
});
