-- One-off data reset script (keeps schema, drops all app data)
-- Safe to run with service role via tools/apply_sql_via_pg_meta.mjs
-- NOTE: Does NOT clear interest_tiers_prd so rates/config persist

begin;

-- Truncate from leaves upward with CASCADE to satisfy FKs
truncate table public.transactions_prd restart identity cascade;
truncate table public.interest_runs_prd restart identity cascade;
truncate table public.accounts restart identity cascade;
truncate table public.goals restart identity cascade;
truncate table public.rewards restart identity cascade;
truncate table public.children restart identity cascade;
truncate table public.parents restart identity cascade;
truncate table public.audit_log restart identity cascade;
truncate table public.families restart identity cascade;

commit;


