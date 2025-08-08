-- Idempotent onboarding RPC to create or fetch a family for the current user
-- Ensures a single transaction creates families + parents and returns family_id

create or replace function public.onboard_family(
  p_name text,
  p_timezone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

-- Allow authenticated users to execute the onboarding RPC
grant execute on function public.onboard_family(text, text) to authenticated;


