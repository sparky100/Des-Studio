-- Studies Phase 3: sequential studies, AI-authored proposals, persisted
-- diagnoses, and promoting a Study point to an Experiment.
--
-- Three independent additions:
--   1. `parent_study_id` on `studies` — a "study" origin (see
--      src/contracts/study.ts's StudyOrigin) already carries the parent's id
--      as `origin.refId`; this column denormalises it for cheap lineage
--      queries ("show me every study descended from study X") without
--      parsing `definition`/`origin` jsonb.
--   2. `diagnoses` — persists DiagnosticsTab.jsx's AI diagnosis result
--      (previously ephemeral React state only), keyed to the
--      `simulation_runs` row it was run against.
--   3. `source_study_point_id` on `experiments` — set when an experiment is
--      created via the Studies tab's "Promote to Experiment" action, so a
--      promoted experiment can be traced back to the study point it came
--      from. Nullable/optional: experiments created any other way leave it
--      null, as before.

-- ── 1. studies.parent_study_id ───────────────────────────────────────────────

alter table public.studies
  add column if not exists parent_study_id uuid references public.studies(id) on delete set null;

create index if not exists studies_parent_study_id_idx on public.studies using btree (parent_study_id);

-- ── 2. diagnoses ─────────────────────────────────────────────────────────────

create table if not exists public.diagnoses (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.simulation_runs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  version_id  uuid references public.model_versions(id) on delete set null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists diagnoses_run_id_idx on public.diagnoses using btree (run_id);

alter table public.diagnoses enable row level security;

-- Ownership follows the parent simulation_runs row (run_by), the same
-- pattern study_points uses via its parent studies row.
drop policy if exists "Users can insert own diagnoses" on public.diagnoses;
create policy "Users can insert own diagnoses"
  on public.diagnoses
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.simulation_runs
      where simulation_runs.id = diagnoses.run_id
        and simulation_runs.run_by = auth.uid()
    )
  );

drop policy if exists "Users can view own diagnoses" on public.diagnoses;
create policy "Users can view own diagnoses"
  on public.diagnoses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.simulation_runs
      where simulation_runs.id = diagnoses.run_id
        and simulation_runs.run_by = auth.uid()
    )
  );

-- No update/delete policy — diagnosis results are write-once records of what
-- the AI said at the time, like study_points; enforced below.

create or replace function diagnosis_immutable_check()
returns trigger language plpgsql as $$
begin
  raise exception 'diagnoses: rows are immutable after insert';
end;
$$;

drop trigger if exists diagnoses_immutability on public.diagnoses;
create trigger diagnoses_immutability
  before update on public.diagnoses
  for each row execute function diagnosis_immutable_check();

-- ── 3. experiments.source_study_point_id ────────────────────────────────────

alter table public.experiments
  add column if not exists source_study_point_id uuid references public.study_points(id) on delete set null;
