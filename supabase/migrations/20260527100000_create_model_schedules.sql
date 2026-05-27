-- Migration: create model_schedules table
-- ADR-016: Separate Timetable Schedule Data from Core Model JSON
--
-- Each row in this table represents a named timetable / operating plan for a DES
-- model.  The schedule_json column stores an array of per-bEvent schedule entries:
--
--   [{ "eventId": "b_wcml_train_arrives", "rows": [{ "time": 321, "attrs": {...} }, ...] }]
--
-- bEvents in des_models.model_json reference schedules via a scheduleRef UUID.
-- The engine resolves the reference at run initialisation via resolveInlineSchedules().
--
-- RLS mirrors des_models: the owner can read/write; public models are readable by all.

CREATE TABLE IF NOT EXISTS public.model_schedules (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id      uuid        NOT NULL REFERENCES public.des_models(id) ON DELETE CASCADE,
  name          text        NOT NULL CHECK (char_length(name) <= 200),
  description   text        CHECK (char_length(description) <= 2000),
  -- Array of { eventId, rows[] } — one entry per bEvent that uses this schedule.
  schedule_json jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for fetching all schedules for a model (common read path)
CREATE INDEX IF NOT EXISTS model_schedules_model_id_idx
  ON public.model_schedules (model_id);

-- Only one default schedule per model
CREATE UNIQUE INDEX IF NOT EXISTS model_schedules_one_default_per_model_idx
  ON public.model_schedules (model_id)
  WHERE is_default = true;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_model_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_model_schedules_updated_at ON public.model_schedules;
CREATE TRIGGER trg_model_schedules_updated_at
  BEFORE UPDATE ON public.model_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_model_schedules_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.model_schedules ENABLE ROW LEVEL SECURITY;

-- Policy: owner of the parent model can do anything with its schedules
CREATE POLICY "model owner can manage schedules"
  ON public.model_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = model_schedules.model_id
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = model_schedules.model_id
        AND m.owner_id = auth.uid()
    )
  );

-- Policy: anyone can read schedules for public models
CREATE POLICY "public model schedules are readable by all"
  ON public.model_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = model_schedules.model_id
        AND m.visibility = 'public'
    )
  );

-- Policy: authenticated users can read schedules for models shared with them
CREATE POLICY "shared model schedules are readable by granted users"
  ON public.model_schedules
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = model_schedules.model_id
        AND (
          m.visibility IN ('public', 'shared')
          OR m.owner_id = auth.uid()
          OR (m.access IS NOT NULL AND m.access ? auth.uid()::text)
        )
    )
  );
