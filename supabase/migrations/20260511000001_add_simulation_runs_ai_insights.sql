-- Add ai_insights column to simulation_runs for storing AI analysis results
-- 2026-05-11: Stores { summary, recommendation, narrativePrompt } per run
-- The shareable dashboard displays these alongside the run results.

ALTER TABLE simulation_runs
  ADD COLUMN IF NOT EXISTS ai_insights jsonb;
