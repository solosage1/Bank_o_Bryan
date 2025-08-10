import { test, expect } from '@playwright/test';

// NOTE: This is a high-level happy-path test and assumes a test user session.
// In CI, you can mock Supabase auth via setting a cookie/localStorage or by stubbing network calls.

test.describe('@backend Onboarding happy path', () => {
  test('Creates a family and redirects to dashboard', async ({ page }) => {
    // Precondition: ensure E2E bypass is active client-side before load
    await page.addInitScript(() => localStorage.setItem('E2E_BYPASS', '1'));
    await page.goto('/onboarding?e2e=1');

    // In E2E bypass, the guard immediately seeds family and redirects; handle both flows
    const isE2E = await page.evaluate(() => localStorage.getItem('E2E_BYPASS') === '1');
    if (isE2E) {
      await page.waitForURL('**/dashboard', { timeout: 15000 });
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText(/Children's Accounts/i)).toBeVisible();
      return;
    }

    // Non-E2E: fill form and submit
    await page.getByLabel('Family Name').fill('Playwright Test Family');
    await page.getByText('Timezone').isVisible();
    await page.getByRole('button', { name: /Create Family/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/Children's Accounts/i)).toBeVisible();
  });
});


