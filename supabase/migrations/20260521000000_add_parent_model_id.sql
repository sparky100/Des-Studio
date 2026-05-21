-- Sprint 68 extension: Add parent_model_id to des_models for scenario fork provenance.
-- ON DELETE SET NULL: deleting a parent model orphans the child gracefully, does not cascade.
ALTER TABLE des_models
  ADD COLUMN IF NOT EXISTS parent_model_id UUID
    REFERENCES des_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_des_models_parent ON des_models(parent_model_id)
  WHERE parent_model_id IS NOT NULL;
