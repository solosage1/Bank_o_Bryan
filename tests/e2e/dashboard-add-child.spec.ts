import { test, expect, Page, Request } from '@playwright/test';

async function primeBypass(page: Page) {
  await page.addInitScript(() => localStorage.setItem('E2E_BYPASS', '1'));
}

function isChildrenPost(req: Request) {
  return req.method() === 'POST' && /\/rest\/v1\/children/.test(req.url());
}

function isAccountsPost(req: Request) {
  return req.method() === 'POST' && /\/rest\/v1\/accounts/.test(req.url());
}

function isChildrenGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/children/.test(req.url());
}

test.describe('Dashboard Add Child', () => {
  test('success: create child + account closes modal, toasts, and list refreshes', async ({ page }) => {
    await primeBypass(page);

    // Step 1: ensure auth bypass sets a user by loading onboarding first
    await page.goto('/onboarding?e2e=1');

    // Intercept pre-list GET: initially empty
    await page.route('**/rest/v1/children**', async (route, req) => {
      if (isChildrenGet(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (isChildrenPost(req)) {
        // Return a single object to align with supabase-js .single() semantics
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'child-123', name: 'Avery', family_id: 'fam-1', age: 12, nickname: 'Ave' })
        });
      }
      return route.fallback();
    });

    await page.route('**/rest/v1/accounts**', async (route, req) => {
      if (isAccountsPost(req)) {
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: 'acct-123', child_id: 'child-123' }]) });
      }
      return route.fallback();
    });

    // After creation, children GET should include the new child with account
    let created = false;
    await page.route('**/rest/v1/children*select=*', async (route, req) => {
      if (!isChildrenGet(req)) return route.fallback();
      if (created) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'child-123', name: 'Avery', age: 12, nickname: 'Ave', account: { id: 'acct-123', child_id: 'child-123', balance: 0, total_earned: 0 } }
          ])
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/dashboard');
    // Be precise to avoid strict-mode ambiguity among multiple Children headings
    await expect(page.getByRole('heading', { level: 2, name: /Children/ })).toBeVisible();

    // Open modal
    await page.getByRole('button', { name: /Add Child/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('Avery');
    await page.getByLabel(/Age/i).fill('12');
    await page.getByLabel(/Nickname/i).fill('Ave');

    // Submit
    await page.getByRole('button', { name: /Create Child/i }).click();
    created = true; // flip for subsequent GET

    // Modal closes and toast shown
    await expect(dialog).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Child created', { exact: true })).toBeVisible();

    // New child appears
    await expect(page.getByRole('heading', { name: 'Avery' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Deposit/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Withdraw/i })).toBeVisible();
  });

  test('error: child insert 500 -> inline error + destructive toast; modal stays open', async ({ page }) => {
    await primeBypass(page);
    await page.goto('/onboarding?e2e=1');

    await page.route('**/rest/v1/children**', async (route, req) => {
      if (isChildrenGet(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
      if (isChildrenPost(req)) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'insert failed' }) });
      }
      return route.fallback();
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Add Child/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('Jordan');
    await page.getByRole('button', { name: /Create Child/i }).click();

    await expect(dialog).toBeVisible();
    // Scope assertion to the dialog to avoid matching toast text
    await expect(dialog.getByText(/Failed to create child/i)).toBeVisible();
  });

  test('partial failure: account insert 500 -> success toast + list refresh shows Create Account', async ({ page }) => {
    await primeBypass(page);
    await page.goto('/onboarding?e2e=1');

    await page.route('**/rest/v1/children**', async (route, req) => {
      if (isChildrenGet(req)) {
        // After creation, return child without account
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'child-xyz', name: 'Sky', account: null }]) });
      }
      if (isChildrenPost(req)) {
        // Return a single object to align with supabase-js .single() semantics
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'child-xyz', name: 'Sky' }) });
      }
      return route.fallback();
    });

    await page.route('**/rest/v1/accounts**', async (route, req) => {
      if (isAccountsPost(req)) {
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'account failed' }) });
      }
      return route.fallback();
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Add Child/i }).click();
    await page.getByLabel('Name', { exact: true }).fill('Sky');
    await page.getByRole('button', { name: /Create Child/i }).click();

    // Modal closes; toast shown; card appears with Create Account button
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Child created', { exact: true })).toBeVisible();
    const createAccount = page.getByRole('button', { name: /Create Account/i });
    await expect(createAccount).toBeVisible();
  });
});


