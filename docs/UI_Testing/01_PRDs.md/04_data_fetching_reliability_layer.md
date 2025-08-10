## PRD: Data Fetching Reliability Layer (I4)

### Overview
Standardize client data access using TanStack Query with request timeouts, cancellation, unified retry/backoff, typed error surfaces, and cache invalidation. This removes indefinite spinners, makes Retry deterministic, and reduces blank pages due to hanging network calls.

### Goals
- Deterministic loading, error, and retry behavior across Dashboard, Settings, and Child routes.
- Abort in-flight requests on route change/unmount to avoid zombie updates and blank screens.
- Unified toasts and error categorization (timeout vs offline vs server) for consistent UX.
- Coherent caching and invalidation rules; clean reset on sign-out.

### Non-Goals
- Replacing Supabase client or server RPC shapes.
- Realtime streaming (covered elsewhere; remains short-circuited in E2E).

### Scope
- Introduce TanStack Query provider and tuned defaults.
- Provide a typed `supabaseQueryFn` wrapper with timeout and AbortController support.
- Migrate read flows to React Query powered hooks; keep write flows as mutations with post-success invalidations.
- Respect E2E mode: use local simulators behind the same hooks when `isE2EEnabled()`.

### Architecture
- Files
  - `src/app/_components/Providers.tsx`
    - Add `QueryClientProvider` and `HydrationBoundary` (if SSR prefetch is later needed).
    - QueryClient defaults: `{ retry: (failureCount, error) => /* see Retry Policy */, staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false }`.
  - `src/lib/queryClient.ts`
    - Export a factory `createQueryClient()` with the tuned defaults and a shared instance for the client.
  - `src/lib/fetching.ts`
    - `export type FetchErrorCategory = 'timeout' | 'offline' | 'client' | 'server' | 'unknown'`.
    - `export class TimeoutError extends Error {}`.
    - `export function categorizeError(e: unknown): FetchErrorCategory` – checks `navigator.onLine`, status codes, timeout instance.
    - `export async function supabaseQueryFn<T>(key: QueryKey, op: (signal: AbortSignal) => Promise<T>): Promise<T>` – enforces timeout via `AbortController` + `setTimeout`, forwards `signal` to the Supabase call, throws categorized errors.
    - `export const DEFAULT_TIMEOUT_MS = 6000` (configurable via env `NEXT_PUBLIC_REQUEST_TIMEOUT_MS`).
  - `src/lib/hooks/` (new folder or reuse)
    - `useFamily`, `useChildren`, `useChild`, `useAccount`, `useTransactions`, `useTiers` (read queries)
    - `useCreateChild`, `useProcessTransaction`, `useSaveFamily`, `useSaveTiers` (mutations)
    - Hooks select between Supabase and E2E local adapters based on `isE2EEnabled()`.
  - Integration helpers
    - `src/lib/e2e.ts` – reuse existing simulators for offline; no breaking changes.

- Retry Policy
  - Retries: up to 2 for `server` errors (exponential backoff starting at 500ms), 0 for `client` (4xx), 0 for `timeout` in E2E, 1 for `timeout` when not E2E, and 0 for `offline`.
  - Surfacing: show one toast after final failure with friendly messaging; inline messages remain for validation (e.g., overdraft).

- Caching & Invalidation
  - Query keys
    - `['family', familyId]`, `['children', familyId]`, `['child', childId]`, `['account', childId]`, `['transactions', accountId]`, `['tiers', familyId, dateKey]`.
  - On mutations
    - Create child: invalidate `children` and `account` for the new child.
    - Process transaction: invalidate `account` and `transactions` for the affected account.
    - Save family: invalidate `family` and `children` (names may reflect in header).
    - Save tiers: invalidate `tiers` and optionally nudge ticker refresh gate.
  - Sign-out/Reset session: `queryClient.clear()` and local E2E storage clear (if chosen), then navigate.

### Migration Plan
1) Foundation
  - Add `QueryClientProvider` to `Providers.tsx` and export a singleton query client via `createQueryClient()`.
  - Implement `fetching.ts` (timeout, categorize, supabaseQueryFn).
2) Hooks
  - Create read hooks (`useFamily`, `useChildren`, `useChild`, `useAccount`, `useTransactions`, `useTiers`) using `useQuery` with `supabaseQueryFn`.
  - Create mutation hooks with `useMutation` and targeted invalidations.
  - Wire E2E mode branches using existing `e2e.ts` adapters.
3) Integrate feature-by-feature
  - Dashboard: replace ad-hoc fetch state with hooks; pass `refetch` to Retry button; remove bespoke spinners.
  - TransactionModal: switch to `useProcessTransaction`; respect disabled states and success close.
  - Child detail: use `useChild`, `useAccount`, `useTransactions` queries with error/loading UIs; no infinite loading.
  - Settings: `useFamily` and `useSaveFamily`; `useTiers` and `useSaveTiers`.
4) Cleanup
  - Remove duplicated timeout logic where queries handle it; keep `supabaseWithTimeout` for direct non-query calls if any.
  - Ensure sign-out clears caches and local E2E data appropriately.

### Acceptance Criteria
- Loading states appear immediately (skeleton or spinner), transition to content or defined error with a working “Retry”. No indefinite spinners.
- Navigating away cancels in-flight queries; no warnings about updates to unmounted components.
- Retry behavior respects the policy and succeeds when backend is available; in E2E, Retry deterministically resolves via local adapters.
- Sign-out clears cached data and UI reflects a clean state.
- No console hydration warnings introduced by the changes.

### Test Plan
- Unit tests (Vitest)
  - `categorizeError` classification for timeout/offline/4xx/5xx/unknown.
  - `supabaseQueryFn` cancels on `AbortController.abort()` and enforces timeout.
- E2E tests (Playwright)
  - `@offline` updates in `e2e_offline.spec.ts` to verify Retry resolves via local adapters and no infinite loading.
  - `@backend` smoke for dashboard/child/settings to verify retries/backoff and working Retry button.
  - `route_stability.spec.ts`: assert skeleton → content or error within 8s and that route transitions cancel in-flight queries (no stale updates observed).
- Manual QA
  - Toggle network throttling and offline in DevTools; verify error categorization and toasts; verify that Retry recovers.

### Rollout
- Land foundation and hooks behind feature PRs; integrate per route starting with Dashboard, then Child detail, then Settings.
- Keep changes backward compatible; preserve current UI contracts while replacing fetch logic under the hood.
- After migration, remove unused bespoke fetching code.

### Risks & Mitigations
- Risk: Double handling of timeouts during migration.
  - Mitigation: Centralize in `supabaseQueryFn` and remove per-call timeouts as the route is migrated.
- Risk: Cache staleness post-mutation.
  - Mitigation: Strict invalidation keyed by family/child/account IDs; add targeted `refetch` on success handlers.
- Risk: Increased bundle size.
  - Mitigation: Only import query core; avoid SSR prefetch until needed.

### Success Metrics
- H1 and I4 test items in `01_UI_Test.md` move to PASSED.
- No indefinite spinners seen in offline/slow-network runs across core routes.
- E2E and backend suites remain green with reduced flake rate.


