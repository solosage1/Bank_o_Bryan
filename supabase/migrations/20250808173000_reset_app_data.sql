-- One-time data reset (safe on empty DB). Keeps schema & interest tier config.
do $$ begin
  -- Use EXECUTE blocks so the migration still succeeds if tables are missing in some envs
  begin execute 'truncate table public.transactions_prd restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.interest_runs_prd restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.accounts restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.goals restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.rewards restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.children restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.parents restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.audit_log restart identity cascade'; exception when undefined_table then null; end;
  begin execute 'truncate table public.families restart identity cascade'; exception when undefined_table then null; end;
end $$;


