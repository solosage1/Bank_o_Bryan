import { test, expect } from '@playwright/test';

// NOTE: This is a high-level happy-path test and assumes a test user session.
// In CI, you can mock Supabase auth via setting a cookie/localStorage or by stubbing network calls.

test.describe('Onboarding happy path', () => {
  test('Creates a family and redirects to dashboard', async ({ page }) => {
    // Precondition: E2E bypass sets a fake user only on onboarding route
    await page.goto('/onboarding');

    // Fill family name
    await page.getByLabel('Family Name').fill('Playwright Test Family');

    // Select timezone (default may already be applied; open and re-select to be explicit)
    // Timezone default is preselected via defaultValue; ensure the trigger is present
    await page.getByText('Timezone').isVisible();

    // Submit
    await page.getByRole('button', { name: /Create Family/i }).click();

    // Expect redirect to dashboard (guard bypass lets it continue in test env)
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard$/);

    // Smoke check dashboard contains any heading on the page
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});


