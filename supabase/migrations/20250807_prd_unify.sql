-- PRD v1.1 schema unification
-- Tables
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  sibling_visibility boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists parents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  family_id uuid not null references families(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  nickname text,
  avatar text,
  theme_color text,
  created_at timestamptz not null default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  current_balance_cents bigint not null default 0,
  as_of timestamptz not null default now()
);

create table if not exists interest_tiers_prd (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid references children(id) on delete cascade,
  lower_bound_cents bigint not null,
  upper_bound_cents bigint,
  apr_bps integer not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create type transaction_type as enum ('deposit','withdrawal','interest_posting','adjustment');

create table if not exists transactions_prd (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type transaction_type not null,
  amount_cents bigint not null,
  occurred_at date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  note text,
  recalc_anchor boolean not null default false
);
create index if not exists idx_transactions_prd_account_date on transactions_prd(account_id, occurred_at);

create table if not exists interest_runs_prd (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  run_date date not null,
  interest_cents bigint not null default 0,
  residual_micros bigint not null default 0,
  created_at timestamptz not null default now(),
  unique(account_id, run_date)
);
create index if not exists idx_interest_runs_prd_account_date on interest_runs_prd(account_id, run_date);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  name text not null,
  target_amount_cents bigint not null,
  target_date date,
  emoji text,
  created_at timestamptz not null default now(),
  achieved_at timestamptz
);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  title text not null,
  description text,
  emoji_or_image text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  occurred_at timestamptz not null default now()
);

-- Compatibility view for legacy interest_tiers usage
drop view if exists interest_tiers;
create view interest_tiers as
select 
  id,
  lower_bound_cents as min_balance,
  upper_bound_cents as max_balance,
  (apr_bps::numeric / 10000.0) as annual_rate,
  true as is_active
from interest_tiers_prd
where (effective_to is null or effective_to >= current_date)
;

-- Minimal RLS scaffolding (policies to be expanded per app auth)
alter table families enable row level security;
alter table parents enable row level security;
alter table children enable row level security;
alter table accounts enable row level security;
alter table transactions_prd enable row level security;
alter table interest_runs_prd enable row level security;
alter table goals enable row level security;
alter table rewards enable row level security;
alter table audit_log enable row level security;


