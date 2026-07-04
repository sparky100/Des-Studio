-- Perf: run-history list queries were selecting the full results_json JSONB
-- column (avg ~100KB, up to ~900KB) for every row just to render a small
-- per-metric confidence-interval badge. Add a small dedicated column for
-- that badge so the list query no longer needs results_json at all.
ALTER TABLE public.simulation_runs
  ADD COLUMN IF NOT EXISTS aggregate_stats jsonb;

-- Backfill existing rows from the JSONB payload. This UPDATE does not touch
-- results_json itself, so it does not trip run_results_immutable_check()
-- (PR-001_run_record_integrity.sql), which only guards changes to
-- results_json's own value.
UPDATE public.simulation_runs
   SET aggregate_stats = results_json->'aggregateStats'
 WHERE aggregate_stats IS NULL
   AND results_json ? 'aggregateStats';
