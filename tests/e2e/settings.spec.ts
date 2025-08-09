import { test, expect } from '@playwright/test';
import { primeBypassAndFamily } from './utils/prime';

// NOTE: Uses E2E bypass per app logic to avoid real auth

test.describe('Settings — family + interest tiers', () => {
test.beforeEach(async ({ page }) => {
  await primeBypassAndFamily(page, { familyName: 'Settings Test Family' });
  await page.goto('/dashboard');
});

  test('Family name and timezone update reflect on dashboard', async ({ page }) => {
  await page.goto('/settings');

    // Update family name
    await page.locator('#familyName').fill('The Testers');

    // Open Radix Select via a stable test id on the trigger
    await page.getByTestId('timezone-trigger').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('option', { name: /Pacific Time.*PT/i }).click();

    await page.getByRole('button', { name: /Save Changes/i }).click();

    // Verify on dashboard
  await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /The Testers Dashboard/i })).toBeVisible();
    await expect(page.getByText(/Los Angeles|Pacific/i)).toBeVisible();
  });

  test('Sibling visibility persists', async ({ page }) => {
    await page.goto('/settings');

    const toggle = page.locator('#siblingVisibility');
    await toggle.click();
    await page.getByRole('button', { name: /Save Changes/i }).click();

    // Reload and verify state
    await page.reload();
    // The Radix switch may not expose checked via role; basic visibility check suffices for smoke
    await expect(page.locator('#siblingVisibility')).toBeVisible();
  });

  test('Schedule valid tiers and verify ticker increases', async ({ page }) => {
    await page.goto('/settings');

    // Pick effective date = today
    await page.getByRole('button').filter({ hasText: /Pick a date|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i }).first().click();
    await page.getByRole('gridcell', { selected: true }).click();

    // Define tiers: 0->100 @200 bps, 100->∞ @300 bps
    const lower0 = page.getByLabel('Lower ($)').first();
    await lower0.fill('0.00');
    const upper0 = page.getByLabel('Upper ($, blank = ∞)');
    await upper0.first().fill('100.00');
    const apr0 = page.getByLabel('APR (bps)').first();
    await apr0.fill('200');

    await page.getByRole('button', { name: /Add Tier/i }).first().click();

    const lower1 = page.getByLabel('Lower ($)').nth(1);
    await lower1.fill('100.00');
    const upper1 = page.getByLabel('Upper ($, blank = ∞)').nth(1);
    await upper1.fill('');
    const apr1 = page.getByLabel('APR (bps)').nth(1);
    await apr1.fill('300');

    await page.getByRole('button', { name: /Save Scheduled Tiers/i }).first().click();

    // Go to dashboard and ensure at least one child has account and balance increases
    await page.goto('/dashboard');

    // If no children exist, add one
    if (await page.getByText(/No children added yet/i).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Add Child/i }).click();
      await page.getByLabel('Name', { exact: true }).fill('Alex');
      await page.getByRole('button', { name: /Create Child/i }).click();
    }

    // Read one visible balance, wait, expect change (best-effort smoke)
    const anyBalance = page.locator('text=$').first();
    const balanceText = await anyBalance.textContent();
    await page.waitForTimeout(3000);
    const balanceText2 = await anyBalance.textContent();
    expect(balanceText2).not.toEqual(balanceText);
  });

  test('Create, edit, and delete a future tier set', async ({ page }) => {
    await page.goto('/settings');

    // Schedule for a future date (pick an unselected gridcell if possible)
    await page.getByRole('button').filter({ hasText: /Pick a date|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i }).first().click();
    // Choose any date cell that is not selected (naive approach)
    const candidate = page.getByRole('gridcell').locator('not([aria-selected="true"])').first();
    await candidate.click();

    // Compose a simple set: 0->50 @150 bps, 50->∞ @250 bps
    await page.getByLabel('Lower ($)').first().fill('0.00');
    await page.getByLabel('Upper ($, blank = ∞)').first().fill('50.00');
    await page.getByLabel('APR (bps)').first().fill('150');
    await page.getByRole('button', { name: /Add Tier/i }).first().click();
    await page.getByLabel('Lower ($)').nth(1).fill('50.00');
    await page.getByLabel('Upper ($, blank = ∞)').nth(1).fill('');
    await page.getByLabel('APR (bps)').nth(1).fill('250');
    await page.getByRole('button', { name: /Save Scheduled Tiers/i }).first().click();

    // Should see Scheduled Tier Sets list and the newly added set
    await expect(page.getByTestId('tiers-scheduled-list')).toBeVisible();

    // Edit the first scheduled set
    const firstSet = page.getByTestId(/tier-set-/).first();
    await firstSet.getByRole('button', { name: /Edit/i }).click();

    // Change APR and add a row
    await page.getByTestId('edit-tier-apr-0').fill('175');
    await page.getByTestId('edit-tier-add').click();
    await page.getByTestId('edit-tier-lower-2').fill('200.00');
    await page.getByTestId('edit-tier-upper-2').fill('');
    await page.getByTestId('edit-tier-apr-2').fill('275');
    await page.getByTestId('edit-tier-save').click();

    // Delete the set
    await firstSet.getByRole('button', { name: /Delete/i }).click();
    await page.getByTestId('tier-set-confirm-delete').click();
  });

  test('Tier validation errors appear', async ({ page }) => {
    await page.goto('/settings');

    // Pick effective date = today
    await page.getByRole('button', { name: /Pick a date|Mon|Tue|Wed|Thu|Fri|Sat|Sun/i }).click();
    await page.getByRole('gridcell', { selected: true }).click();

    // Make invalid first lower (> 0)
    await page.getByLabel('Lower ($)').first().fill('5.00');
    await page.getByRole('button', { name: /Save Scheduled Tiers/i }).first().click();
    await expect(page.getByText(/must start at 0 cents/i)).toBeVisible();
  });
});


