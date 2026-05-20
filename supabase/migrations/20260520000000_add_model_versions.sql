-- Sprint 68: Model Versioning
-- Adds model_versions table for explicit milestone tagging

CREATE TABLE IF NOT EXISTS model_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        UUID NOT NULL REFERENCES des_models(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  name            TEXT,
  notes           TEXT,
  model_json      JSONB NOT NULL,
  is_structural   BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id),
  UNIQUE(model_id, version)
);

CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id, version DESC);

-- RLS policies: only model owner can manage versions
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can insert versions"
  ON model_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM des_models
      WHERE des_models.id = model_versions.model_id
      AND des_models.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can view versions"
  ON model_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM des_models
      WHERE des_models.id = model_versions.model_id
      AND (des_models.owner_id = auth.uid() OR des_models.visibility = 'public')
    )
  );

CREATE POLICY "Owners can delete versions"
  ON model_versions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM des_models
      WHERE des_models.id = model_versions.model_id
      AND des_models.owner_id = auth.uid()
    )
  );
