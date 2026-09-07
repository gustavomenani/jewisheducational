import test from 'node:test';
import assert from 'node:assert/strict';
import { findBundleFile, normalizeBundleFiles } from './resourceFiles.js';

test('legacy split files infer the original PDF as the Premium bundle', () => {
  const files = [
    { id: 135, original_name: 'OUTLINE (11).pdf', file_type: 'pdf', sort_order: 0, is_primary: 1 },
    { id: 136, original_name: 'OUTLINE (11) — Page 1.pdf', file_type: 'pdf', sort_order: 1 },
    { id: 137, original_name: 'OUTLINE (11) — Page 2.pdf', file_type: 'pdf', sort_order: 2 },
  ];

  assert.equal(findBundleFile(files)?.id, 135);
  assert.equal(normalizeBundleFiles(files).find((file) => file.id === 135)?.premium_only, 1);
});

test('explicit bundle flags take precedence over filename inference', () => {
  const files = [
    { id: 10, original_name: 'source.pdf', file_type: 'pdf', sort_order: 0, is_primary: 1 },
    { id: 11, original_name: 'source — Page 1.pdf', file_type: 'pdf', sort_order: 1 },
    { id: 12, original_name: 'source — Page 2.pdf', file_type: 'pdf', sort_order: 2 },
    { id: 13, original_name: 'complete.pdf', file_type: 'pdf', sort_order: 3, is_bundle: 1 },
  ];

  assert.equal(findBundleFile(files)?.id, 13);
});
