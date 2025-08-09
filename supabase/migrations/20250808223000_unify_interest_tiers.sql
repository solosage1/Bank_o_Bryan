-- Unify interest tiers on a single canonical table: public.interest_tiers

-- 1) If interest_tiers exists as a legacy table, rename it aside
do $$ begin
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interest_tiers'
  ) then
    -- Try to detect legacy shape by presence of min_balance column
    if exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = 'interest_tiers' and column_name = 'min_balance'
    ) then
      execute 'alter table public.interest_tiers rename to interest_tiers_legacy';
    end if;
  end if;
exception when others then null; end $$;

-- 2) Drop view named interest_tiers if present
do $$ begin
  execute 'drop view if exists public.interest_tiers';
exception when undefined_table then null; end $$;

-- 3) If interest_tiers_prd exists, rename to interest_tiers
do $$ begin
  if exists (
    select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interest_tiers_prd'
  ) then
    execute 'alter table public.interest_tiers_prd rename to interest_tiers';
  end if;
exception when others then null; end $$;

-- 4) Ensure canonical table exists
create table if not exists public.interest_tiers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  lower_bound_cents bigint not null,
  upper_bound_cents bigint,
  apr_bps integer not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create index if not exists idx_interest_tiers_family_effective_lower on public.interest_tiers(family_id, effective_from, lower_bound_cents);

-- 5) RLS policies on interest_tiers (parent-scoped CRUD)
do $$ begin
  alter table public.interest_tiers enable row level security;
exception when undefined_table then null; end $$;

do $$ begin
  create policy interest_tiers_read on public.interest_tiers for select to authenticated
  using (exists (select 1 from public.parents p where p.family_id = interest_tiers.family_id and p.auth_user_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_insert on public.interest_tiers for insert to authenticated
  with check (exists (select 1 from public.parents p where p.family_id = interest_tiers.family_id and p.auth_user_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_update on public.interest_tiers for update to authenticated
  using (exists (select 1 from public.parents p where p.family_id = interest_tiers.family_id and p.auth_user_id = auth.uid()))
  with check (exists (select 1 from public.parents p where p.family_id = interest_tiers.family_id and p.auth_user_id = auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_delete on public.interest_tiers for delete to authenticated
  using (exists (select 1 from public.parents p where p.family_id = interest_tiers.family_id and p.auth_user_id = auth.uid()));
exception when duplicate_object then null; end $$;

-- 6) Recreate RPCs to operate on public.interest_tiers
create or replace function public.replace_interest_tier_set(
  p_family_id uuid,
  p_effective_from date,
  p_rows jsonb
) returns setof public.interest_tiers
language plpgsql
security invoker
as $$
declare v_count int; begin
  if not exists (select 1 from public.parents p where p.family_id = p_family_id and p.auth_user_id = auth.uid()) then
    raise exception 'Not authorized to manage tiers for this family' using errcode = '28000';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array of rows'; end if;
  create temporary table if not exists _tmp_tiers (
    lower_bound_cents bigint not null,
    upper_bound_cents bigint,
    apr_bps int not null
  ) on commit drop;
  truncate table _tmp_tiers;
  insert into _tmp_tiers(lower_bound_cents, upper_bound_cents, apr_bps)
  select lower_bound_cents, upper_bound_cents, apr_bps from jsonb_to_recordset(p_rows) as x(lower_bound_cents bigint, upper_bound_cents bigint, apr_bps int);
  select count(*) into v_count from _tmp_tiers; if v_count = 0 then raise exception 'At least one tier row is required'; end if;
  if (select min(lower_bound_cents) from _tmp_tiers) <> 0 then raise exception 'First tier must start at 0 cents'; end if;
  if exists (select 1 from _tmp_tiers where apr_bps < 0 or apr_bps > 100000) then raise exception 'apr_bps must be between 0 and 100000 basis points'; end if;
  with ord as (
    select lower_bound_cents, upper_bound_cents, row_number() over(order by lower_bound_cents) rn, lead(lower_bound_cents) over(order by lower_bound_cents) next_lower, count(*) over() cnt from _tmp_tiers
  ) select 1 from ord where rn < cnt and (upper_bound_cents is null or upper_bound_cents <> next_lower) into v_count;
  if v_count is not null then raise exception 'Tiers must be contiguous without gaps/overlaps'; end if;
  with ord as (
    select lower_bound_cents, upper_bound_cents, row_number() over(order by lower_bound_cents) rn, count(*) over() cnt from _tmp_tiers
  ) select 1 from ord where rn = cnt and upper_bound_cents is not null and upper_bound_cents <= lower_bound_cents into v_count;
  if v_count is not null then raise exception 'Last tier upper bound must be null (unbounded) or greater than lower bound'; end if;
  perform pg_advisory_xact_lock(hashtext(p_family_id::text || ':' || p_effective_from::text));
  delete from public.interest_tiers where family_id = p_family_id and effective_from = p_effective_from;
  insert into public.interest_tiers (family_id, child_id, lower_bound_cents, upper_bound_cents, apr_bps, effective_from)
  select p_family_id, null, lower_bound_cents, upper_bound_cents, apr_bps, p_effective_from from _tmp_tiers order by lower_bound_cents;
  return query select * from public.interest_tiers where family_id = p_family_id and effective_from = p_effective_from order by lower_bound_cents;
end $$;

create or replace function public.delete_interest_tier_set(
  p_family_id uuid,
  p_effective_from date
) returns int
language plpgsql
security invoker
as $$
declare v_deleted int; begin
  if not exists (select 1 from public.parents p where p.family_id = p_family_id and p.auth_user_id = auth.uid()) then
    raise exception 'Not authorized to manage tiers for this family' using errcode = '28000';
  end if;
  with del as (delete from public.interest_tiers where family_id = p_family_id and effective_from = p_effective_from returning 1)
  select count(*) into v_deleted from del;
  return coalesce(v_deleted, 0);
end $$;

-- 7) Cleanup: drop the PRD table name if it still exists (after rename/create above)
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'interest_tiers_prd') then
    execute 'drop table public.interest_tiers_prd cascade';
  end if;
exception when others then null; end $$;


