import { test, expect } from '@playwright/test';
import { primeBypassAndFamily, gotoE2E } from './utils/prime';

test.describe('@backend Sign out flow', () => {
  test('Clicking Sign Out logs out and returns to landing', async ({ page }) => {
    await primeBypassAndFamily(page);
    await gotoE2E(page, '/dashboard');

    const signOutButton = page.getByRole('button', { name: /Sign Out/i });
    await expect(signOutButton).toBeVisible();
    await signOutButton.click();

    // Expect redirect to landing
    await page.waitForURL((url) => /\/$/.test(url.pathname), { timeout: 10000 });
    // Landing has the CTA
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });
});


