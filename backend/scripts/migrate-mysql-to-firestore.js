/**
 * Migra dados do MySQL (VPS) para Firestore + Firebase Storage.
 * Requer: GOOGLE_APPLICATION_CREDENTIALS ou firebase login (Application Default Credentials)
 * Conexão MySQL: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 */
import '../config/env.js';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { Timestamp } from 'firebase-admin/firestore';
import { dbConfig } from '../config/env.js';
import * as db from '../db/firestoreDb.js';
import { COL } from '../db/firestoreDb.js';
import { normalizeFileName, normalizeFileStoragePath } from '../utils/storagePaths.js';

const uploadSource = process.env.UPLOAD_SOURCE_DIR || path.join(process.cwd(), 'uploads');

function toTs(v) {
  if (!v) return null;
  if (v instanceof Date) return Timestamp.fromDate(v);
  return Timestamp.fromDate(new Date(v));
}

async function fetchTable(conn, table) {
  const [rows] = await conn.query(`SELECT * FROM ${table}`);
  return rows;
}

async function uploadLocalFile(relativePath) {
  const full = path.join(uploadSource, relativePath);
  if (!fs.existsSync(full)) return null;
  const buffer = fs.readFileSync(full);
  const mime = relativePath.endsWith('.pdf') ? 'application/pdf'
    : relativePath.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg'
    : relativePath.match(/\.png$/i) ? 'image/png'
    : relativePath.match(/\.webp$/i) ? 'image/webp'
    : 'application/octet-stream';
  return db.storageUpload(buffer, relativePath, mime);
}

async function migrate() {
  const conn = await mysql.createConnection(dbConfig);
  console.log('Conectado ao MySQL:', dbConfig.host);

  const counters = {};

  async function importRows(collection, rows, transform) {
    for (const row of rows) {
      const id = row.id;
      counters[collection] = Math.max(counters[collection] || 0, id);
      const data = transform(row);
      await db.importDoc(collection, id, data);
    }
    console.log(`  ${collection}: ${rows.length} docs`);
  }

  const users = await fetchTable(conn, 'users');
  await importRows(COL.users, users, (r) => ({
    name: r.name,
    email: r.email,
    password_hash: r.password_hash,
    role: r.role,
    is_blocked: r.is_blocked,
    avatar_url: r.avatar_url,
    reset_token: r.reset_token,
    reset_token_expires: toTs(r.reset_token_expires),
    created_at: toTs(r.created_at),
    updated_at: toTs(r.updated_at),
  }));

  const categories = await fetchTable(conn, 'categories');
  await importRows(COL.categories, categories, (r) => ({
    name: r.name,
    slug: r.slug,
    description: r.description,
    parent_id: r.parent_id,
    sort_order: r.sort_order,
    created_at: toTs(r.created_at),
    updated_at: toTs(r.updated_at),
  }));

  const resources = await fetchTable(conn, 'resources');
  for (const r of resources) {
    counters[COL.resources] = Math.max(counters[COL.resources] || 0, r.id);
    let cover = r.cover_image;
    if (cover?.startsWith('/uploads/')) {
      const rel = cover.replace(/^\/uploads\//, '');
      const url = await uploadLocalFile(rel);
      if (url) cover = url;
    }
    await db.importDoc(COL.resources, r.id, {
      title: r.title,
      slug: r.slug,
      description: r.description,
      content_description: r.content_description,
      age_range: r.age_range,
      category_id: r.category_id,
      cover_image: cover,
      display_mode: r.display_mode || 'default',
      download_limit_max: r.download_limit_max,
      download_limit_period: r.download_limit_period,
      page_layout: r.page_layout,
      is_published: r.is_published,
      is_premium: r.is_premium,
      view_count: r.view_count || 0,
      download_count: r.download_count || 0,
      created_by: r.created_by,
      created_at: toTs(r.created_at),
      updated_at: toTs(r.updated_at),
    });
  }
  console.log(`  ${COL.resources}: ${resources.length} docs`);

  const files = await fetchTable(conn, 'resource_files');
  for (const f of files) {
    counters[COL.files] = Math.max(counters[COL.files] || 0, f.id);
    const rel = normalizeFileStoragePath(f.file_name);
    await uploadLocalFile(rel);
    await db.importDoc(COL.files, f.id, {
      resource_id: f.resource_id,
      file_name: normalizeFileName(f.file_name),
      original_name: f.original_name,
      label: f.label,
      sort_order: f.sort_order || 0,
      file_type: f.file_type,
      file_size: f.file_size,
      mime_type: f.mime_type,
      is_primary: f.is_primary,
      is_bundle: f.is_bundle || 0,
      premium_only: f.premium_only || 0,
      created_at: toTs(f.created_at),
    });
  }
  console.log(`  ${COL.files}: ${files.length} docs`);

  const settings = await fetchTable(conn, 'settings');
  for (const s of settings) {
    await db.settingsUpsert(s.setting_key, s.setting_value ?? '');
  }
  console.log(`  ${COL.settings}: ${settings.length} keys`);

  const downloads = await fetchTable(conn, 'downloads');
  await importRows(COL.downloads, downloads, (r) => ({
    resource_id: r.resource_id,
    file_id: r.file_id,
    user_id: r.user_id,
    ip_address: r.ip_address,
    user_agent: r.user_agent,
    created_at: toTs(r.created_at),
  }));

  const favorites = await fetchTable(conn, 'favorites');
  for (const f of favorites) {
    await db.importDoc(COL.favorites, `${f.user_id}_${f.resource_id}`, {
      user_id: f.user_id,
      resource_id: f.resource_id,
      created_at: toTs(f.created_at),
    });
  }
  console.log(`  ${COL.favorites}: ${favorites.length} docs`);

  const plans = await fetchTable(conn, 'plans');
  await importRows(COL.plans, plans, (r) => ({
    name: r.name,
    slug: r.slug,
    description: r.description,
    price: r.price,
    interval_type: r.interval_type,
    is_active: r.is_active,
    created_at: toTs(r.created_at),
  }));

  const subscriptions = await fetchTable(conn, 'subscriptions');
  await importRows(COL.subscriptions, subscriptions, (r) => ({
    user_id: r.user_id,
    plan_id: r.plan_id,
    status: r.status,
    starts_at: toTs(r.starts_at),
    ends_at: toTs(r.ends_at),
    created_at: toTs(r.created_at),
  }));

  try {
    const pageViews = await fetchTable(conn, 'page_views');
    await importRows(COL.pageViews, pageViews, (r) => ({
      path: r.path,
      page_title: r.page_title,
      referrer: r.referrer,
      user_agent: r.user_agent,
      session_id: r.session_id,
      created_at: toTs(r.created_at),
    }));
  } catch {
    console.log('  page_views: tabela não encontrada, ignorando');
  }

  for (const [name, seq] of Object.entries(counters)) {
    await db.setCounter(name, seq);
    console.log(`  counter ${name} = ${seq}`);
  }

  await conn.end();
  console.log('Migração Firestore concluída.');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
