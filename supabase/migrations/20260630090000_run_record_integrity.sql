-- PR-001: simulation_runs immutability and provenance columns
-- Adds model_snapshot, engine provenance fields, run_label, and narrative
-- columns to simulation_runs, then enforces immutability via triggers.

-- ── 1. Add new columns (idempotent) ──────────────────────────────────────────

ALTER TABLE public.simulation_runs
  ADD COLUMN IF NOT EXISTS model_snapshot         JSONB,
  ADD COLUMN IF NOT EXISTS engine_version         TEXT,
  ADD COLUMN IF NOT EXISTS prng_algorithm         TEXT DEFAULT 'mulberry32',
  ADD COLUMN IF NOT EXISTS base_seed              BIGINT,
  ADD COLUMN IF NOT EXISTS narrative_text         TEXT,
  ADD COLUMN IF NOT EXISTS model_description_text TEXT;

-- ── 2. Immutability trigger function ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION run_results_immutable_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.model_snapshot IS DISTINCT FROM NEW.model_snapshot AND
      OLD.model_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: model_snapshot is immutable after insert';
  END IF;
  IF (OLD.engine_version IS DISTINCT FROM NEW.engine_version AND
      OLD.engine_version IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: engine_version is immutable after insert';
  END IF;
  IF (OLD.prng_algorithm IS DISTINCT FROM NEW.prng_algorithm AND
      OLD.prng_algorithm IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: prng_algorithm is immutable after insert';
  END IF;
  IF (OLD.base_seed IS DISTINCT FROM NEW.base_seed AND
      OLD.base_seed IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: base_seed is immutable after insert';
  END IF;
  IF (OLD.results_json IS DISTINCT FROM NEW.results_json AND
      OLD.results_json IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: results_json is immutable after insert';
  END IF;
  IF (OLD.ran_at IS DISTINCT FROM NEW.ran_at AND
      OLD.ran_at IS NOT NULL) THEN
    RAISE EXCEPTION 'simulation_runs: ran_at is immutable after insert';
  END IF;
  -- narrative_text and model_description_text may be SET once from NULL
  -- but cannot be changed after being set to a non-null value.
  IF (OLD.narrative_text IS NOT NULL AND
      OLD.narrative_text IS DISTINCT FROM NEW.narrative_text) THEN
    RAISE EXCEPTION 'simulation_runs: narrative_text cannot be changed once set';
  END IF;
  IF (OLD.model_description_text IS NOT NULL AND
      OLD.model_description_text IS DISTINCT FROM NEW.model_description_text) THEN
    RAISE EXCEPTION 'simulation_runs: model_description_text cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_results_immutability ON public.simulation_runs;
CREATE TRIGGER run_results_immutability
  BEFORE UPDATE ON public.simulation_runs
  FOR EACH ROW EXECUTE FUNCTION run_results_immutable_check();

-- ── 3. Auto-label trigger function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION run_results_auto_label()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.run_label = '' OR NEW.run_label IS NULL THEN
    NEW.run_label := COALESCE(
      (SELECT name FROM public.des_models WHERE id = NEW.model_id LIMIT 1), 'Run'
    ) || ' — ' || TO_CHAR(NOW(), 'DD Mon YYYY') || ' — ' ||
    COALESCE(NEW.base_seed::TEXT, 'auto');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS run_results_label_on_insert ON public.simulation_runs;
CREATE TRIGGER run_results_label_on_insert
  BEFORE INSERT ON public.simulation_runs
  FOR EACH ROW EXECUTE FUNCTION run_results_auto_label();

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS simulation_runs_model_id_idx ON public.simulation_runs(model_id);
CREATE INDEX IF NOT EXISTS simulation_runs_ran_at_idx   ON public.simulation_runs(ran_at DESC);
