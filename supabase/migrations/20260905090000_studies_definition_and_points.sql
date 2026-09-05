-- Studies (F-Study): promote the `sweeps` table (Sprint 15-16,
-- 20260510090000_share_links_sweeps.sql) into a first-class, persisted
-- "Study" concept — distinct from `experiments` (a saved named parameter
-- set), which this migration does not touch.
--
-- Renames `sweeps` -> `studies` (metadata-only, RLS policies stay attached
-- across the rename — they're tied to the relation, not its name; no data
-- rewrite), adds `definition`/`schema_version`/`status`/`origin` columns for
-- the new schema, and adds `study_points` (one row per point, aggregated
-- metrics only — never per-replication detail, see src/db/results-
-- persistence.js's 800KB payload guard). Legacy rows (`schema_version is
-- null`) keep their `config`/`results` blob shape untouched — no backfill.

-- ── Rename sweeps -> studies (idempotent) ───────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'sweeps'
  ) and not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'studies'
  ) then
    alter table public.sweeps rename to studies;
  end if;
end $$;

-- Cosmetic policy rename (same using/with check clauses as
-- 20260510090000_share_links_sweeps.sql — only the display name changes).
drop policy if exists "Users can insert sweeps" on public.studies;
create policy "Users can insert studies"
  on public.studies
  for insert
  to authenticated
  with check (run_by = auth.uid());

drop policy if exists "Users can view own sweeps" on public.studies;
create policy "Users can view own studies"
  on public.studies
  for select
  to authenticated
  using (run_by = auth.uid());

drop policy if exists "Users can delete own sweeps" on public.studies;
create policy "Users can delete own studies"
  on public.studies
  for delete
  to authenticated
  using (run_by = auth.uid());

-- ── New columns on studies ───────────────────────────────────────────────────
-- `config`/`results` (the legacy blob columns) are kept as-is for old rows.
-- New rows populate `definition`/`schema_version`/`status`/`origin` instead
-- and leave `results` at its existing default ('{}'::jsonb) — per-point data
-- lives in study_points below.

alter table public.studies
  add column if not exists definition     jsonb,
  add column if not exists schema_version int,
  add column if not exists status         text,
  add column if not exists origin         jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'studies_status_check'
  ) then
    alter table public.studies
      add constraint studies_status_check
      check (status is null or status in ('draft', 'running', 'complete', 'cancelled', 'error'));
  end if;
end $$;

-- ── study_points ─────────────────────────────────────────────────────────────

create table if not exists public.study_points (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references public.studies(id) on delete cascade,
  point_index  int not null,
  params       jsonb not null,
  replications int not null default 1,
  metrics      jsonb not null default '{}'::jsonb,
  feasible     boolean,
  seed         bigint,
  created_at   timestamptz not null default now(),
  unique (study_id, point_index)
);

create index if not exists study_points_study_id_idx on public.study_points using btree (study_id);

alter table public.study_points enable row level security;

drop policy if exists "Users can insert own study points" on public.study_points;
create policy "Users can insert own study points"
  on public.study_points
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.studies
      where studies.id = study_points.study_id
        and studies.run_by = auth.uid()
    )
  );

drop policy if exists "Users can view own study points" on public.study_points;
create policy "Users can view own study points"
  on public.study_points
  for select
  to authenticated
  using (
    exists (
      select 1 from public.studies
      where studies.id = study_points.study_id
        and studies.run_by = auth.uid()
    )
  );

-- No update/delete policy: study_points rows are immutable once inserted
-- (enforced below) and are only ever removed by deleting the parent study
-- (on delete cascade).

-- ── Immutability trigger ─────────────────────────────────────────────────────
-- Same pattern as run_results_immutable_check()
-- (20260630090000_run_record_integrity.sql), but simpler: every column on a
-- study_points row is fixed at insert time (there is no "settable-once-
-- from-null" field like simulation_runs.narrative_text), so any UPDATE is
-- rejected outright.

create or replace function study_point_immutable_check()
returns trigger language plpgsql as $$
begin
  raise exception 'study_points: rows are immutable after insert';
end;
$$;

drop trigger if exists study_points_immutability on public.study_points;
create trigger study_points_immutability
  before update on public.study_points
  for each row execute function study_point_immutable_check();
