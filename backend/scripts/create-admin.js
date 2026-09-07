import '../config/env.js';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env.js';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=').slice(1).join('=')?.trim() || null;
}

const email = arg('email') || process.env.ADMIN_EMAIL;
const name = arg('name') || process.env.ADMIN_NAME || 'Administrator';
const password = arg('password') || process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Uso: node scripts/create-admin.js --email=... --password=... [--name=...]');
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);
  const [existing] = await conn.execute('SELECT id, role FROM users WHERE email = ? LIMIT 1', [email]);

  const hash = await bcrypt.hash(password, 10);

  if (existing.length) {
    await conn.execute(
      'UPDATE users SET name = ?, password_hash = ?, role = ?, is_blocked = 0 WHERE id = ?',
      [name, hash, 'admin', existing[0].id]
    );
    console.log('Admin atualizado:', email);
  } else {
    await conn.execute(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, 'admin']
    );
    console.log('Admin criado:', email);
  }

  await conn.end();
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
