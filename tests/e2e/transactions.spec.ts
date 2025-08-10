import { test, expect, Request } from '@playwright/test';
import { primeBypassAndFamily } from './utils/prime';

function isChildrenGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/children/.test(req.url());
}

function isRpcProcessTransaction(req: Request) {
  return req.method() === 'POST' && /\/rest\/v1\/rpc\/process_transaction/.test(req.url());
}

test.describe('Transactions: deposit and withdrawal', () => {
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
});


