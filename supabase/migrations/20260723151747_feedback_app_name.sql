-- Migration: sync app_name column on public.feedback into this repo's history
--
-- public.feedback is shared by 3 apps (simmodlr, lens, loop) against the same
-- Supabase project. The app_name column already exists in production — it was
-- added by a migration living in one of the sibling apps' repos, not this one,
-- so this repo's local migration history never saw it. This migration is
-- idempotent and brings local/dev schema in sync with production reality.
--
-- No CHECK constraint: lens and loop write to this same table from their own
-- repos, which this migration can't coordinate with.

alter table public.feedback
  add column if not exists app_name text;
