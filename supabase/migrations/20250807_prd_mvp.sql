-- Migration: PRD-compliant schema for Bank o'Bryan (MVP v1.1)
-- DO NOT APPLY TO PRODUCTION WITHOUT REVIEW

-- Enums
DO $$ BEGIN
  CREATE TYPE transaction_type AS ENUM ('deposit','withdrawal','interest_posting','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Core entities
CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  sibling_visibility boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id)
);

CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  nickname text,
  avatar text,
  theme_color text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  current_balance_cents integer NOT NULL DEFAULT 0,
  as_of timestamptz NOT NULL DEFAULT now()
);

-- Tier config (bps = basis points)
CREATE TABLE IF NOT EXISTS interest_tiers_prd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id uuid REFERENCES children(id) ON DELETE CASCADE,
  lower_bound_cents integer NOT NULL,
  upper_bound_cents integer,
  apr_bps integer NOT NULL CHECK (apr_bps >= 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz
);

-- Transactions & accrual
CREATE TABLE IF NOT EXISTS transactions_prd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type transaction_type NOT NULL,
  amount_cents integer NOT NULL,
  occurred_at date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES parents(id),
  note text,
  recalc_anchor boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS interest_runs_prd (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  interest_cents integer NOT NULL DEFAULT 0,
  residual_micros integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, run_date)
);

-- Goals & Rewards
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount_cents integer NOT NULL,
  target_date date NOT NULL,
  emoji text,
  created_at timestamptz NOT NULL DEFAULT now(),
  achieved_at timestamptz
);

CREATE TABLE IF NOT EXISTS rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  emoji_or_image text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_txn_account_date ON transactions_prd(account_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_irun_account_date ON interest_runs_prd(account_id, run_date);
CREATE INDEX IF NOT EXISTS idx_child_family ON children(family_id);
CREATE INDEX IF NOT EXISTS idx_account_child ON accounts(child_id);
CREATE INDEX IF NOT EXISTS idx_tier_effective ON interest_tiers_prd(family_id, child_id, effective_from);

-- Default family tiers (per PRD)
INSERT INTO interest_tiers_prd (family_id, child_id, lower_bound_cents, upper_bound_cents, apr_bps)
SELECT f.id, NULL, t.lower, t.upper, t.bps
FROM families f
CROSS JOIN (VALUES
  (0,        50000,   2500),
  (50000,    150000,  2000),
  (150000,   500000,  1500),
  (500000,   1000000, 1000),
  (1000000,  NULL,     500)
) AS t(lower, upper, bps)
ON CONFLICT DO NOTHING;
