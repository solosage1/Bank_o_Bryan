import { test, expect } from '@playwright/test';
import { primeBypassAndFamily, gotoE2E } from './utils/prime';

test.describe('@offline settings nav button', () => {
  test('clicking Settings button navigates to settings page', async ({ page }) => {
    await primeBypassAndFamily(page, { familyName: 'Nav Test Family' });
    await gotoE2E(page, '/dashboard');

    // Click settings button
    await page.getByTestId('settings-button').click();

    // Assert settings page mounts and shows main card
    await expect(page.getByTestId('settings-mounted')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible({ timeout: 10000 });
  });
});


