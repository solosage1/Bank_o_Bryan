-- Fix recursive RLS on parents causing 42P17 (infinite recursion)

do $$ begin
  -- Drop the problematic self-referential policy on parents
  begin
    drop policy if exists "Parents can view other parents in their family" on public.parents;
  exception when undefined_object then null; end;

  -- Ensure a safe, non-recursive SELECT policy exists (view own row only)
  begin
    create policy parents_select_self on public.parents
      for select to authenticated
      using (auth_user_id = auth.uid());
  exception when duplicate_object then null; end;

  -- Ensure INSERT policy to allow onboarding to create own parent row
  begin
    create policy parents_insert_self on public.parents
      for insert to authenticated
      with check (auth_user_id = auth.uid());
  exception when duplicate_object then null; end;
end $$;


