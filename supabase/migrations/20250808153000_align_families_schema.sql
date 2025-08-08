-- Align families schema with app expectations
-- - Ensure families.sibling_visibility boolean exists
-- - Backfill from legacy families.settings->>'sibling_visibility' when available
-- - Keep idempotent and safe to re-run

do $$ begin
  -- Add sibling_visibility if missing
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'families' and column_name = 'sibling_visibility'
  ) then
    alter table public.families
      add column sibling_visibility boolean not null default true;
  end if;
end $$;

-- Backfill sibling_visibility from legacy settings jsonb if that column exists
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'families' and column_name = 'settings'
  ) then
    -- Use EXECUTE with a different dollar-quote tag to avoid nesting conflicts
    execute $exec$
      update public.families
      set sibling_visibility = coalesce((settings->>'sibling_visibility')::boolean, sibling_visibility)
    $exec$;
  end if;
end $$;

-- Ensure RLS insert policy allows onboarding to create a family
do $$ begin
  begin
    create policy families_insert on public.families
      for insert to authenticated
      with check (true);
  exception when duplicate_object then null; end;
end $$;


