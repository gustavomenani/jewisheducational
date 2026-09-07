import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-reliability-db-'));
process.env.JER_MEMORY_DATA_FILE = path.join(tempRoot, 'db.json');
process.env.UPLOAD_DIR = path.join(tempRoot, 'uploads');

const db = await import('./memoryDb.js?reliability-contracts');

after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('memory auth, admin, subscription, and analytics contracts match primary shapes', async () => {
  const user = await db.userCreate({
    name: 'Reliability User',
    email: '  Reliability@Example.com ',
    password_hash: 'hash',
    is_blocked: 'false',
    signup_source: 'Instagram',
  });

  assert.equal(user.insertId, user.id);
  assert.equal(user.email, 'reliability@example.com');
  assert.equal(user.is_blocked, 0);
  assert.equal((await db.userFindByEmail('RELIABILITY@EXAMPLE.COM')).id, user.id);

  const users = await db.userList();
  assert.ok(Array.isArray(users));
  assert.equal(users.users, users);
  assert.equal(users.total, users.length);
  assert.deepEqual(await db.userCount(), { total: users.length });

  const resources = await db.resourceAdminList();
  assert.ok(Array.isArray(resources));
  assert.equal(resources.resources, resources);
  assert.equal(resources.total, resources.length);

  const planResult = await db.planCreatePremium();
  const plan = await db.planFindPremium();
  assert.equal(planResult.insertId, plan.id);
  await db.subscriptionActivate(user.id, plan.id, 1, 'school');
  const active = await db.subscriptionGetStatus(user.id);
  assert.equal(active.active, true);
  assert.equal(active.planName, plan.name);
  assert.equal(await db.subscriptionActiveTier(user.id), 'school');
  await db.subscriptionCancelActive(user.id);
  assert.deepEqual(await db.subscriptionGetStatus(user.id), { active: false });

  await db.pageViewCreate({
    path: '/reliability',
    page_title: 'Reliability',
    session_id: 'reliability-session',
    referrer: 'https://google.com/search?q=resources',
    traffic_source: 'Google',
  });
  const stats = await db.pageViewStats();
  for (const key of ['today', 'week', 'month', 'total', 'topPages', 'recentVisits', 'dailyChart', 'topTrafficSources']) {
    assert.ok(Object.hasOwn(stats, key), `missing analytics field ${key}`);
  }
  assert.ok(stats.topTrafficSources.some((row) => row.source === 'Google'));

  const signupSources = await db.userSignupSourceStats();
  assert.ok(signupSources.some((row) => row.source === 'Instagram'));
});

test('memory adapter returns consistent duplicate and hierarchy errors', async () => {
  await assert.rejects(
    db.userCreate({ name: 'Duplicate', email: 'RELIABILITY@example.com', password_hash: 'hash' }),
    (error) => error.code === 'ER_DUP_ENTRY'
  );

  const parent = await db.categoryCreate({ name: 'Reliability Parent', slug: 'reliability-parent' });
  const child = await db.categoryCreate({ name: 'Reliability Child', slug: 'reliability-child', parent_id: parent.id });
  await assert.rejects(
    db.categoryUpdate(parent.id, { parent_id: child.id }),
    (error) => error.status === 400 && /cycle|subtopic/i.test(error.message)
  );
  await assert.rejects(
    db.categoryUpdate(parent.id, { parent_id: parent.id }),
    (error) => error.status === 400
  );
});

test('memory Stripe event claim is idempotent and releases failed work', async () => {
  assert.equal(await db.stripeWebhookEventClaim('evt-reliability-complete'), true);
  assert.equal(await db.stripeWebhookEventClaim('evt-reliability-complete'), false);
  assert.equal(await db.stripeWebhookEventComplete('evt-reliability-complete'), true);
  assert.equal(await db.stripeWebhookEventClaim('evt-reliability-complete'), false);

  assert.equal(await db.stripeWebhookEventClaim('evt-reliability-failed'), true);
  assert.equal(await db.stripeWebhookEventRelease('evt-reliability-failed'), true);
  assert.equal(await db.stripeWebhookEventClaim('evt-reliability-failed'), true);
});
