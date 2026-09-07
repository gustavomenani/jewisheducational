import './env.js';
import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';
import { dbConfig } from './env.js';

const pool = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

// Editor publishes can touch settings, categories, materials and files in one
// request.  Keep the active connection in async-local storage so the existing
// adapter functions automatically participate in the same transaction without
// sharing a connection between concurrent requests.
const transactionContext = new AsyncLocalStorage();

export default pool;

export async function query(sql, params = {}) {
  const executor = transactionContext.getStore() || pool;
  const [rows] = await executor.execute(sql, params);
  return rows;
}

export async function queryOne(sql, params = {}) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function withTransaction(work) {
  const existing = transactionContext.getStore();
  if (existing) return work();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await transactionContext.run(connection, () => work({ transactional: true }));
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
  }
}
