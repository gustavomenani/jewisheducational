import '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env.js';
import { ALEPH_BET_LETTERS, ALEPH_BET_RESOURCE } from './aleph-bet-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const coversDir = path.join(uploadDir, 'covers');
const filesDir = path.join(uploadDir, 'files');
const pdfScript = path.join(__dirname, 'generate-letter-pdf.py');
const regenerate = process.argv.includes('--regenerate');

function ensureDirs() {
  for (const dir of [coversDir, filesDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function generateLetterPdf(letter, pdfPath) {
  const payloadPath = path.join(filesDir, `.tmp-${letter.slug}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify({
    hebrew: letter.hebrew,
    latin: letter.latin,
    output: pdfPath,
  }), 'utf8');
  execSync(`python "${pdfScript}" "${payloadPath}"`, { stdio: 'inherit' });
  fs.unlinkSync(payloadPath);
}

async function ensureCategory(conn, { name, slug, description, parentId, sortOrder }) {
  const [existing] = await conn.execute('SELECT id FROM categories WHERE slug = ? LIMIT 1', [slug]);
  if (existing.length) {
    await conn.execute(
      'UPDATE categories SET name = ?, description = ?, parent_id = ?, sort_order = ? WHERE id = ?',
      [name, description, parentId, sortOrder, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await conn.execute(
    'INSERT INTO categories (name, slug, description, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
    [name, slug, description, parentId, sortOrder]
  );
  return result.insertId;
}

async function seed() {
  ensureDirs();
  try {
    execSync('python -c "import fpdf"', { stdio: 'pipe' });
  } catch {
    execSync('pip install fpdf2 -q', { stdio: 'inherit' });
  }

  const conn = await mysql.createConnection(dbConfig);
  const [[admin]] = await conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (!admin) throw new Error('Admin não encontrado.');

  const [[parentCat]] = await conn.execute(
    'SELECT id FROM categories WHERE slug = ? LIMIT 1',
    [ALEPH_BET_RESOURCE.categoryParentSlug]
  );
  if (!parentCat) throw new Error('Categoria pai "atividades" não encontrada. Rode seed-activities primeiro.');

  const categoryId = await ensureCategory(conn, {
    name: ALEPH_BET_RESOURCE.categoryName,
    slug: ALEPH_BET_RESOURCE.categorySlug,
    description: 'Hebrew alphabet — one sheet per letter',
    parentId: parentCat.id,
    sortOrder: 1,
  });

  const [existingResource] = await conn.execute(
    'SELECT id FROM resources WHERE slug = ? LIMIT 1',
    [ALEPH_BET_RESOURCE.slug]
  );
  if (existingResource.length && !regenerate) {
    console.log('Aleph-Bet já existe (use --regenerate para atualizar).');
    await conn.end();
    return;
  }

  let resourceId;
  const coverFilename = 'aleph-bet-cover.png';
  const coverDisk = path.join(coversDir, coverFilename);
  const mascotPath = path.join(__dirname, '../../frontend/public/images/community/mascot-educator.png');
  if (fs.existsSync(mascotPath)) {
    fs.copyFileSync(mascotPath, coverDisk);
  }

  if (existingResource.length) {
    resourceId = existingResource[0].id;
    await conn.execute(
      `UPDATE resources SET title = ?, description = ?, content_description = ?, age_range = ?,
       category_id = ?, cover_image = ?, display_mode = ?, is_published = 1 WHERE id = ?`,
      [
        ALEPH_BET_RESOURCE.title,
        ALEPH_BET_RESOURCE.description,
        ALEPH_BET_RESOURCE.contentDescription,
        ALEPH_BET_RESOURCE.ageRange,
        categoryId,
        fs.existsSync(coverDisk) ? `/uploads/covers/${coverFilename}` : null,
        ALEPH_BET_RESOURCE.displayMode,
        resourceId,
      ]
    );
    await conn.execute('DELETE FROM resource_files WHERE resource_id = ?', [resourceId]);
  } else {
    const [result] = await conn.execute(
      `INSERT INTO resources (title, slug, description, content_description, age_range, category_id,
       cover_image, display_mode, is_published, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        ALEPH_BET_RESOURCE.title,
        ALEPH_BET_RESOURCE.slug,
        ALEPH_BET_RESOURCE.description,
        ALEPH_BET_RESOURCE.contentDescription,
        ALEPH_BET_RESOURCE.ageRange,
        categoryId,
        fs.existsSync(coverDisk) ? `/uploads/covers/${coverFilename}` : null,
        ALEPH_BET_RESOURCE.displayMode,
        admin.id,
      ]
    );
    resourceId = result.insertId;
  }

  let order = 0;
  for (const letter of ALEPH_BET_LETTERS) {
    const pdfFilename = `aleph-bet-${letter.slug}.pdf`;
    const pdfDisk = path.join(filesDir, pdfFilename);
    generateLetterPdf(letter, pdfDisk);
    const stat = fs.statSync(pdfDisk);
    await conn.execute(
      `INSERT INTO resource_files (resource_id, file_name, original_name, label, sort_order, file_type, file_size, mime_type, is_primary)
       VALUES (?, ?, ?, ?, ?, 'pdf', ?, 'application/pdf', ?)`,
      [
        resourceId,
        pdfFilename,
        `${letter.latin}.pdf`,
        letter.hebrew,
        order,
        stat.size,
        order === 0 ? 1 : 0,
      ]
    );
    order += 1;
    console.log('Letra:', letter.hebrew, letter.latin);
  }

  await conn.end();
  console.log(`\nAleph-Bet pronto: ${ALEPH_BET_LETTERS.length} folhas em /material/${ALEPH_BET_RESOURCE.slug}`);
}

seed().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
