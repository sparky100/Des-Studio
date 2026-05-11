-- Platform configuration table for SaaS administration
-- 2026-05-11: Stores system-wide settings (LLM config, feature flags, limits)
-- Admins can update via the Admin panel in the UI.

CREATE TABLE IF NOT EXISTS platform_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Seed default configuration
INSERT INTO platform_config (key, value) VALUES
  ('llm', '{"provider":"anthropic","model":"claude-sonnet-4-20250514","temperature":0.3,"maxTokensPerRun":450,"maxTokensPerModel":4000,"rateLimitPerHour":25}'::jsonb),
  ('limits', '{"maxModelsPerUser":100,"maxRunsPerModel":500,"maxReplications":50,"maxSweepPoints":50,"maxSimTime":100000}'::jsonb),
  ('features', '{"allowAnonymous":true,"allowSharing":true}'::jsonb)
ON CONFLICT (key) DO NOTHING;
