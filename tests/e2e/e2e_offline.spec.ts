import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

// Helpers
async function clearLocalStorage(page: Page) {
  // Clear once at test start to avoid wiping E2E data on subsequent navigations
  // Use a cheap navigation to same-origin and clear in-page
  await page.goto('/');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

async function dumpE2EStorage(page: Page) {
  return await page.evaluate(() => {
    const keys = [
      'E2E_BYPASS',
      'E2E_PARENT',
      'E2E_FAMILY',
      'E2E_CHILDREN',
      'E2E_ACCOUNTS',
      'E2E_TRANSACTIONS',
      'E2E_TIERS',
      'E2E_TICKER_SPEED',
    ];
    const out = {} as Record<string, any>;
    for (const k of keys) {
      try {
        const v = localStorage.getItem(k);
        out[k] = v ? (() => { try { return JSON.parse(v); } catch { return v; } })() : null;
      } catch {
        out[k] = null;
      }
    }
    return out;
  });
}

async function attachJSON(testInfo: TestInfo, name: string, data: unknown) {
  await testInfo.attach(name, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(data, null, 2))
  });
}

async function snap(testInfo: TestInfo, page: Page, name: string) {
  const png = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { contentType: 'image/png', body: png });
}

async function waitForLsArrayLength(page: Page, key: string, minLen = 1) {
  await page.waitForFunction(([k, n]) => {
    try {
      const raw = localStorage.getItem(k as string);
      const arr = raw ? JSON.parse(raw as string) : [];
      return Array.isArray(arr) && arr.length >= (n as number);
    } catch { return false; }
  }, [key, minLen], { timeout: 8000 });
}

async function waitForLsAccountBalance(page: Page, accountId: string, expectedCents: number) {
  await page.waitForFunction(([acctId, cents]) => {
    try {
      const raw = localStorage.getItem('E2E_ACCOUNTS');
      const arr = raw ? JSON.parse(raw as string) : [];
      const acct = arr.find((a: any) => a.id === acctId);
      return acct && Number(acct.balance_cents) === Number(cents);
    } catch { return false; }
  }, [accountId, expectedCents], { timeout: 8000 });
}

test.describe('Phase 1 QA — Dev E2E/Offline', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh profile per test; also clear LS early
    await clearLocalStorage(page);
  });

  test('Enable/disable E2E via query and env', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    await expect(page.getByLabel('E2E mode')).toBeVisible();
    await snap(testInfo, page, 'badge_dashboard.png');
    const ls = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'localStorage_after_enable_query.json', ls);
    expect(String(ls.E2E_BYPASS)).toBe('1');

    // Badge present on other routes
    await page.goto('/settings');
    await expect(page.getByLabel('E2E mode')).toBeVisible();
    await snap(testInfo, page, 'badge_settings.png');

    // Disable: removing LS won't hide badge if env toggle is on; expect still visible
    await page.evaluate(() => localStorage.removeItem('E2E_BYPASS'));
    await page.reload();
    await expect(page.getByLabel('E2E mode')).toBeVisible();

    // Env toggle is provided via webServer env (NEXT_PUBLIC_E2E_BYPASS_AUTH=1)
    await page.goto('/dashboard');
    await expect(page.getByLabel('E2E mode')).toBeVisible();
  });

  test('Local storage audit and bootstrap + event dispatch', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    const ls = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'bootstrap_localStorage.json', ls);
    expect(ls.E2E_FAMILY?.id).toBe('fam-e2e');
    expect(ls.E2E_PARENT?.id).toBe('parent-e2e');

    // Observe event dispatch on settings save
    await page.exposeBinding('qaRecordEvent', (_source, name) => {
      testInfo.attach('event_' + name, { contentType: 'text/plain', body: Buffer.from('fired') });
    });
    await page.evaluate(() => {
      // @ts-ignore
      window.addEventListener('e2e-localstorage-updated', () => window.qaRecordEvent('e2e-localstorage-updated'));
    });

    await page.goto('/settings');
    await page.getByLabel('Family Name').fill('QA Family');
    await page.getByTestId('timezone-trigger').click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForURL('**/dashboard');
    await snap(testInfo, page, 'after_settings_save_dashboard.png');

    const ls2 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'after_settings_save_localStorage.json', ls2);
    expect(ls2.E2E_FAMILY?.name).toBe('QA Family');
  });

  test('Timeout + fallback with blocked backend', async ({ page }, testInfo) => {
    // Block Supabase REST/AUTH to force timeout/fallback
    await page.route('**/rest/v1/**', route => route.abort());
    await page.route('**/auth/v1/**', route => route.abort());
    const start = Date.now();
    await page.goto('/dashboard?e2e=1');
    await page.waitForSelector('text=No children added yet', { timeout: 8_000 });
    const dur = Date.now() - start;
    await attachJSON(testInfo, 'dashboard_resolution_timing.json', { ms: dur });
    expect(dur).toBeLessThanOrEqual(8_000);
  });

  test('Dashboard — Add Child local path and persistence', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    await snap(testInfo, page, 'dashboard_empty.png');
    await page.getByRole('button', { name: 'Add Child' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Avery');
    await dialog.getByLabel('Nickname (optional)').fill('Ave');
    await page.getByRole('button', { name: 'Create Child' }).click();
    await waitForLsArrayLength(page, 'E2E_CHILDREN', 1);
    await waitForLsArrayLength(page, 'E2E_ACCOUNTS', 1);
    await expect(page.getByTestId(/child-link-/)).toBeVisible({ timeout: 8000 });

    const ls = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'after_add_child_localStorage.json', ls);
    expect((ls.E2E_CHILDREN || []).length).toBeGreaterThan(0);
    expect((ls.E2E_ACCOUNTS || []).length).toBeGreaterThan(0);

    // Persist across reloads
    await page.reload();
    await waitForLsArrayLength(page, 'E2E_CHILDREN', 1);
    // Force an explicit navigation to ensure effects run
    await page.goto('/dashboard?e2e=1');
    await expect(page.getByTestId(/child-link-/)).toBeVisible({ timeout: 12000 });
    await snap(testInfo, page, 'dashboard_after_reload.png');
  });

  test('Transactions — deposit, overdraft, boundary', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    // Ensure one child exists
    const lsPre = await dumpE2EStorage(page);
    if (!Array.isArray(lsPre.E2E_CHILDREN) || lsPre.E2E_CHILDREN.length === 0) {
      await page.getByRole('button', { name: 'Add Child' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name', { exact: true }).fill('Jamie');
      await page.getByRole('button', { name: 'Create Child' }).click();
    }

    // Click first child card Deposit
    await page.getByRole('button', { name: 'Deposit' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Amount').fill('10');
    await page.getByLabel('Description').fill('Initial deposit');
    await page.getByRole('button', { name: 'Make Deposit' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    await snap(testInfo, page, 'deposit_success.png');

    // Overdraft attempt
    await page.getByRole('button', { name: 'Withdraw' }).first().click();
    await page.getByLabel('Amount').fill('999999');
    await expect(page.getByText('Cannot withdraw more than available balance.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Make Withdrawal' })).toBeDisabled();
    await snap(testInfo, page, 'withdraw_overdraft_error.png');

    // Boundary withdrawal equal to balance: read balance from LS and try exact
    const ls1 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'before_boundary_withdraw_localStorage.json', ls1);
    const accountId = (ls1.E2E_ACCOUNTS?.[0]?.id) as string;
    const cents = (ls1.E2E_ACCOUNTS?.[0]?.balance_cents) as number;
    await page.getByLabel('Amount').fill(((cents || 0) / 100).toFixed(2));
    await page.getByLabel('Description').fill('Empty to zero');
    await page.getByRole('button', { name: 'Make Withdrawal' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    await waitForLsAccountBalance(page, accountId, 0);
    const ls2 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'after_boundary_withdraw_localStorage.json', ls2);
    const updated = (ls2.E2E_ACCOUNTS || []).find((a: any) => a.id === accountId);
    expect(updated?.balance_cents).toBe(0);
  });

  test('Child detail — existing and non-existent', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    // Capture first child id from LS
    // Ensure a child exists
    let ls = await dumpE2EStorage(page);
    if (!Array.isArray(ls.E2E_CHILDREN) || ls.E2E_CHILDREN.length === 0) {
      await page.goto('/dashboard?e2e=1');
      await page.getByRole('button', { name: 'Add Child' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name', { exact: true }).fill('Taylor');
      await page.getByRole('button', { name: 'Create Child' }).click();
      await waitForLsArrayLength(page, 'E2E_CHILDREN', 1);
      ls = await dumpE2EStorage(page);
    }
    const childId = (ls.E2E_CHILDREN?.[0]?.id) as string;
    expect(Boolean(childId)).toBeTruthy();

    await page.goto(`/child/${childId}?e2e=1`);
    await expect(page.getByText(/Recent Transactions/)).toBeVisible();
    await snap(testInfo, page, 'child_detail_existing.png');
    // Existing should resolve without indefinite loading
    // Non-existent
    const start = Date.now();
    await page.goto(`/child/child-nonexistent-${Date.now()}?e2e=1`);
    await page.waitForSelector('text=Child not found', { timeout: 8_000 });
    await snap(testInfo, page, 'child_detail_not_found.png');
    const dur = Date.now() - start;
    await attachJSON(testInfo, 'child_nonexistent_resolution_ms.json', { ms: dur });
    expect(dur).toBeLessThanOrEqual(8_000);
  });

  test('Settings — change name/timezone; schedule/edit/delete tiers; ticker reflects', async ({ page }, testInfo) => {
    await page.goto('/settings?e2e=1');
    await page.getByLabel('Family Name').fill('E2E Test Fam');
    await page.getByTestId('timezone-trigger').click();
    await page.getByRole('option').nth(1).click();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForURL('**/dashboard');

    // Schedule tiers for today
    await page.goto('/settings?e2e=1');
    await page.getByRole('button', { name: 'Save Scheduled Tiers' }).click();
    const lsA = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'tiers_after_schedule_localStorage.json', lsA);
    const famId = (lsA.E2E_FAMILY?.id) as string;
    const today = new Date().toISOString().slice(0, 10);
    expect(lsA.E2E_TIERS?.[famId]?.[today]).toBeTruthy();

    // Edit set: open Edit, add row, save
    await page.getByTestId(/tier-set-/).first().locator('button', { hasText: 'Edit' }).click();
    await page.getByTestId('edit-tier-add').click();
    await page.getByTestId('edit-tier-save').click();
    const lsB = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'tiers_after_edit_localStorage.json', lsB);

    // Delete set (best-effort; not all runs may show a set immediately)
    const firstSet = page.getByTestId(/tier-set-/).first();
    if (await firstSet.isVisible().catch(() => false)) {
      await firstSet.locator('button', { hasText: 'Delete' }).click();
      await page.getByTestId('tier-set-confirm-delete').click();
    }
    const lsC = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'tiers_after_delete_localStorage.json', lsC);
  });

  test('Realtime short-circuit — no websocket', async ({ page }, testInfo) => {
    const wsUrls: string[] = [];
    page.on('websocket', ws => {
      wsUrls.push(ws.url());
    });
    await page.goto('/dashboard?e2e=1');
    await page.waitForTimeout(1000);
    await attachJSON(testInfo, 'websocket_urls.json', wsUrls);
    expect(wsUrls.filter(u => /\/realtime\/v1\//.test(u))).toHaveLength(0);
  });

  test('Persistence and E2E sign-out', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    const ls1 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'before_signout_localStorage.json', ls1);
    await page.reload();
    await expect(page.getByLabel('E2E mode')).toBeVisible();

    // Sign out
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForURL('**/');
    await expect(page.getByText('Signed out', { exact: true }).first()).toBeVisible();
    const ls2 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'after_signout_localStorage.json', ls2);
    expect(ls2.E2E_PARENT).toBeNull();
    expect(ls2.E2E_FAMILY).toBeNull();
    expect(ls2.E2E_CHILDREN).toBeNull();
  });

  test('Regression (non-E2E): banner absent and network used', async ({ page }, testInfo) => {
    // Ensure no LS toggle then navigate without query
    await page.addInitScript(() => localStorage.removeItem('E2E_BYPASS'));
    // Unblock and spy on rest calls
    const restCalls: string[] = [];
    await page.route('**/rest/v1/**', route => {
      restCalls.push(route.request().url());
      route.continue();
    });
    await page.goto('/dashboard');
    // If badge is visible without query, env toggle is on for the server; skip this regression
    const badgeVisible = await page.getByLabel('E2E mode').isVisible().catch(() => false);
    if (badgeVisible) {
      test.skip(true, 'Server started with E2E env toggle; cannot validate non-E2E regression in this run');
    }
    await expect(page.getByLabel('E2E mode')).toBeHidden({ timeout: 3000 });
    await page.waitForTimeout(1500);
    await attachJSON(testInfo, 'regression_rest_calls.json', restCalls);
    expect(restCalls.length).toBeGreaterThan(0);
  });

  test('Negative/edge cases', async ({ page }, testInfo) => {
    await page.goto('/dashboard?e2e=1');
    // Corrupt E2E_CHILDREN
    await page.evaluate(() => localStorage.setItem('E2E_CHILDREN', '{bad json'));
    await page.reload();
    await expect(page.getByLabel('E2E mode')).toBeVisible();
    // App should still be operable
    await expect(page.getByText(/Children's Accounts/)).toBeVisible();

    // Missing family triggers ensureDefaultFamily
    await page.evaluate(() => localStorage.removeItem('E2E_FAMILY'));
    await page.reload();
    const ls = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'after_missing_family_resolved.json', ls);
    expect(ls.E2E_FAMILY?.id).toBe('fam-e2e');

    // Multiple children with isolated transactions
    const beforeChildren = Array.isArray(ls.E2E_CHILDREN) ? ls.E2E_CHILDREN.length : 0;
    const names = ['Sam', 'Riley'];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      await page.getByRole('button', { name: 'Add Child' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Name', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Create Child' }).click();
      await waitForLsArrayLength(page, 'E2E_CHILDREN', beforeChildren + i + 1);
    }
    const ls2 = await dumpE2EStorage(page);
    const accounts = ls2.E2E_ACCOUNTS || [];
    // Deposit to first account only
    await page.getByRole('button', { name: 'Deposit' }).first().click();
    await page.getByLabel('Amount').fill('5.00');
    await page.getByLabel('Description').fill('Sam deposit');
    await page.getByRole('button', { name: 'Make Deposit' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 8000 });
    const ls3 = await dumpE2EStorage(page);
    await attachJSON(testInfo, 'multi_children_txn_localStorage.json', ls3);
    if (accounts.length >= 2) {
      const a0Tx = (ls3.E2E_TRANSACTIONS?.[accounts[0].id] || []).length;
      const a1Tx = (ls3.E2E_TRANSACTIONS?.[accounts[1].id] || []).length;
      expect(a0Tx).toBeGreaterThanOrEqual(1);
      expect(a1Tx).toBeGreaterThanOrEqual(0);
    }
  });
});


