import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const API_URL = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_BACKEND_PORT || 3310)}`;
const RESOURCE_SLUG = 'alfabeto-hebraico-aleph-bet';
const diagnostics = new Map();
let adminSession;
let resourceFile;

function installDiagnostics(page) {
  const errors = [];
  const unexpectedResponses = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && (url.startsWith(API_URL) || url.startsWith('http://127.0.0.1:5174'))) {
      unexpectedResponses.push(`${response.status()} ${response.request().method()} ${url}`);
    }
  });
  diagnostics.set(page, { errors, unexpectedResponses });
  return diagnostics.get(page);
}

function assertDiagnostics(page) {
  const result = diagnostics.get(page);
  expect(result.errors, result.errors.join('\n')).toEqual([]);
  expect(result.unexpectedResponses, result.unexpectedResponses.join('\n')).toEqual([]);
}

async function authenticatePage(page) {
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }, adminSession);
}

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API_URL });
  const login = await api.post('/api/auth/login', {
    data: { email: 'admin@example.com', password: 'admin123' },
  });
  expect(login.ok()).toBeTruthy();
  adminSession = await login.json();

  const resourceResponse = await api.get(`/api/resources/${RESOURCE_SLUG}`, {
    headers: { Authorization: `Bearer ${adminSession.token}` },
  });
  expect(resourceResponse.ok()).toBeTruthy();
  const existing = await resourceResponse.json();
  resourceFile = existing.resource.files?.find((file) => !file.is_archived);

  if (!resourceFile) {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const upload = await api.post('/api/resources/1/files', {
      headers: { Authorization: `Bearer ${adminSession.token}` },
      multipart: {
        file: { name: 'playwright-check.pdf', mimeType: 'application/pdf', buffer: pdf },
        label: 'Playwright check',
      },
    });
    expect(upload.ok()).toBeTruthy();
    const uploaded = await upload.json();
    resourceFile = uploaded.files.find((file) => !file.is_archived);
  }
  expect(resourceFile?.id).toBeTruthy();
  await api.dispose();
});

test('public routes render without console errors or failed same-origin requests', async ({ page }) => {
  const result = installDiagnostics(page);
  for (const route of ['/', '/library', '/library/category/hebrew-language', `/resource/${RESOURCE_SLUG}`, '/login']) {
    await page.goto(route, { waitUntil: 'networkidle' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
  }
  expect(result.errors, result.errors.join('\n')).toEqual([]);
  expect(result.unexpectedResponses, result.unexpectedResponses.join('\n')).toEqual([]);
});

test('home and library pass an accessibility audit', async ({ page }) => {
  installDiagnostics(page);
  for (const route of ['/', '/library', '/login']) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${route}: ${JSON.stringify(results.violations)}`).toEqual([]);
  }
  assertDiagnostics(page);
});

test('Grades opens, exposes state, supports Escape, and does not invent options', async ({ page }) => {
  test.skip(page.viewportSize().width < 992, 'Grades is intentionally desktop navigation.');
  installDiagnostics(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const trigger = page.locator('#grades-menu-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#grades-menu')).toBeVisible();
  await expect(page.locator('#grades-menu [role="menuitem"]')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  assertDiagnostics(page);
});

test('class level filter stays visible after the pointer leaves the sidebar', async ({ page }) => {
  installDiagnostics(page);
  await page.goto('/library', { waitUntil: 'networkidle' });

  const panel = page.locator('#library-grade-filter-sidebar');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Basic', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Intermediate', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Advanced', exact: true })).toBeVisible();

  await page.mouse.move(900, 500);
  await expect(panel).toBeVisible();

  const basic = panel.getByRole('button', { name: 'Basic', exact: true });
  await basic.click();
  await expect(page).toHaveURL(/grade=Basic/);
  await expect(basic).toHaveAttribute('aria-pressed', 'true');
  assertDiagnostics(page);
});

test('mobile navigation opens and closes with a labeled dialog', async ({ page }) => {
  test.skip(page.viewportSize().width >= 992, 'Mobile drawer is not rendered on desktop.');
  installDiagnostics(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  const drawer = page.locator('#mobile-navigation-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('role', 'dialog');
  await expect(drawer).toHaveAttribute('aria-label', 'Navigation menu');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(drawer).toBeHidden();
  assertDiagnostics(page);
});

test('Clear filters clears the search field and URL state', async ({ page }) => {
  installDiagnostics(page);
  await page.goto('/library', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /search and filter/i }).click();
  const search = page.locator('input[type="search"]').last();
  await search.fill('hebrew');
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/q=hebrew/);
  await page.getByRole('button', { name: /clear filters/i }).click();
  await expect(search).toHaveValue('');
  await expect(page).toHaveURL(/\/library$/);
  assertDiagnostics(page);
});

test('published CTA navigates and unauthenticated file action opens a closable login modal', async ({ page }) => {
  installDiagnostics(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /explore library/i }).click();
  await expect(page).toHaveURL(/\/library$/);

  await page.goto(`/resource/${RESOURCE_SLUG}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Worksheet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /log in|sign in|welcome/i }).first();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  assertDiagnostics(page);
});

test('blocked popup falls back to same-tab intermediate download page', async ({ page }) => {
  installDiagnostics(page);
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await authenticatePage(page);
  await page.goto(`/resource/${RESOURCE_SLUG}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Worksheet', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/resource/${RESOURCE_SLUG}/download/`));
  await expect(page.getByRole('button', { name: /download file/i })).toBeVisible();
  assertDiagnostics(page);
});

test('authenticated first download click opens the intermediate page, second click downloads once', async ({ page, context }) => {
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto(`/resource/${RESOURCE_SLUG}`, { waitUntil: 'networkidle' });
  const action = page.getByRole('button', { name: 'Worksheet', exact: true });
  await expect(action).toBeEnabled();
  const popupPromise = context.waitForEvent('page');
  await action.click();
  const downloadPage = await popupPromise;
  const requests = [];
  downloadPage.on('request', (request) => {
    if (request.url().includes('/api/downloads/')) requests.push(request.url());
  });
  await downloadPage.waitForLoadState('networkidle');
  await expect(downloadPage).toHaveURL(new RegExp(`/resource/${RESOURCE_SLUG}/download/`));
  expect(requests.filter((url) => /\/api\/downloads\/\d+\/\d+$/.test(url))).toEqual([]);
  const downloadPromise = downloadPage.waitForEvent('download');
  await downloadPage.getByRole('button', { name: /download file/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  expect(requests.filter((url) => /\/api\/downloads\/\d+\/\d+$/.test(url))).toHaveLength(1);
  await downloadPage.close();
  assertDiagnostics(page);
});

test('logout removes editor capability and local drafts from the browser', async ({ page }) => {
  installDiagnostics(page);
  await authenticatePage(page);
  await page.addInitScript(() => {
    localStorage.setItem('builder_draft_home', JSON.stringify({ pendingSettings: { hero_title: 'private draft' } }));
    localStorage.setItem('builder_content_draft', JSON.stringify({ quickTopics: [] }));
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.dispatchEvent(new Event('auth:expired')));
  await page.waitForTimeout(100);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('builder_draft_home'))).toBeNull();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('builder_content_draft'))).toBeNull();
  await expect(page.locator('.editor-workspace-root.is-active')).toHaveCount(0);
  assertDiagnostics(page);
});

test('editor changes template text directly, then exposes advanced controls only on request', async ({ page }) => {
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto('/?edit=1&area=home', { waitUntil: 'networkidle' });
  await expect(page.getByRole('region', { name: 'Site editor toolbar' })).toBeVisible();

  const title = page.locator('.k5-hero-title');
  await title.click();
  await expect(title).toHaveAttribute('contenteditable', 'true');
  await title.fill('A direct title');
  await expect(title).toHaveText('A direct title');
  const toolbar = page.locator('.editor-inline-toolbar');
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Larger text' }).click();
  await expect.poll(() => title.evaluate((element) => getComputedStyle(element).fontSize)).toBe('34px');

  await toolbar.getByRole('button', { name: 'More options' }).click();
  const inspector = page.locator('.editor-inspector');
  await expect(inspector.getByRole('heading', { name: 'Hero title' })).toBeVisible();

  const titleInput = inspector.locator('#editor-setting-hero_title');
  await titleInput.fill('');
  await expect(inspector.getByText('Text removed from page')).toBeVisible();
  await titleInput.fill('A restored title');
  await expect(inspector.getByRole('button', { name: 'Remove text' })).toBeVisible();

  await inspector.getByRole('button', { name: 'Remove text' }).click();
  await expect(inspector.getByText('Text removed from page')).toBeVisible();
  await expect(title).toHaveClass(/is-removed/);

  await inspector.getByRole('button', { name: 'Restore text' }).click();
  await expect(inspector.getByRole('button', { name: 'Remove text' })).toBeVisible();
  await expect(title).not.toHaveClass(/is-removed/);
  assertDiagnostics(page);
});

test('v2 text blocks are directly editable, responsive and removable by section', async ({ page }) => {
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto('/?edit=1&area=home', { waitUntil: 'networkidle' });
  await expect(page.getByRole('region', { name: 'Site editor toolbar' })).toBeVisible();

  if ((page.viewportSize()?.width || 0) <= 760) {
    await page.getByRole('button', { name: 'Toggle editor panel' }).click();
  }
  const help = page.locator('.editor-help-popover');
  if (await help.isVisible().catch(() => false)) await help.getByRole('button', { name: 'Got it', exact: true }).click();
  await page.locator('.editor-palette-card').filter({ hasText: /^Text$/ }).click();

  const slot = page.locator('[data-page="home"][data-zone="after-hero"]');
  const text = slot.locator('.site-slot-paragraph').last();
  await expect(text).toBeVisible();
  await expect(text).toHaveAttribute('contenteditable', 'true');
  await text.fill('A text block that can be resized.');
  await expect(text).toHaveText('A text block that can be resized.');

  const block = slot.locator('.site-slot-block.is-selected');
  await block.locator('button[title="Larger text"]').click();
  await expect.poll(() => text.evaluate((element) => getComputedStyle(element).fontSize)).toBe('19px');

  const deleteSection = slot.locator('button[title="Delete section"]');
  await expect(deleteSection).toBeVisible();
  await deleteSection.click();
  await expect(slot.getByText('Delete this section?', { exact: true })).toBeVisible();
  await slot.getByRole('button', { name: 'Confirm delete section', exact: true }).click();
  await expect(slot.locator('.site-slot-paragraph')).toHaveCount(0);
  assertDiagnostics(page);
});

test('legacy Home content keeps direct editing and clear remove controls', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) <= 760, 'The compact editor panel is covered by the mobile interaction test.');
  installDiagnostics(page);
  await authenticatePage(page);

  const legacyLayout = {
    sections: [{
      id: 'legacy-section',
      props: { paddingY: 48, maxWidth: 1140 },
      columns: [{
        id: 'legacy-column',
        span: 12,
        blocks: [{
          id: 'legacy-copy',
          type: 'paragraph',
          props: { text: 'Middle legacy text', textStyle: {} },
          layout: { start: 1, span: 12, marginTop: 0, marginBottom: 0 },
        }],
      }],
    }],
  };

  await page.route('**/api/settings', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        settings: {
          ...(body.settings || {}),
          page_home_layout_published: JSON.stringify(legacyLayout),
          site_document_v2_published: '',
        },
      },
    });
  });

  await page.goto('/?edit=1&area=home', { waitUntil: 'networkidle' });
  await expect(page.getByRole('region', { name: 'Site editor toolbar' })).toBeVisible();

  const legacySection = page.locator('.block-renderer .br-section');
  const legacyText = legacySection.locator('.editable-text');
  await expect(legacyText).toHaveAttribute('contenteditable', 'true');
  await legacyText.fill('Updated legacy text');
  await expect(legacyText).toHaveText('Updated legacy text');

  await legacySection.getByRole('button', { name: 'Delete text' }).click();
  await expect(legacySection.getByText('Delete this text?', { exact: true })).toBeVisible();
  await legacySection.getByRole('button', { name: 'Confirm delete text', exact: true }).click();
  await expect(legacySection.locator('.editable-text')).toHaveCount(0);

  await legacySection.getByRole('button', { name: 'Delete section' }).click();
  await expect(legacySection.getByText('Delete this section?', { exact: true })).toBeVisible();
  await legacySection.getByRole('button', { name: 'Confirm delete section', exact: true }).click();
  await expect(page.locator('.block-renderer .br-section')).toHaveCount(0);
  assertDiagnostics(page);
});

test('v2 library content stays outside search and catalog controls', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 0) <= 760, 'The compact editor panel is covered by the mobile interaction test.');
  installDiagnostics(page);
  await authenticatePage(page);
  await page.goto('/library?edit=1&area=library', { waitUntil: 'networkidle' });
  await expect(page.getByRole('region', { name: 'Site editor toolbar' })).toBeVisible();
  const searchToggle = page.getByRole('button', { name: /search and filter/i });
  await expect(searchToggle).toBeVisible();
  await page.locator('.editor-palette-card').filter({ hasText: /^Text$/ }).click();

  const slot = page.locator('[data-page="library"][data-zone="before-library"]');
  const text = slot.locator('.site-slot-paragraph').last();
  await expect(text).toBeVisible();
  await text.fill('Library introduction');
  await expect(text).toHaveText('Library introduction');
  await expect(searchToggle).toBeVisible();
  await expect(slot.evaluate((element) => !element.contains(document.querySelector('.search-panel')))).toBeTruthy();
  // In edit mode its visible label remains editable, so use the protected
  // control's icon rather than the editable label to exercise the action.
  await page.locator('.library-search-toggle > i').click();
  await expect(page.locator('.search-panel')).toBeVisible();
  assertDiagnostics(page);
});

test('editor changes category and material copy in place without changing their public routes', async ({ page }) => {
  installDiagnostics(page);
  await authenticatePage(page);

  await page.goto('/library/category/hebrew-language?edit=1&area=library', { waitUntil: 'networkidle' });
  const categoryTitle = page.locator('.k5-page-head [data-editor-content$=":name"]').last();
  await expect(categoryTitle).toBeVisible();
  await categoryTitle.click();
  await expect(categoryTitle).toHaveAttribute('contenteditable', 'true');
  await categoryTitle.fill('Catalog title draft');
  await categoryTitle.blur();
  await expect(categoryTitle).toHaveText('Catalog title draft');
  await expect(page).toHaveURL(/\/library\/category\/hebrew-language/);
  await expect(page.locator('.editable-content-more:visible')).toHaveCount(1);
  if ((page.viewportSize()?.width || 0) >= 992) {
    await page.locator('.editable-content-more:visible').click();
    await expect(page.locator('[data-editor-form-field="category:name"]')).toBeVisible();
  }

  await page.goto('/resource/' + RESOURCE_SLUG + '?edit=1&area=resource', { waitUntil: 'networkidle' });
  const materialTitle = page.locator('.k5-resource-intro [data-editor-content$=":title"]');
  await expect(materialTitle).toBeVisible();
  await materialTitle.click();
  await expect(materialTitle).toHaveAttribute('contenteditable', 'true');
  await materialTitle.fill('Material title draft');
  await materialTitle.blur();
  await expect(materialTitle).toHaveText('Material title draft');
  await expect(page).toHaveURL(new RegExp('/resource/' + RESOURCE_SLUG));
  await expect(page.getByRole('button', { name: 'Worksheet', exact: true })).toBeVisible();
  assertDiagnostics(page);
});
