## PRD: Accessibility, Keyboard Navigation, Responsive Layout, and Clipboard Robustness (I5)

### Overview
Address the remaining key gaps to move C3 (Children list accessibility), H2 (Keyboard/focus), H4 (Responsive layout), and I3 (Clipboard permissions) to PASSED. This PRD standardizes interactive semantics, focus management, responsive breakpoints, and copy-link fallbacks while keeping changes small, typed, and lint-clean.

### Goals
- Ensure all primary interactive elements are keyboard-operable with visible focus and correct semantics.
- Provide consistent responsive behavior across mobile, tablet, and desktop without layout breakage.
- Make the “Copy link” action robust to restricted clipboard permissions, with graceful feedback and no crashes.

### Non-Goals
- End-to-end offline/back-end behavior (covered by I1/I4).
- Full WCAG audit or screen-reader narrative redesign; this targets the high-impact gaps observed in tests.

### Scope
1) Accessibility & Keyboard (C3, H2)
- Children cards
  - Ensure the card title/link area activates navigation via Enter/Space.
  - Use `button` or `Link` with role semantics instead of generic `div` click handlers.
  - Provide `aria-label` on the copy-link icon button including the child name.
- Global focus management
  - Ensure visible focus rings via `:focus-visible` on buttons/links, including icon-only buttons.
  - Add a “Skip to content” link at the top of the app shell that targets the main landmark.
- Landmarks and headings
  - Verify `main` landmark per page and a single h1 per route, matching visible page title.
- Toaster
  - Announce success/failure using `aria-live="polite"` if not already.

2) Responsive Layout (H4)
- Establish target breakpoints: sm (≥640px), md (≥768px), lg (≥1024px).
- Dashboard
  - Children grid: 1 column on small, 2 on md, 3+ on lg; ensure cards wrap without overflow.
  - Header actions (Settings, Sign out) wrap or collapse on small viewports without overlap.
- Settings
  - Use single-column form on small screens; two columns on md+; inputs stack properly.
- Child detail
  - Header and actions wrap appropriately; details and sidebar stack on small and split on md+.

3) Clipboard Robustness (I3)
- Implement a safe copy abstraction:
  - Try `navigator.clipboard.writeText` when available and permitted.
  - Fallback to a hidden, temporarily selected `textarea` and `document.execCommand('copy')` when permissions are denied or API unavailable.
  - Provide deterministic feedback: success toast “Link copied” or non-blocking info toast “Copy not permitted — please copy manually.”
  - Never throw; log once to console at debug level.

### Technical Design
- Files likely touched
  - `src/app/(app)/dashboard/page.tsx` (children list rendering; card/link semantics)
  - `src/app/(app)/child/[id]/page.tsx` (header actions semantics)
  - `src/app/(app)/settings/page.tsx` (form layout responsiveness)
  - `src/app/layout.tsx` and/or `src/app/(app)/layout.tsx` (skip link, main landmark)
  - `src/app/_components/Providers.tsx` (ensure toasts are `aria-live` polite)
  - `src/components/ui/button.tsx` or icon button patterns (focus-visible styles)
  - `src/components/banking/BalanceTicker.tsx`/child card component (if exists) for icon-button labels
  - `src/lib/utils.ts` (add `copyToClipboard(text: string): Promise<'success'|'denied'|'unsupported'>`)

- Accessibility & Keyboard
  - Replace clickable `div` with `Link` or `button` elements.
  - For `button`-like components, ensure `type="button"`, `aria-label` where text is not visible, and Space/Enter activation.
  - Add `tabIndex={0}` only when necessary; prefer native focusable elements.
  - Use Tailwind classes `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary` across interactive components.
  - Add a skip link: an absolutely-positioned link shown on focus that navigates to `#main-content`.

- Responsive Layout
  - Tailwind grid utilities for the dashboard cards: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`.
  - Settings form uses `grid grid-cols-1 md:grid-cols-2 gap-6` with fields spanning columns as needed.
  - Child detail layout stacks sections on small and splits on md+ using `md:flex` or `md:grid`.

- Clipboard Abstraction
  - `copyToClipboard` implementation:
    - Try permissions: `navigator.permissions?.query({ name: 'clipboard-write' as PermissionName })` if available to preflight.
    - Attempt `navigator.clipboard.writeText(text)`; on failure, run fallback textarea method.
    - Return a result enum that the UI maps to distinct toasts.
  - Update child card copy link action to use this helper and show appropriate toast.

### Acceptance Criteria
- C3 (Children list and accessibility) → PASSED
  - Child cards are keyboard-activatable via Enter/Space; copy-link icon button is reachable with a visible focus ring and has an `aria-label` including the child name.
  - Axe checks on dashboard show no critical violations; at most minor warnings unrelated to scope.
- H2 (Keyboard/focus) → PASSED
  - Skip link is present and functional; focus rings visible on all major actionable controls.
  - Playwright keyboard navigation spec passes (tab/shift-tab cycles through expected elements; Enter/Space activate).
- H4 (Responsive layout) → PASSED
  - Dashboard, Settings, and Child detail render without layout breakage at 360px, 768px, 1024px, and 1440px widths.
  - No horizontal scrollbars on mobile baseline pages except where content requires explicit overflow containers.
- I3 (Clipboard permissions) → PASSED
  - Copy link succeeds when allowed; shows success toast.
  - When denied or unsupported, shows info toast and does not crash.

### Test Plan
- Automated (Playwright)
  - `tests/e2e/accessibility_keyboard.spec.ts` (`@offline`): tab through dashboard, activate a child card via Enter/Space, verify focus rings (CSS snapshot or attribute checks), copy link via keyboard and assert toast.
  - `tests/e2e/responsive_layout.spec.ts` (no tag or `@offline`): run at multiple viewports using `test.use({ viewport })` across dashboard/settings/child detail; assert no horizontal scroll and key elements visible.
  - `tests/e2e/clipboard.spec.ts` (`@offline`): mock `navigator.clipboard` to throw and ensure fallback path shows info toast; test the success path when available.
- Automated (Axe)
  - Add an Axe run on dashboard in CI (can be a lightweight check using `@axe-core/playwright`) and fail on critical violations.
- Manual QA
  - Keyboard-only pass across dashboard/settings/child; verify focus order and activation.
  - Resize browser to the target widths; check layout integrity and wrap behavior.

### Rollout
- Land helper `copyToClipboard` and update child card action.
- Add skip link, focus-visible styles, and adjust semantics in child cards and header actions.
- Update responsive classes in dashboard/settings/child routes.
- Add Playwright specs and optional Axe check; tag with `@offline` where appropriate.

### Risks & Mitigations
- Risk: Over-aggressive focus outlines may clash with design.
  - Mitigation: Use `focus-visible` only and match design tokens for ring color.
- Risk: Clipboard fallback may be blocked by strict CSP.
  - Mitigation: Use minimal textarea insertion and remove immediately; detect CSP and surface info toast.
- Risk: Responsive changes could affect screenshot diffs.
  - Mitigation: Update visual baselines if used; communicate breakpoints in PR description.

### Success Metrics
- C3, H2, H4, I3 in `01_UI_Test.md` move to PASSED.
- Zero crashes from copy-link across browsers; <0.5% error rate in Sentry (if enabled).
- No critical Axe violations introduced on the dashboard.


