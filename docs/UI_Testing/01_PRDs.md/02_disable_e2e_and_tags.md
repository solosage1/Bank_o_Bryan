## PRD: “Disable E2E” Quick Action and Test Tagging (@offline/@backend)

### Overview
Add a small UX affordance in the existing E2E badge to quickly turn off E2E mode, with an option to also clear local test data. Introduce Playwright test tags to filter runs between offline (E2E/local) and backend (RPC/REST-backed) suites without duplicating specs.

### Goals
- Provide an in-app control to disable E2E mode without manual URL editing.
- Optionally clear all `E2E_*` local storage keys to reset test data.
- Allow Playwright configurations to filter tests by `@offline` and `@backend` tags to keep CI and local runs focused and fast.

### Non-Goals
- No redesign of the badge or broader header layout.
- No changes to existing E2E logic other than adding disable/clear actions.
- No migration of existing specs unless tagging meaningfully partitions them.

### User Stories
- As a tester using `/dashboard?e2e=1`, I can click the E2E badge and disable E2E, keeping my current route, so I can quickly verify backend behavior.
- As a tester, I can disable E2E and clear local data in one click to reset the app to a clean state.
- As a CI maintainer, I can run only offline-tagged tests or exclude them for backend runs using config-level filters.

### UX Behavior
- Location: inside the existing `E2E mode` badge (small pill).
- Controls:
  - Button “Disable E2E options” opens a small menu.
  - Menu actions:
    - “Disable E2E” (primary)
    - “Disable and clear local data” (secondary)
- Accessibility:
  - Badge retains `aria-label="E2E mode"`.
  - Buttons have accessible labels and focus states.
- Feedback:
  - Toast on disable: “E2E disabled”.
  - Toast on disable & clear: “E2E disabled and local test data cleared”.

### Technical Design
- Files
  - `src/app/_components/E2EBadge.tsx` (edit): add inline controls for disable actions. Guard with `typeof window !== 'undefined'` to avoid SSR issues.
  - `src/lib/e2e.ts` (new): reusable helpers
    - `disableE2E(): void`
      - Remove `localStorage.E2E_BYPASS` if present.
      - Remove `e2e=1` from the current URL while preserving other params and path.
      - Use client navigation `router.replace(urlWithoutE2E)`; then schedule `location.reload()` as a fallback timeout to ensure a clean reload.
      - Show toast: “E2E disabled”.
    - `clearE2ELocalData(): void`
      - Remove keys: `E2E_BYPASS`, `E2E_PARENT`, `E2E_FAMILY`, `E2E_CHILDREN`, `E2E_ACCOUNTS`, `E2E_TRANSACTIONS`, `E2E_TIERS`, `E2E_TICKER_SPEED`.
      - Dispatch `window.dispatchEvent(new Event('e2e-localstorage-updated'))`.
    - `disableE2EAndClear(): void`
      - Calls `clearE2ELocalData()` then `disableE2E()`; toast: “E2E disabled and local test data cleared”.
- Integration
  - Use `next/navigation` router in client-only code paths.
  - Use existing `useToast` hook for toasts.
- Safety
  - No SSR regressions: conditionally render controls only on client.
  - Idempotent operations: missing keys removal is safe.

### Test Tagging and Config Filters
- Tagging convention (examples):
  - `test.describe('@offline Dashboard — Add Child', ...)`
  - `test('@backend Transactions RPC payload ...', ...)`
- Application
  - Add `@offline` to offline-only acceptance specs, preferably at top-level `describe`.
  - Add `@backend` where RPC/REST shape or a real backend is required.
- Configs
  - `playwright.e2e.offline.config.ts`
    - Option A (opt-in): `grep: /@offline/` to run only explicitly tagged offline tests.
    - Option B (status quo): run all e2e tests with E2E forced. If adopting tags, prefer Option A for speed and clarity.
  - `playwright.e2e.backend.config.ts`
    - Use `grepInvert: /@offline/` to exclude offline-only tests while including general/untagged and `@backend` tests.
- CI
  - Offline CI job uses offline config; backend job uses backend config. Artifacts unchanged.

### Acceptance Criteria
- Badge quick action
  - Clicking “Disable E2E” removes `E2E_BYPASS`, strips `?e2e=1`, navigates to the same route without the param, and shows a toast. E2E banner disappears.
  - Clicking “Disable and clear local data” additionally clears all `E2E_*` keys, dispatches `e2e-localstorage-updated`, navigates as above, and shows a toast.
  - Works on Dashboard, Child detail, and Settings without console errors or hydration warnings.
- Test tagging and config
  - Offline run executes only `@offline` tests when `grep` is set; otherwise current behavior remains stable.
  - Backend run excludes `@offline` tests and executes backend/intended specs.
  - CI stays green in both workflows.

### Test Plan
- Manual
  - Navigate to `/dashboard?e2e=1`; click “Disable E2E” → URL drops `e2e=1`, badge disappears, toast shown.
  - Repeat with “Disable & Clear local data” → `localStorage` inspected shows no `E2E_*` keys; a `e2e-localstorage-updated` event is fired.
- Automated (Playwright)
  - Add a lightweight UI test under `tests/e2e/` tagged `@offline` to toggle the badge and assert URL/toast changes.
  - Confirm `pnpm e2e:offline` runs only `@offline` tests when `grep` is configured.
  - Run backend workflow and verify `@offline` tests are excluded.

### Risks and Mitigations
- Risk: Unintended reload loops if URL handling is incorrect.
  - Mitigation: Build URL with `URL` API, only strip `e2e` param, and guard repeated calls.
- Risk: Breaking SSR by accessing `window` on server.
  - Mitigation: Render controls only when `typeof window !== 'undefined'`.
- Risk: Confusing test partitions.
  - Mitigation: Document tagging rules and enforce with lint or PR review checklist.

### Rollout
- Land UI changes and helper module.
- Tag a minimal set of core specs. Expand tagging gradually.
- Update CI configs (`.github/workflows/e2e-offline.yml`, `.github/workflows/e2e-backend.yml`) if adopting `grep`.
- Add usage notes to `docs/UI_Testing/01_PRDs.md/01_phase_1_DEV_E2E.md` linking to this PRD.

### Open Questions
- Should offline config run only tagged tests (`grep`) or all tests with E2E forced? Defaulting to `grep` is recommended for clarity/speed.
- Do we want a small dropdown in the badge or two inline buttons? Start with two inline actions; refactor to dropdown if space-constrained.


