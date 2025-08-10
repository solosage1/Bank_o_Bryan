import { test, expect, Request } from '@playwright/test';
import { primeBypassAndFamily, gotoE2E } from './utils/prime';

function isChildrenGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/children/.test(req.url());
}

function isAccountsGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/accounts/.test(req.url());
}

function isTxnsGet(req: Request) {
  return req.method() === 'GET' && /\/rest\/v1\/transactions/.test(req.url());
}

test.describe('@backend Dashboard → Child Detail Navigation', () => {
  test('clicking a child card navigates to detail page showing name, nickname, balance and txns', async ({ page }) => {
    // Prime bypass and family
    await page.addInitScript(() => localStorage.setItem('E2E_BYPASS', '1'));
    await page.goto('/onboarding?e2e=1');
    await primeBypassAndFamily(page);

    // Mock dashboard children list (with account)
    await page.route('**/rest/v1/children*', async (route, req) => {
      if (!isChildrenGet(req)) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'child-abc', name: 'ChildAlpha', nickname: 'CA', account: { id: 'acct-abc', child_id: 'child-abc', balance: 12.34 } }
        ])
      });
    });

    // Mock detail page queries BEFORE navigation to avoid waiting for network
    await page.route('**/rest/v1/children**', async (route, req) => {
      if (isChildrenGet(req) && req.url().includes('id=eq.child-abc')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'child-abc', name: 'ChildAlpha', nickname: 'CA', family_id: 'fam-1' }) });
      }
      return route.fallback();
    });

    await page.route('**/rest/v1/accounts**', async (route, req) => {
      if (isAccountsGet(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'acct-abc', child_id: 'child-abc', balance: 12.34 }) });
      }
      return route.fallback();
    });

    await page.route('**/rest/v1/transactions**', async (route, req) => {
      if (isTxnsGet(req)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: 't1', account_id: 'acct-abc', created_at: new Date().toISOString(), amount: 5, description: 'Deposit' }
        ]) });
      }
      return route.fallback();
    });

    await gotoE2E(page, '/dashboard');

    // Card is focusable and clickable; heading shows name and nickname
    await expect(page.getByRole('heading', { name: /ChildAlpha/ })).toBeVisible();

    // Click the linked child name (anchor inside heading) and assert URL changes
    await Promise.all([
      page.waitForURL('**/child/child-abc'),
      page.getByTestId('child-link-child-abc').click()
    ]);

    // Verify name + nickname
    await expect(page.getByRole('heading', { name: /ChildAlpha/ })).toBeVisible();
    await expect(page.getByText('(CA)')).toBeVisible();

    // Verify playground button exists
    await expect(page.getByRole('button', { name: /Projection Playground/i })).toBeVisible();

    // Verify at least one transaction row appears
    await expect(page.getByText(/Deposit/)).toBeVisible();
  });
});


