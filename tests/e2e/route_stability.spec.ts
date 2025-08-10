import { test, expect, Page } from '@playwright/test';

async function assertSkeletonThenMain(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
  const resolved = await Promise.race([
    page
      .getByRole('heading', { name: /Dashboard|Settings|Child not found/i })
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
    page
      .getByText(/Recent Transactions|Something went wrong/)
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
    page
      .getByRole('button', { name: /Retry/i })
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
    // Settings page accessible marker
    page
      .getByLabel('Family Name')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
    // Unconditional mount signal from settings client
    page
      .getByTestId('settings-mounted')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
    page
      .getByTestId('settings-ready')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false),
  ]);
  expect(resolved).toBeTruthy();
}

test.describe('route stability', () => {
  test.describe('@offline', () => {
    test('dashboard', async ({ page }) => {
      await assertSkeletonThenMain(page, '/dashboard?e2e=1');
    });
    test('settings', async ({ page }) => {
      await assertSkeletonThenMain(page, '/settings?e2e=1');
    });
    test('child id', async ({ page }) => {
      await assertSkeletonThenMain(page, '/child/test?e2e=1');
    });
  });

  test.describe('@backend', () => {
    test('dashboard', async ({ page }) => {
      await assertSkeletonThenMain(page, '/dashboard');
    });
    test('settings', async ({ page }) => {
      // Warm up session on dashboard to avoid guard races, then navigate to settings
      await page.goto('/dashboard');
      await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await assertSkeletonThenMain(page, '/settings');
    });
    test('child id', async ({ page }) => {
      await assertSkeletonThenMain(page, '/child/test');
    });
  });
});


