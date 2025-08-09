/*
  Remove duplicate PRD tables to avoid drift.
  Safe to apply multiple times.
*/

-- Drop PRD tables if they exist
DO $$
BEGIN
  IF to_regclass('public.interest_tiers_prd') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.interest_tiers_prd CASCADE';
  END IF;
  IF to_regclass('public.transactions_prd') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.transactions_prd CASCADE';
  END IF;
  IF to_regclass('public.interest_runs_prd') IS NOT NULL THEN
    EXECUTE 'DROP TABLE IF EXISTS public.interest_runs_prd CASCADE';
  END IF;
END $$;

-- Optional: ensure legacy tables have RLS enabled (do not change existing policies)
-- ALTER TABLE interest_tiers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE interest_runs ENABLE ROW LEVEL SECURITY;


