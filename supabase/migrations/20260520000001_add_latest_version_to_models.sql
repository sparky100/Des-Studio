-- Sprint 68: Add latest_version to des_models for library display
-- Denormalised so the library can show Vx without N+1 queries to model_versions

ALTER TABLE des_models ADD COLUMN IF NOT EXISTS latest_version INTEGER DEFAULT 0;

-- Backfill from existing model_versions
UPDATE des_models SET latest_version = (
  SELECT COALESCE(MAX(version), 0) FROM model_versions WHERE model_versions.model_id = des_models.id
);
