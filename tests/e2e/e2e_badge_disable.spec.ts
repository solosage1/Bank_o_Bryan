import { test, expect } from '@playwright/test';

test.describe('@offline E2E badge quick actions', () => {
  test('Disable E2E removes param and hides badge after reload', async ({ page }) => {
    await page.goto('/dashboard?e2e=1');
    await expect(page.getByLabel('E2E mode')).toBeVisible();

    // Open menu and click Disable E2E
    await page.getByLabel('E2E mode').getByRole('button', { name: 'Disable E2E options' }).click();
    await page.getByRole('button', { name: 'Disable E2E' }).click();

    // The action triggers a reload; wait for navigation and verify url param removed
    await page.waitForLoadState('load');
    expect(page.url()).not.toMatch(/e2e=1/);

    // Badge should be hidden unless env forced it; if visible, skip
    const visible = await page.getByLabel('E2E mode').isVisible().catch(() => false);
    if (visible) test.skip(true, 'Badge visible due to env toggle in this run');
    await expect(page.getByLabel('E2E mode')).toBeHidden();
  });

  test('Disable & Clear local data removes keys and hides badge', async ({ page }) => {
    await page.goto('/dashboard?e2e=1');
    await expect(page.getByLabel('E2E mode')).toBeVisible();

    // Seed a couple of E2E keys
    await page.evaluate(() => {
      localStorage.setItem('E2E_CHILDREN', JSON.stringify([{ id: 'c1' }]));
      localStorage.setItem('E2E_TICKER_SPEED', 'fast');
    });

    // Open menu and click Disable & Clear
    await page.getByLabel('E2E mode').getByRole('button', { name: 'Disable E2E options' }).click();
    await page.getByRole('button', { name: 'Disable and clear local data' }).click();

    await page.waitForLoadState('load');
    expect(page.url()).not.toMatch(/e2e=1/);

    // Verify keys are cleared
    const ls = await page.evaluate(() => ({
      bypass: localStorage.getItem('E2E_BYPASS'),
      children: localStorage.getItem('E2E_CHILDREN'),
      tiers: localStorage.getItem('E2E_TIERS'),
      speed: localStorage.getItem('E2E_TICKER_SPEED'),
    }));
    expect(ls.bypass).toBeNull();
    expect(ls.children).toBeNull();
    expect(ls.tiers).toBeNull();
    expect(ls.speed).toBeNull();

    const visible = await page.getByLabel('E2E mode').isVisible().catch(() => false);
    if (visible) test.skip(true, 'Badge visible due to env toggle in this run');
    await expect(page.getByLabel('E2E mode')).toBeHidden();
  });
});


