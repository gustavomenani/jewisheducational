import { defineConfig } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const qaRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(qaRoot, '..');
const runtimeRoot = path.join(os.tmpdir(), 'jer-playwright', `${process.pid}-${Date.now()}`);
const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT || 3310);
const frontendPort = Number(process.env.PLAYWRIGHT_FRONTEND_PORT || 5174);
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === 'true';

const backendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DB_DRIVER: 'memory',
  LOCAL_JWT_SECRET: 'playwright-isolated-jwt-secret',
  JER_MEMORY_DATA_FILE: path.join(runtimeRoot, 'db.json'),
  UPLOAD_DIR: path.join(runtimeRoot, 'uploads'),
  DEV_PORT: String(backendPort),
  FRONTEND_URL: frontendUrl,
  STRIPE_REQUIRED: 'false',
  SMTP_REQUIRED: 'false',
};

const frontendEnv = {
  ...process.env,
  VITE_API_PROXY: backendUrl,
  VITE_SITE_URL: frontendUrl,
  VITE_FIREBASE_API_KEY: 'playwright-isolated-key',
  VITE_GA_MEASUREMENT_ID: '',
};

export default defineConfig({
  testDir: path.join(qaRoot, 'playwright', 'tests'),
  outputDir: path.join(qaRoot, 'playwright', 'artifacts'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: path.join(qaRoot, 'playwright', 'report'), open: 'never' }]],
  use: {
    baseURL: frontendUrl,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, isMobile: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 }, isMobile: false } },
  ],
  webServer: [
    {
      command: 'node backend/server.js',
      cwd: root,
      env: backendEnv,
      url: `${backendUrl}/api/health`,
      timeout: 60_000,
      reuseExistingServer,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174',
      cwd: path.join(root, 'frontend'),
      env: frontendEnv,
      url: `${frontendUrl}/`,
      timeout: 60_000,
      reuseExistingServer,
    },
  ],
});
