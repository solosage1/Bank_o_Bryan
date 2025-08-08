-- Fix onboarding: allow initial family and parent inserts under RLS

do $$ begin
  -- Allow any authenticated user to insert a new family
  begin
    create policy families_insert on families
      for insert to authenticated
      with check (true);
  exception when duplicate_object then null; end;

  -- Allow authenticated user to create their own parent row
  begin
    create policy parents_insert_self on parents
      for insert to authenticated
      with check (auth_user_id = auth.uid());
  exception when duplicate_object then null; end;
end $$;


