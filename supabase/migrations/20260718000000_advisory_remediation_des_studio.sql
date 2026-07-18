-- Advisory remediation (DES Studio-owned objects only)
-- Addresses Supabase security/performance advisors for des_models, simulation_runs,
-- share_links, sweeps, experiments, model_versions, model_schedules, user_settings,
-- platform_config, admin_audit_log, feedback, and the shared profiles table.
-- SD (sd_*) and Lens tables/policies are out of scope and untouched.

-- ── 1. Drop dead, unused views ────────────────────────────────────────────────
-- v_model_run_summary: unfiltered SELECT over simulation_runs (no owner/visibility
-- check), security-definer (bypasses RLS), granted to anon — a live cross-tenant
-- data leak. Not referenced anywhere in src/ or tests/.
-- v_my_models: security-definer view duplicating logic already enforced by RLS.
-- Not referenced anywhere in src/ or tests/.
-- admin_user_stats: security-definer view duplicating get_admin_user_stats() RPC,
-- which is what the app actually calls. Not referenced anywhere in src/ or tests/.
drop view if exists public.v_model_run_summary;
drop view if exists public.v_my_models;
drop view if exists public.admin_user_stats;

-- ── 2. RLS policy consolidation ───────────────────────────────────────────────
-- Each of these tables accumulated a legacy (pre-optimisation) policy alongside
-- a newer one covering the same action, doubling policy evaluation per query
-- (multiple_permissive_policies) and, for the legacy policies specifically,
-- re-evaluating unwrapped auth.<fn>() calls per row (auth_rls_initplan).

-- admin_audit_log: "Admin insert audit" is a second permissive INSERT policy
-- that lets any client with profiles.role='admin' insert directly, which
-- silently defeats "No direct client inserts" (with_check false) via
-- OR-combination of permissive policies. The app only ever writes through the
-- log_admin_action() security-definer RPC (src/db/models.js), never a direct
-- insert, so closing this does not affect the app.
drop policy if exists "Admin insert audit" on public.admin_audit_log;
drop policy if exists "Admin read audit" on public.admin_audit_log;

-- feedback: drop duplicates, and drop the looser insert policy that doesn't
-- tie user_id to the caller (Users can submit feedback does).
drop policy if exists "Admin read feedback" on public.feedback;
drop policy if exists "Admin update feedback" on public.feedback;
drop policy if exists "Authenticated insert feedback" on public.feedback;

-- platform_config: app only ever does select/upsert (src/db/models.js
-- getPlatformConfig/setPlatformConfig), never delete, so the surviving
-- is_platform_admin()-based insert/select/update policies cover all real usage.
drop policy if exists "Admin read" on public.platform_config;
drop policy if exists "Admin write" on public.platform_config;

-- user_settings: "Own settings" is a broad unwrapped ALL policy; no delete path
-- exists in src/, so the three narrower select/insert/update "own" policies
-- fully cover current usage.
drop policy if exists "Own settings" on public.user_settings;

-- profiles: drop the duplicate read policy.
drop policy if exists "Authenticated users can read profiles" on public.profiles;

-- profiles: the admin panel (src/db/models.js updateUserRole/suspendUser/
-- unsuspendUser/updateUserPlan) updates arbitrary users' rows directly, which
-- depends on the admin-override clause below. Merge both update policies into
-- one wrapped policy instead of just dropping the legacy one.
drop policy if exists "Users can update own or admins update any" on public.profiles;
drop policy if exists "profiles: users can update own" on public.profiles;
create policy "profiles: update own or admin"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or is_admin((select auth.uid())))
  with check ((select auth.uid()) = id or is_admin((select auth.uid())));

-- ── 3. Pin search_path on DES-owned trigger functions ─────────────────────────
-- None of these are SECURITY DEFINER, so this is defense-in-depth rather than a
-- live privilege-escalation fix. sd_set_updated_at (SD-owned) is left alone.
alter function public.set_updated_at() set search_path = public;
alter function public.update_experiments_updated_at() set search_path = public;
alter function public.run_results_immutable_check() set search_path = public;
alter function public.run_results_auto_label() set search_path = public;
alter function public.set_last_active_at() set search_path = public;
alter function public.set_model_schedules_updated_at() set search_path = public;

-- ── 4. Drop duplicate index ────────────────────────────────────────────────────
-- admin_audit_log_actor_idx and idx_admin_audit_log_actor_id are identical;
-- keep the former (older, matches the table's other _idx-suffixed indexes).
drop index if exists public.idx_admin_audit_log_actor_id;
