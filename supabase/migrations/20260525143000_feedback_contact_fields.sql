-- Migration: add feedback contact fields for admin reply workflows
-- Stores the signed-in account email when available and an optional reply email
-- supplied by the user in the feedback form.

alter table public.feedback
  add column if not exists account_email text,
  add column if not exists reply_email text;
