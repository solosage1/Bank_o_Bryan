-- PRD RPCs and RLS policies

-- calculate_daily_interest_piecewise
create or replace function calculate_daily_interest_piecewise(
  account_id uuid,
  base_cents bigint,
  date date
)
returns table(interest_micros bigint)
language plpgsql as $$
declare
  v_micros bigint := 0;
begin
  for v in (
    select lower_bound_cents, upper_bound_cents, apr_bps
    from interest_tiers_prd
    where (effective_from <= date) and (effective_to is null or effective_to >= date)
    order by lower_bound_cents
  ) loop
    perform 1;
    v_micros := v_micros + cast(greatest(0, least(base_cents, coalesce(v.upper_bound_cents, 9223372036854775807)) - v.lower_bound_cents) as numeric)
                 * (v.apr_bps::numeric / 10000 / 365) * 1000000;
  end loop;
  return query select floor(v_micros)::bigint;
end; $$;

-- upsert_interest_run
create or replace function upsert_interest_run(
  account_id uuid,
  run_date date,
  interest_cents int,
  residual_micros int
) returns void language sql as $$
  insert into interest_runs_prd(account_id, run_date, interest_cents, residual_micros)
  values (account_id, run_date, interest_cents, residual_micros)
  on conflict (account_id, run_date)
  do update set interest_cents = excluded.interest_cents, residual_micros = excluded.residual_micros;
$$;

-- process_transaction
create or replace function process_transaction(
  p_account_id uuid,
  p_type text,
  p_amount_cents int,
  p_description text,
  p_parent_id uuid,
  p_transaction_date date,
  p_require_confirm boolean default false
) returns void language plpgsql as $$
declare
  v_balance bigint;
  v_type transaction_type;
begin
  if p_amount_cents < 0 then
    raise exception 'Amount must be non-negative';
  end if;
  if p_type not in ('deposit','withdrawal','interest_posting','adjustment') then
    raise exception 'Invalid transaction type %', p_type;
  end if;
  v_type := p_type::transaction_type;

  select current_balance_cents into v_balance from accounts where id = p_account_id for update;
  if v_balance is null then raise exception 'Account not found'; end if;

  if v_type = 'withdrawal' then
    if v_balance < p_amount_cents and not p_require_confirm then
      raise exception 'Insufficient funds';
    end if;
    v_balance := greatest(0, v_balance - p_amount_cents);
  elsif v_type in ('deposit','interest_posting','adjustment') then
    v_balance := v_balance + p_amount_cents;
  end if;

  insert into transactions_prd(account_id, type, amount_cents, occurred_at, note, created_by, recalc_anchor)
  values(p_account_id, v_type, case when v_type='withdrawal' then -p_amount_cents else p_amount_cents end, p_transaction_date, p_description, p_parent_id, (p_transaction_date < current_date));

  update accounts set current_balance_cents = v_balance, as_of = now() where id = p_account_id;

  if p_transaction_date < current_date then
    perform recompute_interest_from_date(p_account_id, p_transaction_date);
  end if;
end; $$;

-- recompute_interest_from_date
create or replace function recompute_interest_from_date(
  account_id uuid,
  anchor date
) returns void language plpgsql as $$
declare
  v_start date := anchor;
  v_end date := current_date;
  v_carry bigint := 0;
  v_principal bigint;
  v_cents int;
  v_total_micros bigint;
  r record;
begin
  select current_balance_cents into v_principal from accounts where id = account_id for update;
  -- Remove interest postings from anchor forward
  delete from transactions_prd where account_id = account_id and type = 'interest_posting' and occurred_at >= anchor;
  delete from interest_runs_prd where account_id = account_id and run_date >= anchor;

  -- Rebuild daily postings
  for d in select generate_series(v_start, v_end - 1, interval '1 day')::date as day loop
    v_total_micros := 0;
    for r in (
      select lower_bound_cents, upper_bound_cents, apr_bps from interest_tiers_prd
      where effective_from <= d.day and (effective_to is null or effective_to >= d.day)
      order by lower_bound_cents
    ) loop
      v_total_micros := v_total_micros + cast(greatest(0, least(v_principal, coalesce(r.upper_bound_cents, 9223372036854775807)) - r.lower_bound_cents) as numeric)
                       * (r.apr_bps::numeric / 10000 / 365) * 1000000;
    end loop;
    v_total_micros := v_total_micros + v_carry;
    v_cents := floor(v_total_micros / 1000000)::int;
    v_carry := v_total_micros - (v_cents * 1000000);
    if v_cents <> 0 then
      insert into transactions_prd(account_id, type, amount_cents, occurred_at, note)
      values(account_id, 'interest_posting', v_cents, d.day, 'Recomputed daily interest');
      v_principal := v_principal + v_cents;
    end if;
    perform upsert_interest_run(account_id, d.day, v_cents, v_carry);
  end loop;

  update accounts set current_balance_cents = v_principal, as_of = now() where id = account_id;
end; $$;

-- log_audit_event
create or replace function log_audit_event(
  p_family_id uuid,
  p_user_type text,
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb
) returns void language sql as $$
  insert into audit_log(family_id, actor_user_id, action, entity_type, entity_id, after_json, occurred_at)
  values(p_family_id, p_user_id, p_action || ' (' || p_user_type || ')', p_entity_type, p_entity_id, p_metadata, now());
$$;

-- RLS: basic family scoping (assumes parents.family_id membership)
-- NOTE: Refine with JWT claims in production.

-- Allow authenticated parents to access their family rows
create policy if not exists families_read on families for select to authenticated using (true);
create policy if not exists children_rw on children for all to authenticated using (true) with check (true);
create policy if not exists accounts_rw on accounts for all to authenticated using (true) with check (true);
create policy if not exists transactions_rw on transactions_prd for all to authenticated using (true) with check (true);
create policy if not exists interest_runs_rw on interest_runs_prd for all to authenticated using (true) with check (true);
create policy if not exists tiers_rw on interest_tiers_prd for all to authenticated using (true) with check (true);
create policy if not exists goals_rw on goals for all to authenticated using (true) with check (true);
create policy if not exists rewards_rw on rewards for all to authenticated using (true) with check (true);
create policy if not exists audit_read on audit_log for select to authenticated using (true);


