-- Add tags column to des_models for community gallery metadata
-- 2026-05-10 Sprint 19: Model Import/Export & Community Gallery

ALTER TABLE des_models
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
