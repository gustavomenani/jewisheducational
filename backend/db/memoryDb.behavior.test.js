import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-memory-behavior-'));
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');

const db = await import('./memoryDb.js?behavior=quota-and-rollback');

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('memory adapter returns incremental IDs and rolls back copied assets', async () => {
  const resource = await db.resourceCreate({ title: 'Behavior resource', slug: 'behavior-resource' });
  const first = await db.fileCreate(String(resource.id), { file_name: 'one.pdf', original_name: 'One.pdf' });
  const second = await db.fileCreate(resource.id, { file_name: 'two.pdf', original_name: 'Two.pdf' });
  assert.equal(resource.insertId, resource.id);
  assert.equal(first.insertId, first.id);
  assert.notEqual(first.id, second.id);
  assert.equal((await db.filesByResource(String(resource.id))).length, 2);

  await db.storageUpload(Buffer.from('one'), 'files/one.pdf', 'application/pdf');
  await db.storageUpload(Buffer.from('two'), 'files/two.pdf', 'application/pdf');
  const copied = [];
  try {
    for (const [source, destination] of [['files/one.pdf', 'files/copy-one.pdf'], ['files/missing.pdf', 'files/copy-two.pdf']]) {
      const stat = await db.storageStat(source);
      if (!stat) throw new Error('source missing');
      copied.push(destination);
      await db.storageCopy(source, destination, 'application/pdf', { public: false });
    }
  } catch {
    await Promise.all(copied.map((destination) => db.storageDelete(destination)));
  }
  assert.equal(await db.storageStat('files/copy-one.pdf'), null);
  assert.equal(await db.storageStat('files/copy-two.pdf'), null);
});

test('memory snapshots keep published resources addressable by slug', async () => {
  const resource = await db.resourceFindBySlug('alfabeto-hebraico-aleph-bet');
  assert.ok(resource);
  assert.equal(resource.is_published, 1);
  assert.equal(resource.is_archived, 0);
});

test('memory resources retain the original Google Slides source', async () => {
  const resource = await db.resourceCreate({
    title: 'Google Slides source',
    slug: 'google-slides-source',
    google_slides_url: 'https://docs.google.com/presentation/d/abc_123/edit',
  });

  assert.equal(
    (await db.resourceFindById(resource.id)).google_slides_url,
    'https://docs.google.com/presentation/d/abc_123/edit',
  );
});

test('memory resources retain the canonical Canva presentation source', async () => {
  const resource = await db.resourceCreate({
    title: 'Canva source',
    slug: 'canva-source',
    canva_url: 'https://www.canva.com/design/DAGabc_123/view',
  });

  assert.equal(
    (await db.resourceFindById(resource.id)).canva_url,
    'https://www.canva.com/design/DAGabc_123/view',
  );
});

test('memory quota reservations are idempotent and count active concurrent requests', async () => {
  const first = await db.downloadReserve({
    request_id: 'request-one', resource_id: 1, file_id: 1, user_id: 7,
    max: 1, period: 'day', mode: 'global',
  });
  assert.equal(first.created, true);
  await assert.rejects(
    db.downloadReserve({
      request_id: 'request-two', resource_id: 1, file_id: 1, user_id: 7,
      max: 1, period: 'day', mode: 'global',
    }),
    (error) => error.code === 'DOWNLOAD_LIMIT' && error.status === 429
  );
  assert.equal((await db.downloadReserve({
    request_id: 'request-one', resource_id: 1, file_id: 1, user_id: 7,
    max: 1, period: 'day', mode: 'global',
  })).alreadyReserved, true);
  assert.equal(await db.downloadFinalize('request-one'), true);
  assert.equal((await db.downloadReserve({
    request_id: 'request-one', resource_id: 1, file_id: 1, user_id: 7,
    max: 1, period: 'day', mode: 'global',
  })).alreadyCompleted, true);
  assert.equal(await db.downloadCountByUser(7, { period: 'day', mode: 'global' }), 1);
});

test('memory completion atomically updates the reservation and resource counter', async () => {
  const resource = await db.resourceCreate({ title: 'Completion resource', slug: 'completion-resource' });
  const reservation = await db.downloadReserve({
    request_id: 'request-complete', resource_id: resource.id, file_id: 1, user_id: 8,
    max: 2, period: 'day', mode: 'global',
  });
  assert.equal(reservation.created, true);
  assert.equal(await db.downloadComplete('request-complete', resource.id), true);
  assert.equal(await db.downloadComplete('request-complete', resource.id), false);
  assert.equal((await db.resourceFindById(resource.id)).download_count, 1);
});

test('memory resource filters keep file type and material type contracts separate', async () => {
  const pdfResource = await db.resourceCreate({
    title: 'Filtered PDF',
    slug: 'filtered-pdf',
    material_type: 'Worksheet',
    is_published: 1,
    is_archived: 0,
  });
  const slideResource = await db.resourceCreate({
    title: 'Filtered Slides',
    slug: 'filtered-slides',
    material_type: 'Presentation',
    is_published: 1,
    is_archived: 0,
  });
  await db.fileCreate(pdfResource.id, { file_type: 'pdf', is_archived: 0 });
  await db.fileCreate(slideResource.id, { file_type: 'pptx', is_archived: 0 });

  const pdfs = await db.resourceListFiltered({ params: { type: 'pdf' }, limit: 100, offset: 0 });
  assert.ok(pdfs.resources.some((row) => row.slug === pdfResource.slug));
  assert.equal(pdfs.resources.some((row) => row.slug === slideResource.slug), false);
  const worksheets = await db.resourceListFiltered({ params: { materialType: 'Worksheet' }, limit: 100, offset: 0 });
  assert.ok(worksheets.resources.some((row) => row.slug === pdfResource.slug));
  assert.equal(worksheets.resources.some((row) => row.slug === slideResource.slug), false);
});

test('memory interaction events are idempotent by event key', async () => {
  const first = await db.interactionEventCreate({ event_name: 'resource_page_click', event_key: 'memory-event-key' });
  const second = await db.interactionEventCreate({ event_name: 'resource_page_click', event_key: 'memory-event-key' });
  assert.equal(second.id, first.id);
  const stats = await db.interactionEventStats();
  assert.equal(stats.recent.filter((row) => row.event_key === 'memory-event-key').length, 1);
});
