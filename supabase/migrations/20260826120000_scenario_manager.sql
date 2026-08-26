-- Named-scenario manager (F-9): scenario objects (name, parameter deltas,
-- seed, replication count) that a modeller can run and compare against each
-- other or the base model, fronting the existing paired-t/ANOVA/Tukey HSD
-- statistics (src/engine/statistics.js) which today only compareScenarios
-- (2-group paired-t) has any UI surface for.
--
-- This is deliberately NOT the "fork the whole model" scenario concept
-- already in des_models.parent_model_id/forkModel() — that's a heavier,
-- separate feature (a full independent model copy) that stays as-is. A
-- scenario here is a lightweight, named parameter-delta object against an
-- existing model, applied via sweep-params.js's applySweepValues() without
-- ever forking anything.

create table if not exists public.scenarios (
  id           uuid primary key default gen_random_uuid(),
  model_id     uuid not null references public.des_models(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text not null default '',
  param_deltas jsonb not null default '[]'::jsonb,
  base_seed    integer,
  replications integer not null default 1,
  created_at   timestamptz not null default now()
);

create index if not exists scenarios_model_id_idx on public.scenarios using btree (model_id);
create index if not exists scenarios_created_by_idx on public.scenarios using btree (created_by);

alter table public.scenarios enable row level security;

drop policy if exists "Users can insert own scenarios" on public.scenarios;
create policy "Users can insert own scenarios"
  on public.scenarios
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Users can view own scenarios" on public.scenarios;
create policy "Users can view own scenarios"
  on public.scenarios
  for select
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "Users can delete own scenarios" on public.scenarios;
create policy "Users can delete own scenarios"
  on public.scenarios
  for delete
  to authenticated
  using (created_by = auth.uid());

-- Scenario runs are not persisted to simulation_runs in this first version —
-- "Compare" runs each selected scenario's replications in-memory on demand
-- (same established pattern as AdaptiveBatchPanel.jsx's baseline-vs-patched
-- Explore comparison), so there is no simulation_runs schema change here.
-- Persisting scenario runs to history is a natural, separate follow-up if
-- it turns out modellers want to revisit past scenario comparisons rather
-- than re-run them.
