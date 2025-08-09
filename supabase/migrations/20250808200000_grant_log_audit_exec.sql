-- Ensure RPC log_audit_event is callable by authenticated clients

do $$ begin
  -- Primary signature (PRD unified version)
  begin
    grant execute on function public.log_audit_event(
      uuid, text, uuid, text, text, uuid, jsonb
    ) to authenticated;
  exception when undefined_function or undefined_object then
    null;
  end;

  -- Legacy signature (enum-based user_type), if present
  perform 1 from pg_type where typname = 'user_type';
  if found then
    begin
      grant execute on function public.log_audit_event(
        uuid, user_type, uuid, text, text, uuid, jsonb
      ) to authenticated;
    exception when undefined_function or undefined_object then
      null;
    end;
  end if;
end $$;


