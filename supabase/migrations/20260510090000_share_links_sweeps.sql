-- Sprint 15-16: Share links, simulation runs, and sweeps tables.

-- ── share_links ──────────────────────────────────────────────────────────────
create table if not exists public.share_links (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null,
  created_by  uuid not null,
  token       text not null unique,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

alter table public.share_links enable row level security;

drop policy if exists "Anyone can read active share links" on public.share_links;
create policy "Anyone can read active share links"
  on public.share_links
  for select
  to public
  using (revoked_at is null);

drop policy if exists "Users can create share links" on public.share_links;
create policy "Users can create share links"
  on public.share_links
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Owners can revoke their share links" on public.share_links;
create policy "Owners can revoke their share links"
  on public.share_links
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Owners can list their run share links" on public.share_links;
create policy "Owners can list their run share links"
  on public.share_links
  for select
  to authenticated
  using (created_by = auth.uid());

-- ── sweeps ───────────────────────────────────────────────────────────────────
create table if not exists public.sweeps (
  id         uuid primary key default gen_random_uuid(),
  model_id   uuid not null,
  run_by     uuid not null,
  config     jsonb not null default '{}'::jsonb,
  results    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sweeps enable row level security;

drop policy if exists "Users can insert sweeps" on public.sweeps;
create policy "Users can insert sweeps"
  on public.sweeps
  for insert
  to authenticated
  with check (run_by = auth.uid());

drop policy if exists "Users can view own sweeps" on public.sweeps;
create policy "Users can view own sweeps"
  on public.sweeps
  for select
  to authenticated
  using (run_by = auth.uid());

drop policy if exists "Users can delete own sweeps" on public.sweeps;
create policy "Users can delete own sweeps"
  on public.sweeps
  for delete
  to authenticated
  using (run_by = auth.uid());

-- ── simulation_runs: add warmup_period if missing ────────────────────────────
-- (table may already exist; warmup_period was added Sprint 3)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'simulation_runs' and column_name = 'warmup_period'
  ) then
    alter table public.simulation_runs add column warmup_period real;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'simulation_runs' and column_name = 'duration_ms'
  ) then
    alter table public.simulation_runs add column duration_ms integer;
  end if;
end $$;
