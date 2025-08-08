import { test, expect } from '@playwright/test';

test.describe('Sign-in CTA', () => {
  test('Clicking Continue with Google initiates OAuth (navigates or opens popup)', async ({ page, context }) => {
    await page.goto('/');

    const cta = page.getByRole('button', { name: /Continue with Google/i });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    // In E2E bypass, we navigate to /oauth/stub
    const navPromise = page.waitForNavigation({ url: /\/oauth\/stub$/ }).catch(() => null);

    await cta.click();

    const nav = await navPromise;
    expect(nav).not.toBeNull();
  });
});


