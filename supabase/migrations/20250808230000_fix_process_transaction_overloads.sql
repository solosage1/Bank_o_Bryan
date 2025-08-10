-- Cleanup and permissions for process_transaction RPC

do $$ begin
  -- Drop any incorrectly ordered/typed overload that may exist in older DBs
  begin
    drop function if exists public.process_transaction(
      uuid, numeric, text, uuid, date, text
    );
  exception when undefined_function then null; end;
end $$;

-- Ensure canonical PRD signature exists (idempotent)
create or replace function public.process_transaction(
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

-- Ensure legacy decimal signature (if present) remains callable by clients that fall back
do $$ begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'process_transaction'
      and p.pronargs = 6
  ) then
    begin
      grant execute on function public.process_transaction(
        uuid, transaction_type, decimal, text, uuid, date
      ) to authenticated;
    exception when undefined_function then null; end;
  end if;
end $$;

-- Grant execute on canonical PRD RPC
do $$ begin
  begin
    grant execute on function public.process_transaction(
      uuid, text, int, text, uuid, date, boolean
    ) to authenticated;
  exception when undefined_function then null; end;
end $$;

-- Ask PostgREST to reload its schema cache so RPCs are immediately visible
select pg_notify('pgrst', 'reload schema');


