-- Fix missing RLS policies after Sprint 15 share-link migration.
-- The original migration enabled RLS on des_models and simulation_runs but only
-- added public share-link policies. Authenticated users need CRUD policies on
-- their own data or the app appears empty after login.

-- ── des_models ─────────────────────────────────────────────────────────────────
drop policy if exists "Users can read own models" on public.des_models;
create policy "Users can read own models"
  on public.des_models
  for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Users can insert own models" on public.des_models;
create policy "Users can insert own models"
  on public.des_models
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Users can update own models" on public.des_models;
create policy "Users can update own models"
  on public.des_models
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Users can delete own models" on public.des_models;
create policy "Users can delete own models"
  on public.des_models
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ── simulation_runs ────────────────────────────────────────────────────────────
drop policy if exists "Users can read own runs" on public.simulation_runs;
create policy "Users can read own runs"
  on public.simulation_runs
  for select
  to authenticated
  using (run_by = auth.uid());

drop policy if exists "Users can insert own runs" on public.simulation_runs;
create policy "Users can insert own runs"
  on public.simulation_runs
  for insert
  to authenticated
  with check (run_by = auth.uid());

drop policy if exists "Users can update own runs" on public.simulation_runs;
create policy "Users can update own runs"
  on public.simulation_runs
  for update
  to authenticated
  using (run_by = auth.uid())
  with check (run_by = auth.uid());

drop policy if exists "Users can delete own runs" on public.simulation_runs;
create policy "Users can delete own runs"
  on public.simulation_runs
  for delete
  to authenticated
  using (run_by = auth.uid());
