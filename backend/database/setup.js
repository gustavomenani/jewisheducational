import '../config/env.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { dbConfig } from '../config/env.js';
import { migrate } from './migrate.js';
import { pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setup(existingConnection = null, migrateFn = migrate) {
  const connection = existingConnection || await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    multipleStatements: true,
  });
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await connection.query(schema);

    const dbName = dbConfig.database;
    await connection.changeUser({ database: dbName });

    // The schema creates the base tables; migrations add compatibility columns
    // and tables needed by later application versions. Running them here makes
    // a fresh setup and a repeated setup converge on the same shape.
    await migrateFn(connection);

    const production = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
    const adminEmail = String(process.env.ADMIN_EMAIL || (production ? '' : 'admin@example.com')).trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || (production ? '' : 'admin123'));
    const adminQuery = adminEmail
      ? 'SELECT id FROM users WHERE email = ? LIMIT 1'
      : 'SELECT id FROM users WHERE role = \'admin\' LIMIT 1';
    const [admins] = await connection.execute(adminQuery, adminEmail ? [adminEmail] : []);

    if (admins.length === 0) {
      if (!adminEmail || !adminPassword) {
        throw new Error('Production database setup requires ADMIN_EMAIL and ADMIN_PASSWORD when no admin exists.');
      }
      const hash = await bcrypt.hash(adminPassword, 10);
      await connection.execute(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
        [process.env.ADMIN_NAME || 'Administrator', adminEmail, hash]
      );
      console.log(`Admin criado: ${adminEmail}`);
    }

    const [cats] = await connection.execute('SELECT COUNT(*) AS total FROM categories');
    if (cats[0].total === 0) {
      await connection.execute(
        `INSERT INTO categories (name, slug, description, sort_order) VALUES
          ('Torah', 'torah', 'Resources about Torah', 1),
          ('Jewish History', 'jewish-history', 'Jewish history', 2),
          ('Atividades', 'atividades', 'Atividades para sala de aula', 3)`
      );
      console.log('Categorias de exemplo criadas.');
    }

    console.log('Banco de dados configurado com sucesso.');
  } finally {
    if (!existingConnection) await connection.end();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  setup().catch((err) => {
    console.error('Erro ao configurar banco:', err.message);
    process.exit(1);
  });
}
