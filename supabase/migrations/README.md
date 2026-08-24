# Migrations

## Baseline

`20260504000000_baseline_core_tables.sql` captures the dashboard-created
schema (`profiles`, `des_models`, `simulation_runs`, plus the shared trigger
helpers `set_updated_at`, `is_admin`, `handle_new_user`,
`guard_profile_privileged_columns`) that predates the migration chain. It was
generated from the live database on 2026-08-24 and is fully guarded, so it is
a no-op when replayed against an environment that already has the schema.

Because the live project predates both the baseline and the rename of
`PR-001_run_record_integrity.sql` → `20260630090000_run_record_integrity.sql`,
mark them applied there rather than re-running:

```
supabase migration repair --status applied 20260504000000
supabase migration repair --status applied 20260630090000
```

A fresh environment needs no repair — `supabase db reset` replays the chain
from the baseline.

## Out-of-band state (not captured by migrations)

- The feedback webhook trigger (`20260524053043_feedback_notify_trigger.sql`)
  reads `current_setting('app.settings.supabase_url')` and
  `('app.settings.service_role_key')`, set by hand via `ALTER DATABASE ... SET`.
  Without them the trigger silently no-ops. Prefer moving the key to Supabase
  Vault; until then set both manually in new environments.
- The `notify-new-signup` trigger on `auth.users` posts to the edge function
  with a bearer secret configured at creation time.
