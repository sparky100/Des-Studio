-- Sprint 77 / RA3 fix
-- 1. Seed tier_policies with defaults (no-op if already set by admin)
-- 2. Add plan_tier_map so admins control which plan maps to which tier
-- 3. Widen profiles.plan CHECK to allow 'standard'

INSERT INTO platform_config (key, value, updated_at)
VALUES (
  'tier_policies',
  jsonb_build_object(
    'free',     jsonb_build_object('maxReplications', 10,  'maxScans', 50000,   'maxPlannedRows', 2000,  'maxSimTime', 10000,  'disableTimeSeriesAt', 'large'),
    'standard', jsonb_build_object('maxReplications', 30,  'maxScans', 250000,  'maxPlannedRows', 10000, 'maxSimTime', 50000,  'disableTimeSeriesAt', 'large'),
    'pro',      jsonb_build_object('maxReplications', 100, 'maxScans', 1000000, 'maxPlannedRows', 50000, 'maxSimTime', 200000, 'disableTimeSeriesAt', 'too_large'),
    'plan_tier_map', jsonb_build_object(
      'free',      'free',
      'pro',       'standard',
      'standard',  'standard',
      'enterprise','pro',
      'pro_plus',  'pro',
      'pro-plus',  'pro'
    )
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Widen plan check constraint to include 'standard' as a valid plan value
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'standard', 'pro'));
