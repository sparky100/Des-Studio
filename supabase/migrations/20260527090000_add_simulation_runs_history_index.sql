-- Improve the primary run-history query path:
-- where model_id = ? and archived = ? order by ran_at desc limit 20
CREATE INDEX IF NOT EXISTS simulation_runs_model_archived_ran_at_idx
  ON public.simulation_runs(model_id, archived, ran_at DESC);
