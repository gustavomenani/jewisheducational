/**
 * Remove usuários de teste do Firestore, mantendo contas admin.
 * Uso:
 *   node scripts/purge-test-users.js           # dry-run (só lista)
 *   node scripts/purge-test-users.js --confirm # apaga de verdade
 */
import '../config/env.js';
import { firestore } from '../config/firebaseAdmin.js';
import { COL } from '../db/firestoreDb.js';

const confirm = process.argv.includes('--confirm');

const USER_COLLECTIONS = [
  { name: 'favorites', field: 'user_id' },
  { name: 'downloads', field: 'user_id' },
  { name: 'download_intents', field: 'user_id' },
  { name: 'subscriptions', field: 'user_id' },
  { name: 'page_views', field: 'user_id' },
];

async function deleteByQuery(collectionName, field, userId) {
  const snap = await firestore.collection(collectionName).where(field, '==', Number(userId)).get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (confirm) await batch.commit();
  return snap.size;
}

async function deleteFavoriteDocs(userId) {
  const snap = await firestore.collection(COL.favorites).where('user_id', '==', Number(userId)).get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  if (confirm) await batch.commit();
  return snap.size;
}

async function main() {
  const usersSnap = await firestore.collection(COL.users).get();
  const admins = [];
  const toDelete = [];

  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const user = { id: doc.id, ...data };
    if (data.role === 'admin') admins.push(user);
    else toDelete.push(user);
  });

  console.log(`\n=== Purge test users (${confirm ? 'CONFIRM' : 'DRY-RUN'}) ===`);
  console.log(`Admins mantidos (${admins.length}):`);
  admins.forEach((u) => console.log(`  ✓ [${u.id}] ${u.name} <${u.email}>`));

  if (!toDelete.length) {
    console.log('\nNenhum usuário de teste para remover.');
    return;
  }

  console.log(`\nUsuários a remover (${toDelete.length}):`);
  const stats = { users: 0, favorites: 0, downloads: 0, download_intents: 0, subscriptions: 0, page_views: 0 };

  for (const user of toDelete) {
    console.log(`  ✗ [${user.id}] ${user.name || '—'} <${user.email}>`);
    stats.users += 1;

    stats.favorites += await deleteFavoriteDocs(user.id);
    for (const col of USER_COLLECTIONS) {
      if (col.name === 'favorites') continue;
      const n = await deleteByQuery(col.name, col.field, user.id);
      stats[col.name] = (stats[col.name] || 0) + n;
    }

    if (confirm) {
      await firestore.collection(COL.users).doc(String(user.id)).delete();
    }
  }

  console.log('\nResumo:');
  console.log(`  users:            ${stats.users}`);
  console.log(`  favorites:        ${stats.favorites}`);
  console.log(`  downloads:        ${stats.downloads}`);
  console.log(`  download_intents: ${stats.download_intents}`);
  console.log(`  subscriptions:    ${stats.subscriptions}`);
  console.log(`  page_views:       ${stats.page_views}`);

  if (!confirm) {
    console.log('\nDry-run apenas. Para apagar, rode: node scripts/purge-test-users.js --confirm');
  } else {
    console.log('\nConcluído. Contas admin preservadas.');
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
