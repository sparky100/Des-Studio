-- Migration: add model_json JSONB column to des_models
-- This column stores overflow model fields that don't have dedicated columns:
-- graph, experimentDefaults, dataSources, timeUnit, epoch, schemaVersion.
-- The application code (db/models.js) reads model_json first, falling back to
-- dedicated columns for legacy rows. Existing rows get NULL model_json, which
-- norm() handles safely with `r.model_json || {}`.

ALTER TABLE des_models
  ADD COLUMN IF NOT EXISTS model_json JSONB;
