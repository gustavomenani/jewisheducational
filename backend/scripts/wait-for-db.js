import '../config/env.js';
import mysql from 'mysql2/promise';
import { dbConfig } from '../config/env.js';
const maxAttempts = 40;
const delayMs = 2000;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    const connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });    await connection.end();
    console.log('MySQL disponível.');
    process.exit(0);
  } catch {
    console.log(`MySQL indisponível (${attempt}/${maxAttempts}), tentando novamente...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

console.error('MySQL não respondeu a tempo.');
process.exit(1);
