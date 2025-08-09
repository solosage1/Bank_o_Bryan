# State of Play — MVP v1.1 Unification

This document summarizes current repo state and what will be kept vs replaced to align with PRD v1.1.

## Keep (to refine)

- Next.js app router structure under `src/app` and UI components under `components/ui`.
- Supabase client at `src/lib/supabase.ts` and existing hooks.
- Banking components like `TransactionModal` and `BalanceTicker` (internals will be updated to per-second ticker util).

## Replace/Rewrite

- Supabase Edge functions `accrueInterest`, `projection`, `projectionWithSim` currently use monthly interest math and legacy table names. They will be rewritten for daily Actual/365 and PRD tables (`*_prd`).
- Database schema will be unified to PRD-canonical tables via `20250807_prd_unify.sql` with compatibility views for legacy names where needed.
- Netlify config updated to publish `.next` and use esbuild bundler for functions.

## Additions

- Interest math utilities shared across client/server: piecewise tier slicing, daily micros, per-second ticker increments.
- Pages: child detail with tabs (history, projection, playground), settings, goals, rewards, audit.
- Tests: Vitest unit tests and Playwright e2e for onboarding, ledger, projections, and playground.

## Notes

- Secrets are not committed; use `.env.local` locally and set env in Netlify UI.
- Realtime channels will be standardized to `family:{id}` and `account:{id}`.
