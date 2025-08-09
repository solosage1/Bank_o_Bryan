# PRD Compliance Checklist (v1.1)

- [ ] Personas: Parent (Admin, Google OAuth), Child (read-only)
- [ ] Family + Children CRUD
- [ ] Ledger (deposit/withdraw/backdating)
- [ ] Tiered APR, Actual/365 daily accrual & posting
- [ ] Per-second visual ticker with periodic rebase
- [ ] Child Detail: History, Projection, Playground
- [ ] Goals & Rewards
- [ ] Settings (sibling visibility, timezone, precision, reduced motion)
- [ ] Audit trail, Analytics events
- [ ] Realtime propagation ≤ 250 ms P95
- [ ] Unit + E2E tests green
- [ ] Netlify deploy shows working app

## Deployment environment checklist (Netlify + Supabase)

- NEXT_PUBLIC_SUPABASE_URL: set to your Supabase project URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY: set to your project anon public key
- NEXT_PUBLIC_SITE_URL: set to the production site origin (e.g., <https://bankobryan.netlify.app>)

- Supabase Auth → Settings → URL Configuration:
  - Site URL: matches NEXT_PUBLIC_SITE_URL
  - Redirect URLs: include `${SITE_URL}/auth/callback`
- Netlify environment variables set for all contexts (Production, Deploy Previews, Branch deploys)
- SSR hardening:
  - Do not rely on undefined env; render client-only fallbacks instead of throwing which can cause 502s
  - Add friendly error toasts for OAuth pop‑up/cookie issues
