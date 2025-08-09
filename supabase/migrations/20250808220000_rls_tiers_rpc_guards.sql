-- RLS guards for tier RPCs and parent-scoped CRUD

-- Parents can read their own row (for auth.uid() membership checks)
do $$ begin
  alter table public.parents enable row level security;
exception when undefined_table then null; end $$;

do $$ begin
  create policy parents_self_read
  on public.parents for select to authenticated
  using (auth.uid() = auth_user_id);
exception when duplicate_object then null; end $$;

-- RLS on interest_tiers_prd (parent-scoped CRUD)
do $$ begin
  alter table public.interest_tiers_prd enable row level security;
exception when undefined_table then null; end $$;

do $$ begin
  create policy interest_tiers_read
  on public.interest_tiers_prd for select to authenticated
  using (exists (
    select 1 from public.parents p
    where p.family_id = interest_tiers_prd.family_id
      and p.auth_user_id = auth.uid()
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_insert
  on public.interest_tiers_prd for insert to authenticated
  with check (exists (
    select 1 from public.parents p
    where p.family_id = interest_tiers_prd.family_id
      and p.auth_user_id = auth.uid()
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_update
  on public.interest_tiers_prd for update to authenticated
  using (exists (
    select 1 from public.parents p
    where p.family_id = interest_tiers_prd.family_id
      and p.auth_user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.parents p
    where p.family_id = interest_tiers_prd.family_id
      and p.auth_user_id = auth.uid()
  ));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy interest_tiers_delete
  on public.interest_tiers_prd for delete to authenticated
  using (exists (
    select 1 from public.parents p
    where p.family_id = interest_tiers_prd.family_id
      and p.auth_user_id = auth.uid()
  ));
exception when duplicate_object then null; end $$;

-- Amend RPCs to add membership guards
create or replace function public.replace_interest_tier_set(
  p_family_id uuid,
  p_effective_from date,
  p_rows jsonb
) returns setof public.interest_tiers_prd
language plpgsql
security invoker
as $$
declare
  v_count int;
begin
  if not exists (
    select 1 from public.parents p
    where p.family_id = p_family_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Not authorized to manage tiers for this family' using errcode = '28000';
  end if;
  -- existing body continues unchanged (see prior migration)
  -- re-validate and replace per 20250808213000_tiers_rpc.sql
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array of rows';
  end if;
  create temporary table if not exists _tmp_tiers (
    lower_bound_cents bigint not null,
    upper_bound_cents bigint,
    apr_bps int not null
  ) on commit drop;
  truncate table _tmp_tiers;
  insert into _tmp_tiers(lower_bound_cents, upper_bound_cents, apr_bps)
  select lower_bound_cents, upper_bound_cents, apr_bps
  from jsonb_to_recordset(p_rows) as x(lower_bound_cents bigint, upper_bound_cents bigint, apr_bps int);
  select count(*) into v_count from _tmp_tiers;
  if v_count = 0 then raise exception 'At least one tier row is required'; end if;
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
  delete from public.interest_tiers_prd where family_id = p_family_id and effective_from = p_effective_from;
  insert into public.interest_tiers_prd (family_id, child_id, lower_bound_cents, upper_bound_cents, apr_bps, effective_from)
  select p_family_id, null, lower_bound_cents, upper_bound_cents, apr_bps, p_effective_from from _tmp_tiers order by lower_bound_cents;
  return query select * from public.interest_tiers_prd where family_id = p_family_id and effective_from = p_effective_from order by lower_bound_cents;
end $$;

create or replace function public.delete_interest_tier_set(
  p_family_id uuid,
  p_effective_from date
) returns int
language plpgsql
security invoker
as $$
declare v_deleted int; begin
  if not exists (
    select 1 from public.parents p
    where p.family_id = p_family_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'Not authorized to manage tiers for this family' using errcode = '28000';
  end if;
  with del as (
    delete from public.interest_tiers_prd where family_id = p_family_id and effective_from = p_effective_from returning 1
  ) select count(*) into v_deleted from del;
  return coalesce(v_deleted, 0);
end $$;


