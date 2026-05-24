-- Migration: add parent_model_id to des_models
-- Referenced in DES_MODELS_SELECT_CURRENT and norm() for baseline/fork tracking.
-- Missing column caused every page load to hit a schema error, bumping the app
-- into legacy mode (no model_json), which silently dropped dataSources on saves.

ALTER TABLE des_models
  ADD COLUMN IF NOT EXISTS parent_model_id UUID REFERENCES des_models(id) ON DELETE SET NULL;
