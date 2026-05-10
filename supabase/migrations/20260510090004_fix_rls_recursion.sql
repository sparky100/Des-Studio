-- Fix infinite recursion in RLS policies caused by correlated subqueries
-- across multiple tables (des_models -> simulation_runs -> share_links).
-- Replaces subquery chains with security definer functions that bypass
-- inner-table RLS, breaking the recursion cycle.
-- Also adds access-map checks so shared-viewer/editor queries work.

drop policy if exists "Anyone can read models for shared dashboards" on public.des_models;
drop policy if exists "Users can read own models" on public.des_models;
drop policy if exists "Users can insert own models" on public.des_models;
drop policy if exists "Users can update own models" on public.des_models;
drop policy if exists "Users can delete own models" on public.des_models;

drop policy if exists "Anyone can read runs for shared dashboards" on public.simulation_runs;
drop policy if exists "Users can read own runs" on public.simulation_runs;
drop policy if exists "Users can insert own runs" on public.simulation_runs;
drop policy if exists "Users can update own runs" on public.simulation_runs;
drop policy if exists "Users can delete own runs" on public.simulation_runs;

drop policy if exists "Anyone can read active share links" on public.share_links;
drop policy if exists "Users can create share links" on public.share_links;
drop policy if exists "Owners can revoke their share links" on public.share_links;
drop policy if exists "Owners can list their run share links" on public.share_links;

-- Helper: does a model have at least one active share link?
-- Security definer runs as the function owner (postgres), bypassing RLS
-- on the joined tables and preventing recursive policy evaluation.
create or replace function public.model_has_active_share(p_model_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.share_links
    join public.simulation_runs on simulation_runs.id = share_links.run_id
    where simulation_runs.model_id = p_model_id
      and share_links.revoked_at is null
  );
$$;

-- Helper: does a run have an active share link?
create or replace function public.run_has_active_share(p_run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.share_links
    where share_links.run_id = p_run_id
      and share_links.revoked_at is null
  );
$$;

-- ── des_models ───────────────────────────────────────────────────────────────
create policy "Allow select"
  on public.des_models
  for select
  to public
  using (
    owner_id = auth.uid()
    or visibility = 'public'
    or (access ->> auth.uid()::text) in ('viewer', 'editor')
    or public.model_has_active_share(id)
  );

create policy "Allow insert"
  on public.des_models
  for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "Allow update"
  on public.des_models
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Allow delete"
  on public.des_models
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- ── simulation_runs ──────────────────────────────────────────────────────────
create policy "Allow select"
  on public.simulation_runs
  for select
  to public
  using (
    run_by = auth.uid()
    or public.run_has_active_share(id)
  );

create policy "Allow insert"
  on public.simulation_runs
  for insert
  to authenticated
  with check (run_by = auth.uid());

create policy "Allow update"
  on public.simulation_runs
  for update
  to authenticated
  using (run_by = auth.uid())
  with check (run_by = auth.uid());

create policy "Allow delete"
  on public.simulation_runs
  for delete
  to authenticated
  using (run_by = auth.uid());

-- ── share_links ──────────────────────────────────────────────────────────────
create policy "Allow select"
  on public.share_links
  for select
  to public
  using (
    revoked_at is null
    or created_by = auth.uid()
  );

create policy "Allow insert"
  on public.share_links
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Allow update"
  on public.share_links
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
