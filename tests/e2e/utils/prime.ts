import type { Page } from '@playwright/test';

export async function primeBypassAndFamily(
  page: Page,
  opts: { familyName?: string; timezone?: string } = {}
) {
  const { familyName = 'E2E Family', timezone = 'America/New_York' } = opts;
  await page.addInitScript(([name, tz]) => {
    try {
      localStorage.setItem('E2E_BYPASS', '1');
      localStorage.setItem('E2E_PARENT', JSON.stringify({ id: 'p-e2e', name: 'E2E Parent' }));
      localStorage.setItem(
        'E2E_FAMILY',
        JSON.stringify({ id: 'fam-e2e', name, timezone: tz, sibling_visibility: true, created_at: '' })
      );
    } catch {}
  }, [familyName, timezone]);
}


