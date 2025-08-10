

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."transaction_type" AS ENUM (
    'deposit',
    'withdrawal',
    'interest_posting',
    'adjustment'
);


ALTER TYPE "public"."transaction_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_daily_interest"("account_balance" numeric, "account_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  tier_rate decimal := 0;
  daily_rate decimal;
  daily_interest decimal;
BEGIN
  -- Find the appropriate interest tier
  SELECT annual_rate INTO tier_rate
  FROM interest_tiers
  WHERE is_active = true
    AND account_balance >= min_balance
    AND (max_balance IS NULL OR account_balance <= max_balance)
  ORDER BY min_balance DESC
  LIMIT 1;

  -- Calculate daily interest (annual rate / 365)
  daily_rate := tier_rate / 365.0;
  daily_interest := account_balance * daily_rate;
  
  -- Round to 2 decimal places
  RETURN ROUND(daily_interest, 2);
END;
$$;


ALTER FUNCTION "public"."calculate_daily_interest"("account_balance" numeric, "account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_daily_interest_piecewise"("account_id" "uuid", "base_cents" bigint, "date" "date") RETURNS TABLE("interest_micros" bigint)
    LANGUAGE "plpgsql"
    AS $$
declare
  v_micros bigint := 0;
  v record;
begin
  for v in (
    select lower_bound_cents, upper_bound_cents, apr_bps
    from interest_tiers_prd
    where (effective_from <= date) and (effective_to is null or effective_to >= date)
    order by lower_bound_cents
  ) loop
    v_micros := v_micros + cast(greatest(0, least(base_cents, coalesce(v.upper_bound_cents, 9223372036854775807)) - v.lower_bound_cents) as numeric)
                 * (v.apr_bps::numeric / 10000 / 365) * 1000000;
  end loop;
  return query select floor(v_micros)::bigint;
end; $$;


ALTER FUNCTION "public"."calculate_daily_interest_piecewise"("account_id" "uuid", "base_cents" bigint, "date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare v_deleted int; begin
  if not exists (select 1 from public.parents p where p.family_id = p_family_id and p.auth_user_id = auth.uid()) then
    raise exception 'Not authorized to manage tiers for this family' using errcode = '28000';
  end if;
  with del as (delete from public.interest_tiers where family_id = p_family_id and effective_from = p_effective_from returning 1)
  select count(*) into v_deleted from del;
  return coalesce(v_deleted, 0);
end $$;


ALTER FUNCTION "public"."delete_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_audit_event"("p_family_id" "uuid", "p_user_type" "text", "p_user_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into audit_log(family_id, actor_user_id, action, entity_type, entity_id, after_json, occurred_at)
  values(p_family_id, p_user_id, p_action || ' (' || p_user_type || ')', p_entity_type, p_entity_id, p_metadata, now());
$$;


ALTER FUNCTION "public"."log_audit_event"("p_family_id" "uuid", "p_user_type" "text", "p_user_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."onboard_family"("p_name" "text", "p_timezone" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_parent public.parents%rowtype;
  v_family_id uuid;
begin
  -- If the caller already has a parent row, return the existing family_id
  select * into v_parent from public.parents where auth_user_id = auth.uid();
  if found then
    return v_parent.family_id;
  end if;

  -- Create a new family and parent row atomically
  insert into public.families(name, timezone)
  values (coalesce(nullif(trim(p_name), ''), 'My Family'), coalesce(nullif(trim(p_timezone), ''), 'America/Los_Angeles'))
  returning id into v_family_id;

  insert into public.parents(auth_user_id, family_id)
  values (auth.uid(), v_family_id);

  -- Best-effort audit; do not fail onboarding if audit fails
  begin
    perform public.log_audit_event(
      v_family_id,
      'parent',
      auth.uid(),
      'Created family ' || coalesce(nullif(trim(p_name), ''), 'My Family'),
      'family',
      v_family_id,
      jsonb_build_object('timezone', p_timezone)
    );
  exception when others then
    -- swallow
    null;
  end;

  return v_family_id;
end;
$$;


ALTER FUNCTION "public"."onboard_family"("p_name" "text", "p_timezone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "public"."transaction_type", "p_amount" numeric, "p_description" "text", "p_parent_id" "uuid" DEFAULT NULL::"uuid", "p_transaction_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  current_balance decimal;
  new_balance decimal;
  transaction_id uuid;
BEGIN
  -- Get current balance with row lock
  SELECT balance INTO current_balance
  FROM accounts
  WHERE id = p_account_id
  FOR UPDATE;

  -- Calculate new balance
  IF p_type = 'deposit' OR p_type = 'interest' THEN
    new_balance := current_balance + p_amount;
  ELSIF p_type = 'withdrawal' THEN
    new_balance := current_balance - p_amount;
    IF new_balance < 0 THEN
      RAISE EXCEPTION 'Insufficient funds. Current balance: %, Withdrawal amount: %', current_balance, p_amount;
    END IF;
  END IF;

  -- Update account balance
  UPDATE accounts 
  SET balance = new_balance, updated_at = now()
  WHERE id = p_account_id;

  -- Insert transaction record
  INSERT INTO transactions (account_id, type, amount, balance_after, description, parent_id, transaction_date)
  VALUES (p_account_id, p_type, p_amount, new_balance, p_description, p_parent_id, p_transaction_date)
  RETURNING id INTO transaction_id;

  RETURN transaction_id;
END;
$$;


ALTER FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "public"."transaction_type", "p_amount" numeric, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "text", "p_amount_cents" integer, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date", "p_require_confirm" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "text", "p_amount_cents" integer, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date", "p_require_confirm" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recompute_interest_from_date"("account_id" "uuid", "anchor" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_start date := anchor;
  v_end date := current_date;
  v_carry bigint := 0;
  v_principal bigint;
  v_cents int;
  v_total_micros bigint;
  r record;
  d record;
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


ALTER FUNCTION "public"."recompute_interest_from_date"("account_id" "uuid", "anchor" "date") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."interest_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "child_id" "uuid",
    "lower_bound_cents" bigint NOT NULL,
    "upper_bound_cents" bigint,
    "apr_bps" integer NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_to" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interest_tiers" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date", "p_rows" "jsonb") RETURNS SETOF "public"."interest_tiers"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."replace_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date", "p_rows" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_interest_run"("account_id" "uuid", "run_date" "date", "interest_cents" integer, "residual_micros" integer) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into interest_runs_prd(account_id, run_date, interest_cents, residual_micros)
  values (account_id, run_date, interest_cents, residual_micros)
  on conflict (account_id, run_date)
  do update set interest_cents = excluded.interest_cents, residual_micros = excluded.residual_micros;
$$;


ALTER FUNCTION "public"."upsert_interest_run"("account_id" "uuid", "run_date" "date", "interest_cents" integer, "residual_micros" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "current_balance_cents" integer DEFAULT 0 NOT NULL,
    "as_of" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before_json" "jsonb",
    "after_json" "jsonb",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."children" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "nickname" "text",
    "avatar" "text",
    "theme_color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."children" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "sibling_visibility" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."families" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "target_amount_cents" integer NOT NULL,
    "target_date" "date" NOT NULL,
    "emoji" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "achieved_at" timestamp with time zone
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_date" "date" NOT NULL,
    "accounts_processed" integer DEFAULT 0,
    "total_interest_paid" numeric(12,2) DEFAULT 0.00,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text",
    CONSTRAINT "interest_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."interest_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interest_tiers_legacy" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "min_balance" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "max_balance" numeric(12,2),
    "annual_rate" numeric(5,4) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "check_balance_range" CHECK ((("max_balance" IS NULL) OR ("max_balance" > "min_balance"))),
    CONSTRAINT "interest_tiers_annual_rate_check" CHECK ((("annual_rate" >= (0)::numeric) AND ("annual_rate" <= (1)::numeric)))
);


ALTER TABLE "public"."interest_tiers_legacy" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "emoji_or_image" "text",
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "type" "public"."transaction_type" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "balance_after" numeric(12,2) NOT NULL,
    "description" "text" NOT NULL,
    "parent_id" "uuid",
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transactions_balance_after_check" CHECK (("balance_after" >= (0)::numeric))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_runs"
    ADD CONSTRAINT "interest_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_runs"
    ADD CONSTRAINT "interest_runs_run_date_key" UNIQUE ("run_date");



ALTER TABLE ONLY "public"."interest_tiers_legacy"
    ADD CONSTRAINT "interest_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interest_tiers"
    ADD CONSTRAINT "interest_tiers_prd_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_account_child" ON "public"."accounts" USING "btree" ("child_id");



CREATE INDEX "idx_accounts_child_id" ON "public"."accounts" USING "btree" ("child_id");



CREATE INDEX "idx_child_family" ON "public"."children" USING "btree" ("family_id");



CREATE INDEX "idx_children_family_id" ON "public"."children" USING "btree" ("family_id");



CREATE INDEX "idx_interest_runs_date" ON "public"."interest_runs" USING "btree" ("run_date" DESC);



CREATE INDEX "idx_interest_tiers_active" ON "public"."interest_tiers_legacy" USING "btree" ("is_active", "min_balance");



CREATE INDEX "idx_interest_tiers_family_effective_lower" ON "public"."interest_tiers" USING "btree" ("family_id", "effective_from", "lower_bound_cents");



CREATE INDEX "idx_parents_auth_user_id" ON "public"."parents" USING "btree" ("auth_user_id");



CREATE INDEX "idx_parents_family_id" ON "public"."parents" USING "btree" ("family_id");



CREATE INDEX "idx_tiers_prd_family_effective_lower" ON "public"."interest_tiers" USING "btree" ("family_id", "effective_from", "lower_bound_cents");



CREATE INDEX "idx_transactions_account_id" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_date" ON "public"."transactions" USING "btree" ("transaction_date" DESC);



CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");



CREATE OR REPLACE TRIGGER "update_accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_children_updated_at" BEFORE UPDATE ON "public"."children" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_families_updated_at" BEFORE UPDATE ON "public"."families" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_interest_tiers_updated_at" BEFORE UPDATE ON "public"."interest_tiers_legacy" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_parents_updated_at" BEFORE UPDATE ON "public"."parents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."children"
    ADD CONSTRAINT "children_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interest_tiers"
    ADD CONSTRAINT "interest_tiers_prd_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."interest_tiers"
    ADD CONSTRAINT "interest_tiers_prd_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parents"
    ADD CONSTRAINT "parents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rewards"
    ADD CONSTRAINT "rewards_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id");



CREATE POLICY "Anyone can read active interest tiers" ON "public"."interest_tiers_legacy" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Anyone can read interest run history" ON "public"."interest_runs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Parents can access their family data" ON "public"."families" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parents"
  WHERE (("parents"."family_id" = "families"."id") AND ("parents"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Parents can access their own data" ON "public"."parents" TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "Parents can create transactions for their family children" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."accounts" "a"
     JOIN "public"."children" "c" ON (("c"."id" = "a"."child_id")))
     JOIN "public"."parents" "p" ON (("p"."family_id" = "c"."family_id")))
  WHERE (("a"."id" = "transactions"."account_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Parents can manage accounts for children in their family" ON "public"."accounts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."children" "c"
     JOIN "public"."parents" "p" ON (("p"."family_id" = "c"."family_id")))
  WHERE (("c"."id" = "accounts"."child_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Parents can manage children in their family" ON "public"."children" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parents"
  WHERE (("parents"."family_id" = "children"."family_id") AND ("parents"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Parents can view transactions for their family children" ON "public"."transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."accounts" "a"
     JOIN "public"."children" "c" ON (("c"."id" = "a"."child_id")))
     JOIN "public"."parents" "p" ON (("p"."family_id" = "c"."family_id")))
  WHERE (("a"."id" = "transactions"."account_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounts_rw" ON "public"."accounts" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_read" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."children" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "children_rw" ON "public"."children" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "families_insert" ON "public"."families" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "families_read" ON "public"."families" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goals_rw" ON "public"."goals" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."interest_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."interest_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interest_tiers_delete" ON "public"."interest_tiers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."family_id" = "interest_tiers"."family_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "interest_tiers_insert" ON "public"."interest_tiers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."family_id" = "interest_tiers"."family_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."interest_tiers_legacy" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interest_tiers_read" ON "public"."interest_tiers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."family_id" = "interest_tiers"."family_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "interest_tiers_update" ON "public"."interest_tiers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."family_id" = "interest_tiers"."family_id") AND ("p"."auth_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parents" "p"
  WHERE (("p"."family_id" = "interest_tiers"."family_id") AND ("p"."auth_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."parents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "parents_insert_self" ON "public"."parents" FOR INSERT TO "authenticated" WITH CHECK (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "parents_select_self" ON "public"."parents" FOR SELECT TO "authenticated" USING (("auth_user_id" = "auth"."uid"()));



CREATE POLICY "parents_self_read" ON "public"."parents" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "auth_user_id"));



ALTER TABLE "public"."rewards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rewards_rw" ON "public"."rewards" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_daily_interest"("account_balance" numeric, "account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_daily_interest"("account_balance" numeric, "account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_daily_interest"("account_balance" numeric, "account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_daily_interest_piecewise"("account_id" "uuid", "base_cents" bigint, "date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_daily_interest_piecewise"("account_id" "uuid", "base_cents" bigint, "date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_daily_interest_piecewise"("account_id" "uuid", "base_cents" bigint, "date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_audit_event"("p_family_id" "uuid", "p_user_type" "text", "p_user_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_family_id" "uuid", "p_user_type" "text", "p_user_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_audit_event"("p_family_id" "uuid", "p_user_type" "text", "p_user_id" "uuid", "p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."onboard_family"("p_name" "text", "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."onboard_family"("p_name" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."onboard_family"("p_name" "text", "p_timezone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "public"."transaction_type", "p_amount" numeric, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "public"."transaction_type", "p_amount" numeric, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "public"."transaction_type", "p_amount" numeric, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "text", "p_amount_cents" integer, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date", "p_require_confirm" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "text", "p_amount_cents" integer, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date", "p_require_confirm" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_transaction"("p_account_id" "uuid", "p_type" "text", "p_amount_cents" integer, "p_description" "text", "p_parent_id" "uuid", "p_transaction_date" "date", "p_require_confirm" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_interest_from_date"("account_id" "uuid", "anchor" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_interest_from_date"("account_id" "uuid", "anchor" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_interest_from_date"("account_id" "uuid", "anchor" "date") TO "service_role";



GRANT ALL ON TABLE "public"."interest_tiers" TO "anon";
GRANT ALL ON TABLE "public"."interest_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_tiers" TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date", "p_rows" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date", "p_rows" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_interest_tier_set"("p_family_id" "uuid", "p_effective_from" "date", "p_rows" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_interest_run"("account_id" "uuid", "run_date" "date", "interest_cents" integer, "residual_micros" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_interest_run"("account_id" "uuid", "run_date" "date", "interest_cents" integer, "residual_micros" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_interest_run"("account_id" "uuid", "run_date" "date", "interest_cents" integer, "residual_micros" integer) TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."children" TO "anon";
GRANT ALL ON TABLE "public"."children" TO "authenticated";
GRANT ALL ON TABLE "public"."children" TO "service_role";



GRANT ALL ON TABLE "public"."families" TO "anon";
GRANT ALL ON TABLE "public"."families" TO "authenticated";
GRANT ALL ON TABLE "public"."families" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."interest_runs" TO "anon";
GRANT ALL ON TABLE "public"."interest_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_runs" TO "service_role";



GRANT ALL ON TABLE "public"."interest_tiers_legacy" TO "anon";
GRANT ALL ON TABLE "public"."interest_tiers_legacy" TO "authenticated";
GRANT ALL ON TABLE "public"."interest_tiers_legacy" TO "service_role";



GRANT ALL ON TABLE "public"."parents" TO "anon";
GRANT ALL ON TABLE "public"."parents" TO "authenticated";
GRANT ALL ON TABLE "public"."parents" TO "service_role";



GRANT ALL ON TABLE "public"."rewards" TO "anon";
GRANT ALL ON TABLE "public"."rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."rewards" TO "service_role";



GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






RESET ALL;
