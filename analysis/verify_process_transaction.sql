-- A) List process_transaction overloads in public schema
select p.proname,
       oidvectortypes(p.proargtypes) as args,
       n.nspname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'process_transaction'
  and n.nspname = 'public';

-- B) Check execute privilege for authenticated on the PRD signature
select has_function_privilege(
  'authenticated',
  'public.process_transaction(uuid, text, int, text, uuid, date, boolean)',
  'EXECUTE'
) as can_exec;


