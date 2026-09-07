import test from 'node:test';
import assert from 'node:assert/strict';
import * as memoryDb from './memoryDb.js';

test('contact messages can be listed, read, and deleted', async () => {
  const staleRows = await memoryDb.contactMessageList();
  for (const stale of staleRows) {
    if (stale.email === 'client@example.com' && stale.message === 'A sufficiently long message.') {
      await memoryDb.contactMessageDelete(stale.id);
    }
  }

  const created = await memoryDb.contactMessageCreate({
    name: 'Client',
    email: 'client@example.com',
    message: 'A sufficiently long message.',
    notification_status: 'not_configured',
  });

  try {
    let rows = await memoryDb.contactMessageList();
    assert.equal(rows[0].id, created.insertId);
    assert.equal(rows[0].status, 'unread');

    await memoryDb.contactMessageUpdate(created.insertId, { status: 'read' });
    rows = await memoryDb.contactMessageList();
    assert.equal(rows.find((row) => row.id === created.insertId)?.status, 'read');
  } finally {
    if (created?.insertId) {
      await memoryDb.contactMessageDelete(created.insertId);
    }
  }

  const rows = await memoryDb.contactMessageList();
  assert.equal(rows.some((row) => row.id === created.insertId), false);
});
