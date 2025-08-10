# PRD — I1: Robust E2E/Offline Fallback (Missing backend config)

## Background

- Multiple UI flows hang or deadlock when Supabase env/config or RPCs are missing.
- The code already contains partial E2E bypass hooks (`E2E_BYPASS`, `?e2e=1`, local tier store), but there’s no consistent timeout+fallback path for reads/writes, so spinners can persist and flows don’t complete.

## Objective

- Ensure the app is fully testable with no Supabase RPCs by providing:
  - Deterministic E2E mode toggle (env and/or query) that forces local simulation.
  - Consistent timeouts for all Supabase calls, then fall back to local simulation.
  - Graceful UX: no infinite spinners, clear errors, success toasts, and visible “E2E mode” banner.

## In-scope (what to change)

- Global toggle and detection
  - Add `NEXT_PUBLIC_E2E=1` as the primary switch. Preserve compatibility with existing flags: `NEXT_PUBLIC_E2E_BYPASS_AUTH=1`, `?e2e=1`, and `E2E_BYPASS=1` in `localStorage`.
  - On first navigation with `?e2e=1`, persist `E2E_BYPASS=1` to `localStorage` to keep mode active across reloads.
  - Show a persistent badge/banner “E2E mode” on all app pages when active.

- Timeouts + fallback
  - Wrap all Supabase reads/writes in a 6s default timeout (range 5–8s). If timed out, 404 RPC, or network error, use local simulators for that feature and resolve UI to success/error deterministically.

- Local simulators (localStorage)
  - Canonical keys:
    - `E2E_PARENT`, `E2E_FAMILY`, `E2E_CHILDREN`, `E2E_ACCOUNTS`, `E2E_TRANSACTIONS`, `E2E_TIERS`
  - Family:
    - If missing on E2E entry, create default:
      - `E2E_FAMILY`: `{ id: 'fam-e2e', name: 'Test Family', timezone: browserTZ, sibling_visibility: true }`
      - `E2E_PARENT`: `{ id: 'parent-e2e', family_id: 'fam-e2e', email: 'e2e@example.com', name: 'E2E Parent' }`
  - Children: CRUD entirely in localStorage in E2E.
    - Generate ids `child-{tsRand}`. Model: `{ id, family_id: 'fam-e2e', name, nickname?, age? }`
  - Accounts:
    - One per child: `{ id: 'acct-{tsRand}', child_id, balance_cents: number, as_of: ISO }`
    - Initialize to `0` cents on child creation (or keep 0 if implicit).
  - Transactions:
    - Store per-account list under `E2E_TRANSACTIONS[account_id] = Array<Txn>`
    - Txn: `{ id: 'txn-{tsRand}', account_id, type: 'deposit'|'withdrawal', amount_cents: number (sign follows type), occurred_at: 'YYYY-MM-DD', description }`
    - Apply deposit/withdraw updates to `E2E_ACCOUNTS.balance_cents` with validation (no overdraft).
  - Interest tiers:
    - Already supported by `E2E_TIERS` and `useFamilyInterestTiers`. Keep as-is with a default set if none scheduled: `[ { lower_cents: 0, upper_cents: null, apr_bps: 200 } ]` for UI.

- Guards & routing
  - `useRequireAuth`: in E2E mode, never deadlock; immediately return “ready” if `E2E_FAMILY` exists, else “needsOnboarding”.
  - Pages must render content (or empty state) even if backend is unavailable.
  - Disable realtime hooks (`useRealtime`) under E2E to avoid noise.

- UX guarantees
  - No infinite spinners. Every “loading” must either resolve to content or a deterministic error state within the timeout.
  - Toasters on success; inline errors on validation or save failures. The transaction modal must close on success.
  - “Signed out” toast on local sign-out in E2E.
  - Visible banner/badge “E2E mode”.

## Non-goals

- No attempt to mirror full backend business logic (e.g., accrual jobs). We only simulate enough for tests and basic UX.
- No server-side mocking; this is browser-only local fallback.

### Technical design

- New module: `src/lib/e2e.ts`
  - Toggle detection:
    - `isE2EEnabled(): boolean`
      - True if any of: `process.env.NEXT_PUBLIC_E2E==='1'`, `NEXT_PUBLIC_E2E_BYPASS_AUTH==='1'`, `?e2e=1`, `localStorage.E2E_BYPASS==='1'`.
      - If `?e2e=1`, persist `localStorage.E2E_BYPASS='1'`.
  - Timeout wrapper:
    - `withTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T>`
    - `supabaseWithTimeout<T>(op: () => Promise<T>, ms?: number): Promise<T>`
  - Local “DB” helpers (all noop if not in E2E):
    - `getFamily()`, `setFamily(f)`, `ensureDefaultFamily()`
    - `getChildren()`, `setChildren(list)`
    - `getAccounts()`, `setAccounts(list)`
    - `getTransactions(accountId)`, `setTransactions(accountId, list)`
    - `saveTierSet(familyId, dateKey, tiers)`, `loadCurrentTiers(familyId, today)`
  - Domain simulators (used as fallbacks):
    - `fetchChildrenWithAccounts(familyId) → ChildWithAccount[]`
    - `createChildLocally({ name, nickname? }) → { childId, accountId }`
    - `processTransactionLocally({ accountId, type, amount_cents, description, date })`
    - `fetchChildLocally(id)`, `fetchAccountLocally(childId)`, `fetchTransactionsLocally(accountId)`
    - `saveFamilySettingsLocally({ name, timezone, sibling_visibility })`
  - Event bridge:
    - Dispatch `e2e-localstorage-updated` after local writes (already used by dashboard/settings).

- Updates to existing code
  - `src/hooks/useAuth.tsx`
    - On E2E mode at init:
      - `setUser({ id: 'e2e-user' } as User)`
      - `ensureDefaultFamily()` + hydrate `E2E_PARENT`/`E2E_FAMILY`
    - Keep existing listeners for `e2e-localstorage-updated`.
  - `src/hooks/useRequireAuth.ts`
    - Keep as-is but rely on `isE2EEnabled()` and treat E2E as “ready” if family exists, else “needsOnboarding”. No redirects in E2E.
  - `src/app/(app)/dashboard/page.tsx`
    - Replace raw Supabase reads with `supabaseWithTimeout(...)` and on error/timeout use `fetchChildrenWithAccounts()`.
    - “Add Child”:
      - Try Supabase; on E2E or timeout/error: `createChildLocally()`, toast success, refresh list from local.
    - Show “E2E mode” badge in header when enabled.
  - `src/components/banking/TransactionModal.tsx`
    - Try RPC (PRD then legacy) via `supabaseWithTimeout`.
    - On E2E or timeout/error: `processTransactionLocally(...)`, then:
      - Reset form, `onSuccess()`, `onClose()`, success toast. Inline error for overdraft.
  - `src/app/(app)/child/[id]/page.tsx`
    - For child, account, transactions queries:
      - Use `supabaseWithTimeout`; on error/timeout use local getters.
      - Ensure page never shows indefinite loading; render either empty “No transactions yet.” or data.
  - `src/app/(app)/settings/page.tsx`
    - Already supports local `E2E_FAMILY` and `E2E_TIERS`. Add E2E badge and ensure save writes local and signals `e2e-localstorage-updated`.
  - `src/app/_components/Providers.tsx` (or root layouts)
    - Add `E2E` banner/badge component if `isE2EEnabled()`.
    - Implemented as `src/app/_components/E2EBadge.tsx` and injected in Providers.
  - `src/hooks/useFamilyInterestTiers.ts`
    - Already reads `E2E_TIERS` in bypass; keep behavior and default to an empty or single-tier set if none scheduled.

- Data shapes (UI-facing)
  - ChildWithAccount:
    - `{ id: string, name: string, nickname?: string, age?: number|null, account?: { id: string, child_id: string, balance: number } }`
      - Note: local account `balance_cents` stored in local DB; adapter maps to decimal `balance` for UI continuity with existing code.
  - Transaction item:
    - `{ id: string, account_id: string, amount_cents: number, type: 'deposit'|'withdrawal', occurred_at: 'YYYY-MM-DD', description: string }`

- Error states and messaging
  - Timeouts: “The server didn’t respond in time. Falling back to local mode.”
  - Over-withdrawal: inline “Insufficient funds” and disable submit.
  - Child creation failure: keep modal open; inline error plus destructive toast.
  - Sign-out in E2E: clear all `E2E_*` keys and toast “Signed out.”

- Configuration and compatibility
  - Respect existing flags: `NEXT_PUBLIC_E2E_BYPASS_AUTH`, `?e2e=1`, `E2E_BYPASS`.
  - Prefer `NEXT_PUBLIC_E2E=1` going forward but keep compatibility.

## Acceptance criteria

- Visiting `/dashboard?e2e=1` with no backend:
  - Children list loads from local storage; empty state shows “Add Child”.
  - Creating a child completes, closes modal, toasts success, and the child appears with an account.
- Deposit/withdraw in E2E:
  - Valid deposit completes, closes modal, shows success toast, and balance updates immediately.
  - Over-withdrawal shows inline error and submit is disabled.
- `/child/{id}?e2e=1`:
  - Renders child details (from local), account state, and “No transactions yet” when appropriate. No infinite loading.
- `/settings?e2e=1`:
  - Page renders; can edit family name/timezone and schedule a fixed tier set; changes persist locally and reflect on dashboard.
- Global:
  - No spinner persists beyond the timeout; fallbacks are deterministic.
  - E2E mode banner/badge is visible on all app pages.

## Test plan

- Map to doc IDs: C2, C4, C5, D1–D3, E1–E3, F1–F3, G1–G2, H1, H3 → PASS/PARTIAL under `?e2e=1`.
- A4 sign‑out: in E2E, perform local sign-out (clear `E2E_*`), redirect `/`, show “Signed out” toast.
- Update/augment Playwright flows to optionally skip network routes under `?e2e=1`, validating:
  - Dashboard empty state and add-child local path.
  - Transaction modal deposit/withdraw including inline error.
  - Child detail rendering without backend.
  - Settings local changes persisting and reflecting on dashboard.
  - E2E banner presence.

## Risks & mitigations

- Divergence between local and real RPC shapes:
  - Mitigation: centralize adapters in `e2e.ts` so UI consumes one shape.
- Masking backend bugs:
  - Mitigation: E2E mode visibly labeled and opt-in only; default remains real backend.

## Rollout

- Phase 1 (dev): Implement `e2e.ts`, wire timeouts/fallbacks into dashboard, transaction modal, child page, settings banner; manual local testing.
- Phase 2 (tests): Enable `?e2e=1` in affected E2E tests; validate acceptance criteria. Status: COMPLETE.
  - Standardized navigation via `gotoE2E(page, path)` helper (asserts E2E badge) and applied to relevant specs.
  - Comprehensive acceptance spec `tests/e2e/e2e_offline.spec.ts` validates all criteria (badge, bootstrap, timeout fallback, dashboard add‑child, transactions local path incl. overdraft/boundary, child detail existing/non‑existent, settings tiers incl. schedule/edit/delete, realtime off, persistence+signout, negatives, regression).
  - Older mocked specs retained for RPC/REST shape validation; added one optional `transactions.spec.ts` smoke that exercises E2E local fallback without mocks.
  - Evidence artifacts attached (screenshots, LS dumps, timing JSON). Non‑E2E regression test auto‑skips when env forces banner.
- Phase 3 (CI): Run E2E suite with `NEXT_PUBLIC_E2E=1` to ensure robustness without Supabase. Keep standard runs with real backend as a separate job.

## Open questions

- Should we auto-prime a default child/account in E2E for faster smoke runs, or keep empty state as the baseline?
- For backdated transactions in E2E, should we permit negative `amount_cents` via `withdrawal` only, or enforce same validation as PRD function?
- Do we want a visible “Disable E2E mode” button in the banner to clear local keys quickly?

## Definition of done

- Toggleable E2E mode with 6s timeouts in place.
- No indefinite spinners in dashboard, child detail, settings, or transaction modals.
- Local CRUD and transactions persist across reloads.
- All acceptance items validate in the browser without Supabase. Achieved via `e2e_offline.spec.ts` and updated E2E navigations across specs.

- Status update: Collected current auth, dashboard, settings, transaction, and tier flows; identified partial E2E handling already present; specified a unified E2E module with timeouts and local simulators; defined the edits needed across `useAuth`, `useRequireAuth`, `dashboard`, `TransactionModal`, `child/[id]`, and `settings`; laid out acceptance and test plan.

- Key changes and impact:
  - Add `src/lib/e2e.ts` to unify toggles, timeouts, and local simulators.
  - Wrap Supabase calls with a 6s timeout and fallback to local where applicable.
  - Ensure deterministic UI completion in E2E: add-child, deposit/withdraw, child detail, settings.
  - Add a global E2E banner and consistent toasts/errors.
  