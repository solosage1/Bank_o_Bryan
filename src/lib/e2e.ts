/*
  E2E/Offline helpers
  - Toggle detection with safe browser guards
  - Timeout wrappers for Supabase ops
  - Local storage helpers and domain simulators for E2E fallback
*/

export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Returns true if E2E mode is enabled via env, query, or localStorage.
 * Persists E2E_BYPASS=1 to localStorage when `?e2e=1` is present on the client.
 */
export function isE2EEnabled(): boolean {
  const envToggle =
    process.env.NEXT_PUBLIC_E2E === '1' ||
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === '1';
  if (typeof window === 'undefined') {
    // On server, only env toggles are observable
    return Boolean(envToggle);
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const queryToggle = params.get('e2e') === '1';
    if (queryToggle) {
      try {
        window.localStorage.setItem('E2E_BYPASS', '1');
      } catch {}
    }
    const lsToggle = window.localStorage.getItem('E2E_BYPASS') === '1';
    return Boolean(envToggle || queryToggle || lsToggle);
  } catch {
    return Boolean(envToggle);
  }
}

/**
 * Wraps a promise with a timeout. Rejects with TimeoutError when expired.
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  let timer: any;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Executes an async operation with a timeout using withTimeout.
 */
export function supabaseWithTimeout<T>(op: () => Promise<T>, ms = 6000): Promise<T> {
  return withTimeout(op(), ms);
}

// Local storage keys
export const E2E_KEYS = {
  PARENT: 'E2E_PARENT',
  FAMILY: 'E2E_FAMILY',
  CHILDREN: 'E2E_CHILDREN',
  ACCOUNTS: 'E2E_ACCOUNTS',
  TRANSACTIONS: 'E2E_TRANSACTIONS',
  TIERS: 'E2E_TIERS'
} as const;

type LocalFamily = { id: string; name: string; timezone: string; sibling_visibility: boolean };
type LocalParent = { id: string; family_id: string; email: string; name: string };
type LocalChild = { id: string; family_id: string; name: string; nickname?: string | null; age?: number | null };
type LocalAccount = { id: string; child_id: string; balance_cents: number; as_of: string };
type LocalTxn = { id: string; account_id: string; type: 'deposit' | 'withdrawal'; amount_cents: number; occurred_at: string; description: string };

function dispatchLocalStorageUpdated(): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event('e2e-localstorage-updated')); } catch {}
}

function getBrowserTZ(): string {
  if (typeof window === 'undefined') return 'America/New_York';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/** Ensures a default family/parent exist in localStorage under E2E. */
export function ensureDefaultFamily(): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  try {
    const famRaw = window.localStorage.getItem(E2E_KEYS.FAMILY);
    const parRaw = window.localStorage.getItem(E2E_KEYS.PARENT);
    if (famRaw && parRaw) return;
    const family: LocalFamily = {
      id: 'fam-e2e',
      name: 'Test Family',
      timezone: getBrowserTZ(),
      sibling_visibility: true
    };
    const parent: LocalParent = {
      id: 'parent-e2e',
      family_id: 'fam-e2e',
      email: 'e2e@example.com',
      name: 'E2E Parent'
    };
    window.localStorage.setItem(E2E_KEYS.FAMILY, JSON.stringify(family));
    window.localStorage.setItem(E2E_KEYS.PARENT, JSON.stringify(parent));
    dispatchLocalStorageUpdated();
  } catch {}
}

// Generic LS accessors (no-ops when not E2E)
export function getFamily(): LocalFamily | null {
  if (!isE2EEnabled() || typeof window === 'undefined') return null;
  try { return JSON.parse(window.localStorage.getItem(E2E_KEYS.FAMILY) || 'null'); } catch { return null; }
}

export function setFamily(f: LocalFamily): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  window.localStorage.setItem(E2E_KEYS.FAMILY, JSON.stringify(f));
  dispatchLocalStorageUpdated();
}

export function getChildren(): LocalChild[] {
  if (!isE2EEnabled() || typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(E2E_KEYS.CHILDREN) || '[]'); } catch { return []; }
}

export function setChildren(list: LocalChild[]): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  window.localStorage.setItem(E2E_KEYS.CHILDREN, JSON.stringify(list));
  dispatchLocalStorageUpdated();
}

export function getAccounts(): LocalAccount[] {
  if (!isE2EEnabled() || typeof window === 'undefined') return [];
  try { return JSON.parse(window.localStorage.getItem(E2E_KEYS.ACCOUNTS) || '[]'); } catch { return []; }
}

export function setAccounts(list: LocalAccount[]): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  window.localStorage.setItem(E2E_KEYS.ACCOUNTS, JSON.stringify(list));
  dispatchLocalStorageUpdated();
}

export function getTransactions(accountId: string): LocalTxn[] {
  if (!isE2EEnabled() || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(E2E_KEYS.TRANSACTIONS);
    const all: Record<string, LocalTxn[]> = raw ? JSON.parse(raw) : {};
    return all[accountId] || [];
  } catch { return []; }
}

export function setTransactions(accountId: string, list: LocalTxn[]): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(E2E_KEYS.TRANSACTIONS);
  const all: Record<string, LocalTxn[]> = raw ? JSON.parse(raw) : {};
  all[accountId] = list;
  window.localStorage.setItem(E2E_KEYS.TRANSACTIONS, JSON.stringify(all));
  dispatchLocalStorageUpdated();
}

export function saveTierSet(familyId: string, dateKey: string, tiers: Array<{ lower_cents: number; upper_cents: number | null; apr_bps: number }>): void {
  if (!isE2EEnabled() || typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(E2E_KEYS.TIERS);
  const all = raw ? JSON.parse(raw) : {};
  all[familyId] = all[familyId] || {};
  all[familyId][dateKey] = tiers;
  window.localStorage.setItem(E2E_KEYS.TIERS, JSON.stringify(all));
  dispatchLocalStorageUpdated();
}

export function loadCurrentTiers(familyId: string, todayISO: string): Array<{ lower_cents: number; upper_cents: number | null; apr_bps: number }> {
  if (!isE2EEnabled() || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(E2E_KEYS.TIERS);
    const all: Record<string, Record<string, Array<{ lower_cents: number; upper_cents: number | null; apr_bps: number }>>> = raw ? JSON.parse(raw) : {};
    const byDate = all[familyId] || {};
    const dates = Object.keys(byDate).filter(d => d <= todayISO).sort().reverse();
    return dates.length ? (byDate[dates[0]] || []) : [];
  } catch {
    return [];
  }
}

// Domain simulators (UI-facing adapters)

/** Returns children with account summary, mapping balance cents to decimal dollars. */
export async function fetchChildrenWithAccounts(familyId: string): Promise<Array<{ id: string; name: string; nickname?: string | null; age?: number | null; account?: { id: string; child_id: string; balance: number } }>> {
  if (!isE2EEnabled()) return [];
  const children = getChildren().filter(c => !familyId || c.family_id === familyId);
  const accounts = getAccounts();
  const accountByChild = new Map(accounts.map(a => [a.child_id, a]));
  return children.map(c => {
    const acct = accountByChild.get(c.id);
    return {
      id: c.id,
      name: c.name,
      nickname: c.nickname ?? null,
      age: c.age ?? null,
      account: acct ? { id: acct.id, child_id: acct.child_id, balance: (acct.balance_cents || 0) / 100 } : undefined
    };
  });
}

/** Creates a child and account locally (balance 0). */
export async function createChildLocally(input: { name: string; nickname?: string }): Promise<{ childId: string; accountId: string }> {
  if (!isE2EEnabled()) throw new Error('E2E mode not enabled');
  const now = Date.now();
  const childId = `child-${now}-${Math.floor(Math.random() * 1000)}`;
  const accountId = `acct-${now}-${Math.floor(Math.random() * 1000)}`;
  const children = getChildren();
  const accounts = getAccounts();
  const family = getFamily() || { id: 'fam-e2e' } as LocalFamily;
  const child: LocalChild = { id: childId, family_id: family.id, name: input.name, nickname: input.nickname ?? null, age: null };
  const acct: LocalAccount = { id: accountId, child_id: childId, balance_cents: 0, as_of: new Date().toISOString() };
  children.push(child);
  accounts.push(acct);
  setChildren(children);
  setAccounts(accounts);
  return { childId, accountId };
}

/** Processes a transaction locally, validating positive amounts and no overdraft. */
export async function processTransactionLocally(args: { accountId: string; type: 'deposit' | 'withdrawal'; amount_cents: number; description: string; date: string }): Promise<void> {
  if (!isE2EEnabled()) throw new Error('E2E mode not enabled');
  const { accountId, type, amount_cents, description, date } = args;
  if (!(amount_cents > 0)) throw new Error('Amount must be greater than 0');
  const accounts = getAccounts();
  const account = accounts.find(a => a.id === accountId);
  if (!account) throw new Error('Account not found');
  const sign = type === 'deposit' ? 1 : -1;
  const newBalance = account.balance_cents + sign * amount_cents;
  if (newBalance < 0) throw new Error('Insufficient funds');
  account.balance_cents = newBalance;
  account.as_of = new Date().toISOString();
  setAccounts(accounts);
  const txns = getTransactions(accountId);
  const txn: LocalTxn = { id: `txn-${Date.now()}-${Math.floor(Math.random() * 1000)}`, account_id: accountId, type, amount_cents, occurred_at: date, description };
  txns.unshift(txn);
  setTransactions(accountId, txns);
}

/** Fetches a child by id from local storage. */
export async function fetchChildLocally(id: string): Promise<{ id: string; name: string; nickname: string | null; family_id: string | null } | null> {
  if (!isE2EEnabled()) return null;
  const c = getChildren().find(ch => ch.id === id);
  if (!c) return null;
  return { id: c.id, name: c.name, nickname: c.nickname ?? null, family_id: c.family_id ?? null };
}

/** Fetches an account by child id from local storage. */
export async function fetchAccountLocally(childId: string): Promise<{ id: string; child_id: string; balance: number } | null> {
  if (!isE2EEnabled()) return null;
  const acct = getAccounts().find(a => a.child_id === childId);
  if (!acct) return null;
  return { id: acct.id, child_id: acct.child_id, balance: (acct.balance_cents || 0) / 100 };
}

/** Fetches recent transactions for an account id from local storage. */
export async function fetchTransactionsLocally(accountId: string): Promise<Array<{ id: string; account_id: string; created_at: string; amount: number; description: string | null }>> {
  if (!isE2EEnabled()) return [];
  const txns = getTransactions(accountId);
  return txns.map(t => ({ id: t.id, account_id: t.account_id, created_at: t.occurred_at, amount: (t.amount_cents || 0) / 100 * (t.type === 'withdrawal' ? -1 : 1), description: t.description || null }));
}

export { dispatchLocalStorageUpdated };

/** Removes E2E_BYPASS and strips `e2e=1` from the URL, then reloads (browser-only). */
export function disableE2E(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem('E2E_BYPASS');
  } catch {}
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('e2e')) {
      url.searchParams.delete('e2e');
      // Preserve hash
      const nextHref = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}${url.hash || ''}`;
      window.history.replaceState(null, '', nextHref);
    }
  } catch {}
  try {
    // Force a full reload to ensure all client state is reset
    window.location.reload();
  } catch {}
}

/** Clears all known E2E_* keys and dispatches the `e2e-localstorage-updated` event. */
export function clearE2ELocalData(): void {
  if (typeof window === 'undefined') return;
  const keysToClear = [
    'E2E_BYPASS',
    'E2E_PARENT',
    'E2E_FAMILY',
    'E2E_CHILDREN',
    'E2E_ACCOUNTS',
    'E2E_TRANSACTIONS',
    'E2E_TIERS',
    'E2E_TICKER_SPEED',
  ];
  try {
    for (const key of keysToClear) {
      try { window.localStorage.removeItem(key); } catch {}
    }
  } finally {
    dispatchLocalStorageUpdated();
  }
}

/** Clears E2E local data and then disables E2E (browser-only). */
export function disableE2EAndClear(): void {
  if (typeof window === 'undefined') return;
  try { clearE2ELocalData(); } catch {}
  try { disableE2E(); } catch {}
}


