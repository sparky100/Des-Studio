-- Add goals column to des_models for performance goal definitions
-- 2026-05-11 Sprint 21: Performance Goals feature
-- Stores JSONB array: [{ id, metric, target, operator, label, queue }]

ALTER TABLE des_models
  ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL DEFAULT '[]'::jsonb;
