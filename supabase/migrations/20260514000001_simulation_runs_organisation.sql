-- F28.6: Promote run_label to real column, add tags and archived flag
ALTER TABLE public.simulation_runs
  ADD COLUMN IF NOT EXISTS run_label  text,
  ADD COLUMN IF NOT EXISTS tags       text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived   boolean NOT NULL DEFAULT false;

-- Backfill run_label from existing JSONB payload
UPDATE public.simulation_runs
SET run_label = results_json->>'runLabel'
WHERE run_label IS NULL
  AND results_json->>'runLabel' IS NOT NULL
  AND results_json->>'runLabel' != '';

-- Index for search and filter
CREATE INDEX IF NOT EXISTS simulation_runs_run_label_idx ON public.simulation_runs(run_label);
CREATE INDEX IF NOT EXISTS simulation_runs_archived_idx  ON public.simulation_runs(archived);
