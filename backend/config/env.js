import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.localdev') });

// Production receives JWT_SECRET from Firebase Secret Manager. Local
// development uses a separate value that is never bound to Cloud Functions.
if (!process.env.JWT_SECRET && process.env.LOCAL_JWT_SECRET) {
  process.env.JWT_SECRET = process.env.LOCAL_JWT_SECRET;
}

export const dbConfig = {
  host: process.env.DB_HOST || (isProductionRuntime() ? '' : '127.0.0.1'),
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || (isProductionRuntime() ? '' : 'jer'),
  password: process.env.DB_PASSWORD || (isProductionRuntime() ? '' : 'jer_dev_pass'),
  database: process.env.DB_NAME || (isProductionRuntime() ? '' : 'jewish_educational_resources'),
};

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
}
