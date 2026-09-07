import '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env.js';
import { ACTIVITIES } from './activities-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');
const publicPotential = path.join(rootDir, 'frontend/public/images/potential');
const assetsDir = path.join(rootDir, 'assets');
const cursorAssets = path.join(process.env.USERPROFILE || '', '.cursor/projects/g-jewisheducationalresources/assets');
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const coversDir = path.join(uploadDir, 'covers');
const filesDir = path.join(uploadDir, 'files');
const useGemini = process.argv.includes('--gemini') || Boolean(process.env.GEMINI_API_KEY);
const pdfScript = path.join(
  __dirname,
  useGemini ? 'generate-activity-gemini.py' : 'generate-activity-pdf.py'
);
const regenerate = process.argv.includes('--regenerate');
const forceGemini = process.argv.includes('--force-gemini');
const onlySlug = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

function ensureDirs() {
  for (const dir of [publicPotential, coversDir, filesDir]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveImage(name) {
  for (const p of [
    path.join(publicPotential, name),
    path.join(assetsDir, name),
    path.join(cursorAssets, name),
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function safePdfName(title) {
  return `${title}.pdf`;
}

function buildContentDescription(item) {
  if (item.contentDescription) return item.contentDescription;
  const c = item.pdfContent;
  if (!c) return item.description;
  const lines = [];
  if (c.story) lines.push(c.story);
  if (c.objectives?.length) {
    lines.push('\n\nO que você encontrará neste arquivo:\n' + c.objectives.map((o) => `• ${o}`).join('\n'));
  }
  if (c.exercises?.length) {
    lines.push('\n\nAtividades incluídas:\n' + c.exercises.map((e, i) => `${i + 1}. ${e.prompt}`).join('\n'));
  }
  if (c.questions?.length) {
    lines.push('\n\nPerguntas para discussão em sala ou em família.');
  }
  return lines.join('');
}

function generateRichPdf(item, imagePath, pdfPath) {
  const payloadPath = path.join(filesDir, `.tmp-${item.slug}.json`);
  const payload = {
    slug: item.slug,
    data: item.pdfContent,
    image: imagePath,
    output: pdfPath,
  };

  if (!useGemini) {
    const landscape = resolveImage('landscape-scene.png');
    const mascotPath = path.join(rootDir, 'frontend/public/images/community/mascot-educator.png');
    const gallery = [imagePath, landscape].filter(Boolean);
    payload.data = { ...item.pdfContent, gallery };
    payload.extraImages = {
      landscape: landscape || null,
      mascot: fs.existsSync(mascotPath) ? mascotPath : null,
    };
  }

  fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf8');
  const forceFlag = useGemini && forceGemini ? ' --force' : '';
  execSync(`python "${pdfScript}" "${payloadPath}"${forceFlag}`, { stdio: 'inherit' });
  fs.unlinkSync(payloadPath);
}

async function upsertActivity(conn, item, adminId, categoryBySlug) {
  const srcImage = resolveImage(item.image);
  if (!srcImage) {
    console.warn('Imagem não encontrada:', item.image);
    return false;
  }

  const publicImagePath = path.join(publicPotential, item.image);
  if (path.resolve(srcImage) !== path.resolve(publicImagePath)) {
    fs.copyFileSync(srcImage, publicImagePath);
  }

  const coverFilename = `${item.slug}-cover.png`;
  const pdfFilename = `${item.slug}.pdf`;
  const coverDisk = path.join(coversDir, coverFilename);
  const pdfDisk = path.join(filesDir, pdfFilename);

  fs.copyFileSync(publicImagePath, coverDisk);
  generateRichPdf(item, publicImagePath, pdfDisk);

  const stat = fs.statSync(pdfDisk);
  const coverUrl = `/uploads/covers/${coverFilename}`;
  const originalName = safePdfName(item.title);
  const categoryId = categoryBySlug[item.categorySlug] || categoryBySlug.atividades || null;
  const contentDescription = buildContentDescription(item);
  const ageRange = item.pdfContent?.ageRange || null;

  const [existing] = await conn.execute('SELECT id FROM resources WHERE slug = ? LIMIT 1', [item.slug]);

  if (existing.length) {
    const resourceId = existing[0].id;
    await conn.execute(
      `UPDATE resources SET title = ?, description = ?, content_description = ?, age_range = ?, category_id = ?, cover_image = ? WHERE id = ?`,
      [item.title, item.description, contentDescription, ageRange, categoryId, coverUrl, resourceId]
    );
    const [files] = await conn.execute(
      'SELECT id FROM resource_files WHERE resource_id = ? AND file_type = ? LIMIT 1',
      [resourceId, 'pdf']
    );
    if (files.length) {
      await conn.execute(
        `UPDATE resource_files SET file_name = ?, original_name = ?, file_size = ? WHERE id = ?`,
        [pdfFilename, originalName, stat.size, files[0].id]
      );
    } else {
      await conn.execute(
        `INSERT INTO resource_files (resource_id, file_name, original_name, file_type, file_size, mime_type, is_primary)
         VALUES (?, ?, ?, 'pdf', ?, 'application/pdf', 1)`,
        [resourceId, pdfFilename, originalName, stat.size]
      );
    }
    console.log('Atualizado:', item.title);
    return true;
  }

  const [result] = await conn.execute(
    `INSERT INTO resources (title, slug, description, content_description, age_range, category_id, cover_image, is_published, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [item.title, item.slug, item.description, contentDescription, ageRange, categoryId, coverUrl, adminId]
  );

  await conn.execute(
    `INSERT INTO resource_files (resource_id, file_name, original_name, file_type, file_size, mime_type, is_primary)
     VALUES (?, ?, ?, 'pdf', ?, 'application/pdf', 1)`,
    [result.insertId, pdfFilename, originalName, stat.size]
  );

  console.log('Criado:', item.title);
  return true;
}

async function seed() {
  ensureDirs();

  if (useGemini) {
    console.log('Modo Gemini (gemini-2.5-flash-image) — 5 paginas por material\n');
    try {
      execSync('python -c "from PIL import Image"', { stdio: 'pipe' });
    } catch {
      console.log('Instalando Pillow...');
      execSync('pip install pillow -q', { stdio: 'inherit' });
    }
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY nao definida no backend/.env');
    }
  } else {
    try {
      execSync('python -c "import fpdf"', { stdio: 'pipe' });
    } catch {
      console.log('Instalando fpdf2...');
      execSync('pip install fpdf2 -q', { stdio: 'inherit' });
    }
  }

  const conn = await mysql.createConnection(dbConfig);

  const [[admin]] = await conn.execute(
    "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
  );
  if (!admin) {
    throw new Error('Admin não encontrado. Rode npm run db:setup primeiro.');
  }

  const [categories] = await conn.execute('SELECT id, slug FROM categories');
  const categoryBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  if (!categoryBySlug.atividades) {
    await conn.execute(
      `INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)`,
      ['Atividades', 'atividades', 'Worksheets e PDFs imprimíveis para sala de aula', 3]
    );
    const [[row]] = await conn.execute("SELECT id FROM categories WHERE slug = 'atividades'");
    categoryBySlug.atividades = row.id;
  }

  let count = 0;
  for (const item of ACTIVITIES) {
    if (onlySlug && item.slug !== onlySlug) continue;
    if (!regenerate) {
      const [existing] = await conn.execute('SELECT id FROM resources WHERE slug = ? LIMIT 1', [item.slug]);
      if (existing.length) {
        console.log('Já existe (use --regenerate):', item.slug);
        continue;
      }
    }
    if (await upsertActivity(conn, item, admin.id, categoryBySlug)) count += 1;
  }

  await conn.end();
  console.log(`\nConcluído: ${count} atividade(s) ${regenerate ? 'atualizada(s)' : 'adicionada(s)'}.`);
}

seed().catch((err) => {
  console.error('Erro no seed:', err.message);
  process.exit(1);
});
