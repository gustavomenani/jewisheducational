/*
 * Authenticated Content smoke audit. This intentionally publishes a no-op
 * Content snapshot with the current revision, so it exercises the real
 * multipart / revision / response path without creating or changing a
 * category, material, file, or setting.
 */
const path = require('node:path');

function loadPlaywright() {
  try { return require('playwright'); } catch (primaryError) {
    const candidates = [
      process.env.CODEX_NODE_MODULES,
      path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules'),
    ].filter(Boolean);
    for (const root of candidates) {
      try { return require(path.join(root, 'playwright')); } catch { /* try next runtime */ }
    }
    primaryError.message += ' Install Playwright or set CODEX_NODE_MODULES.';
    throw primaryError;
  }
}

const { chromium } = loadPlaywright();
const baseUrl = process.env.EDITOR_AUDIT_URL || 'http://localhost:5173';
const browserPath = process.env.CHROMIUM_PATH
  || 'C:\\Users\\User\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1232\\chrome-headless-shell-win64\\chrome-headless-shell.exe';

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 20000 });
    if (await page.locator('input[type=email]').count()) {
      await page.locator('input[type=email]').fill(process.env.EDITOR_AUDIT_EMAIL || 'admin@example.com');
      await page.locator('input[type=password]').fill(process.env.EDITOR_AUDIT_PASSWORD || 'admin123');
      await page.getByRole('button', { name: /log in/i }).click();
      await page.waitForTimeout(500);
    }
    await page.goto(`${baseUrl}/?edit=1`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForSelector('.editor-topbar', { state: 'visible', timeout: 15000 });
    const contentTab = page.locator('.editor-sidebar-tabs button').filter({ hasText: /Content/i }).first();
    await contentTab.waitFor({ state: 'visible', timeout: 15000 });
    await contentTab.click();
    await page.waitForTimeout(250);
    const contentVisible = await page.locator('.editor-content-panel').isVisible().catch(() => false);
    const contentLoaded = await page.evaluate(() => {
      const store = document.querySelector('[data-editor-workspace]');
      return Boolean(store);
    });
    const publish = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/editor/content', { headers: { Authorization: `Bearer ${token}` } });
      const snapshot = await response.json();
      if (!response.ok || !Number.isInteger(Number(snapshot.revision))) return { ok: false, status: response.status, snapshot };
      const body = new FormData();
      body.append('settings', '{}');
      body.append('content', JSON.stringify({ quickTopics: snapshot.quickTopics, operations: [], baseRevision: Number(snapshot.revision) }));
      body.append('base_revision', String(snapshot.revision));
      body.append('file_manifest', '[]');
      const published = await fetch('/api/editor/publish', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
      let result = null;
      try { result = await published.json(); } catch { /* non-json error */ }
      return { ok: published.ok && result?.published === true, status: published.status, revision: result?.revision, result };
    });
    const result = { contentVisible, contentLoaded, publish, errors };
    console.log(JSON.stringify(result, null, 2));
    if (!contentVisible || !contentLoaded || !publish.ok || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
