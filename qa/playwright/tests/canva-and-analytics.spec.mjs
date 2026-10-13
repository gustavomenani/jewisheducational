import { test, expect } from '@playwright/test';

const canvaSource = 'https://www.canva.com/design/DAHXP_38uoI/JY7u71G6qZKiC5s12cp26A/view';

async function setup(page, { canva = canvaSource, delay = 0 } = {}) {
  const response = await page.request.get('/api/settings');
  const body = await response.json();
  body.settings.home_canva_url = canva;
  body.settings.google_analytics_id = 'G-QATEST01';
  let firstRequest = true;
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({
    contentType: 'application/javascript', body: '',
  }));
  await page.route('https://www.canva.com/**', (route) => route.fulfill({
    contentType: 'text/html', body: '<html lang="en"><title>Canva</title><body>Canva design</body></html>',
  }));
  await page.route('**/api/settings', async (route) => {
    const requestDelay = firstRequest ? delay : 0;
    firstRequest = false;
    if (requestDelay) await new Promise((resolve) => setTimeout(resolve, requestDelay));
    await route.fulfill({ status: 200, json: body });
  });
}

test('Canva occupies the home viewport while the library and login remain reachable', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const frame = page.locator('.canva-home-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', `${canvaSource}?embed`);
  await expect(frame).toHaveAttribute('title', / home$/);
  await expect(page.locator('.edu-header')).toHaveCount(0);
  const dimensions = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    bodyWidth: document.documentElement.scrollWidth,
    frame: document.querySelector('iframe').getBoundingClientRect().toJSON(),
  }));
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.frame.width).toBe(dimensions.width);
  expect(dimensions.frame.bottom).toBeLessThanOrEqual(dimensions.height + 1);
  await page.getByRole('link', { name: 'Browse materials', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator('.edu-header')).toBeVisible();
  await expect(page.locator('.canva-home-frame')).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
});

test('an empty or unsafe Canva setting keeps the original homepage', async ({ page }) => {
  for (const canva of ['', 'https://example.com/design/DAHXP_38uoI/view']) {
    await page.unroute('**/api/settings');
    await setup(page, { canva });
    await page.goto('/');
    await expect(page.locator('.edu-header')).toBeVisible();
    await expect(page.locator('.k5-home-page')).toBeVisible();
    await expect(page.locator('.canva-home-frame')).toHaveCount(0);
  }
});

test('late settings and SPA navigation record one page view per successful route', async ({ page }) => {
  await setup(page, { delay: 1500 });
  await page.goto('/');
  await expect(page.locator('.canva-home-frame')).toBeVisible();
  await page.getByRole('link', { name: 'Browse materials', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  const events = await page.evaluate(() => window.dataLayer
    .map((entry) => Array.from(entry))
    .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view'));
  expect(events.map((entry) => entry[2].page_path)).toEqual(['/', '/library']);
  expect(events.every((entry) => entry[2].send_to === 'G-QATEST01')).toBeTruthy();
  expect(events[1][2].page_referrer).toMatch(/\/$/);
  expect(events[1][2].page_location).toMatch(/\/library$/);
});
