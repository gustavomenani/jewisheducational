/**
 * Exporta dados MySQL para JSON (rodar no VPS).
 * Uso: node scripts/export-mysql-json.js > /tmp/jer-data.json
 */
import '../config/env.js';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env.js';

const uploadDir = process.env.UPLOAD_DIR || 'uploads';

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  const tables = [
    'users', 'categories', 'resources', 'resource_files', 'settings',
    'downloads', 'download_intents', 'download_quota_locks',
    'favorites', 'favorite_folders', 'plans', 'subscriptions', 'page_views',
    'analytics_interactions', 'editor_upload_sessions', 'stripe_webhook_events',
    // These tables are currently reserved for future features. Export them
    // anyway so a datastore migration never silently drops valid records.
    'comments', 'tags', 'resource_tags', 'payments', 'contact_messages',
  ];
  const data = { tables: {}, files: [] };

  for (const table of tables) {
    try {
      const [rows] = await conn.query(`SELECT * FROM ${table}`);
      data.tables[table] = rows;
    } catch {
      data.tables[table] = [];
    }
  }

  function walk(dir, base = '') {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name).replace(/\\/g, '/');
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else {
        data.files.push({
          path: rel,
          base64: fs.readFileSync(full).toString('base64'),
        });
      }
    }
  }
  walk(path.join(uploadDir, 'files'), 'files');
  walk(path.join(uploadDir, 'covers'), 'covers');

  await conn.end();
  process.stdout.write(JSON.stringify(data));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
