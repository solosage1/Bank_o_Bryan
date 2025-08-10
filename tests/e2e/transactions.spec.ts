import { test, expect, Request } from '@playwright/test';
import { primeBypassAndFamily, gotoE2E } from './utils/prime';

function isChildrenGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/children/.test(req.url());
}

function isRpcProcessTransaction(req: Request) {
  return req.method() === 'POST' && /\/rest\/v1\/rpc\/process_transaction/.test(req.url());
}

test.describe('@backend Transactions: deposit and withdrawal', () => {
  test('deposit: submit valid form closes modal, toasts, and updates UI', async ({ page }) => {
    await primeBypassAndFamily(page);
    await page.goto('/onboarding?e2e=1');

    // Seed one child with an account and balance 0
    await page.route('**/rest/v1/children*', async (route, req) => {
      if (isChildrenGet(req)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'child-1', name: 'Avery', account: { id: 'acct-1', child_id: 'child-1', balance: 0, total_earned: 0 } }
          ])
        });
      }
      return route.fallback();
    });

    // Intercept RPC and return success
    await page.route('**/rest/v1/rpc/process_transaction', async (route, req) => {
      if (isRpcProcessTransaction(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'tx-1' }]) });
      }
      return route.fallback();
    });

    await page.goto('/dashboard');

    // Open Deposit
    await page.getByRole('button', { name: /Deposit/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /Make Deposit/i });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Amount').fill('10');
    await dialog.getByLabel('Description').fill('Birthday gift');

    // Date defaults to today via form defaultValues; no need to open picker

    // Submit
    await dialog.getByRole('button', { name: /Make Deposit/i }).click();
    await expect(page.getByRole('dialog', { name: /Make Deposit/i })).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Deposit of $10.00 processed for Avery.', { exact: true }).first()).toBeVisible();
  });

  test('withdrawal: insufficient funds blocks submit, then valid amount succeeds', async ({ page }) => {
    await primeBypassAndFamily(page);
    await page.goto('/onboarding?e2e=1');

    await page.route('**/rest/v1/children*', async (route, req) => {
      if (isChildrenGet(req)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'child-2', name: 'Sky', account: { id: 'acct-2', child_id: 'child-2', balance: 5, total_earned: 0 } }
          ])
        });
      }
      return route.fallback();
    });

    await page.route('**/rest/v1/rpc/process_transaction', async (route, req) => {
      if (isRpcProcessTransaction(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'tx-2' }]) });
      }
      return route.fallback();
    });

    await page.goto('/dashboard');

    // Open Withdraw
    await page.getByRole('button', { name: /Withdraw/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /Make Withdrawal/i });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Amount').fill('10');
    await dialog.getByLabel('Description').fill('Snack');
    // Date defaults to today via form defaultValues; no need to open picker

    // Button disabled due to insufficient funds
    await expect(dialog.getByRole('button', { name: /Make Withdrawal/i })).toBeDisabled();

    // Fix to valid amount
    await dialog.getByLabel('Amount').fill('3');
    await expect(dialog.getByRole('button', { name: /Make Withdrawal/i })).toBeEnabled();
    await dialog.getByRole('button', { name: /Make Withdrawal/i }).click();
    await expect(page.getByRole('dialog', { name: /Make Withdrawal/i })).toBeHidden({ timeout: 10000 });
    await expect(page.getByText('Withdrawal of $3.00 processed for Sky.', { exact: true }).first()).toBeVisible();
  });

  test('e2e local fallback: deposit works without RPC mocks (smoke)', async ({ page }) => {
    // No network mocks here; rely on Dev E2E local path
    await primeBypassAndFamily(page);
    await gotoE2E(page, '/dashboard');

    // Ensure at least one child exists in E2E
    const noChildren = await page.getByText(/No children added yet/i).isVisible().catch(() => false);
    if (noChildren) {
      await page.getByRole('button').filter({ hasText: /Add (Your First )?Child/i }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Name', { exact: true }).fill('E2E Tx');
      await page.getByRole('button', { name: /Create Child/i }).click();
      await expect(dialog).toBeHidden({ timeout: 8000 });
    }

    // Read pre-count of transactions for first account
    const pre = await page.evaluate(() => {
      try {
        const accounts = JSON.parse(localStorage.getItem('E2E_ACCOUNTS') || '[]');
        const accountId = accounts[0]?.id;
        const txns = JSON.parse(localStorage.getItem('E2E_TRANSACTIONS') || '{}');
        const count = accountId ? (txns[accountId]?.length || 0) : 0;
        return { accountId, count };
      } catch { return { accountId: null, count: 0 }; }
    });

    // Make a small deposit via UI
    await page.getByRole('button', { name: /Deposit/i }).first().click();
    const dep = page.getByRole('dialog');
    await expect(dep).toBeVisible();
    await dep.getByLabel('Amount').fill('1.00');
    await dep.getByLabel('Description').fill('E2E smoke');
    await dep.getByRole('button', { name: /Make Deposit/i }).click();
    await expect(dep).toBeHidden({ timeout: 20000 });

    // Assert localStorage updated for that account
    if (pre.accountId) {
      await page.waitForFunction(([acctId, before]) => {
        try {
          const txns = JSON.parse(localStorage.getItem('E2E_TRANSACTIONS') || '{}');
          const count = (txns[acctId as string]?.length || 0);
          return count > (before as number);
        } catch { return false; }
      }, [pre.accountId, pre.count], { timeout: 8000 });
    }
  });
});


