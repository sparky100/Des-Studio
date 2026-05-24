-- Sprint 71: Individual SaaS Operator Layer
-- Phase 1: user lifecycle visibility, per-user usage intelligence, signup notifications
-- Phase 2 compatibility: organisation_id is a nullable placeholder only.

-- ── 1. Extend profiles ────────────────────────────────────────────────────────
-- All columns are nullable or have safe defaults; no existing rows are affected.

alter table public.profiles
  add column if not exists email           text,
  add column if not exists plan            text        not null default 'free',
  add column if not exists signup_at       timestamptz,
  add column if not exists last_active_at  timestamptz,
  add column if not exists organisation_id uuid        default null;

-- ── 2. plan check constraint ──────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'pro'));
  end if;
end $$;

-- ── 3. Backfill email and signup_at from auth.users ───────────────────────────
-- Runs as the migration user (postgres / service_role) which has access to auth.users.
update public.profiles p
set
  email     = u.email,
  signup_at = coalesce(p.signup_at, u.created_at)
from auth.users u
where p.id = u.id;

-- ── 4. Sync email + signup_at when auth.users changes ────────────────────────
-- Security definer so the trigger function can access auth.users.
create or replace function public.handle_auth_user_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email     = new.email,
    signup_at = coalesce(signup_at, new.created_at)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
  after insert or update of email on auth.users
  for each row
  execute function public.handle_auth_user_sync();

-- ── 5. last_active_at trigger ─────────────────────────────────────────────────
-- Fires on any profiles row update. The app calls a lightweight update on
-- session load (touchLastActive) which triggers this, setting last_active_at.
create or replace function public.set_last_active_at()
returns trigger
language plpgsql
as $$
begin
  new.last_active_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_last_active on public.profiles;
create trigger trg_profiles_last_active
  before update on public.profiles
  for each row
  execute function public.set_last_active_at();

-- ── 6. admin_user_stats view ──────────────────────────────────────────────────
-- Security-definer view (runs as postgres = view owner) so it can aggregate
-- across des_models and simulation_runs without being blocked by per-user RLS.
-- The is_platform_admin() guard ensures only admins see data.
-- Phase 2: redefine this view to include org-level aggregation.
create or replace view public.admin_user_stats as
select
  p.id,
  p.email,
  p.role,
  p.plan,
  p.suspended,
  p.signup_at,
  p.last_active_at,
  count(distinct m.id)                                                                        as model_count,
  count(distinct r.id)                                                                        as run_count,
  count(distinct r.id) filter (where r.ran_at >= now() - interval '30 days')                 as runs_last_30d
from public.profiles p
left join public.des_models m on m.owner_id = p.id
left join public.simulation_runs r on r.model_id = m.id
where public.is_platform_admin()
group by p.id, p.email, p.role, p.plan, p.suspended, p.signup_at, p.last_active_at;

-- ── 7. get_admin_user_stats() security-definer function ───────────────────────
-- Used by the admin panel client (anon-key + admin JWT) to query cross-user
-- aggregates that bypass per-user RLS on des_models and simulation_runs.
create or replace function public.get_admin_user_stats()
returns table (
  id              uuid,
  email           text,
  role            text,
  plan            text,
  suspended       boolean,
  signup_at       timestamptz,
  last_active_at  timestamptz,
  model_count     bigint,
  run_count       bigint,
  runs_last_30d   bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission denied: admin only';
  end if;
  return query
    select
      p.id,
      p.email,
      p.role,
      p.plan,
      p.suspended,
      p.signup_at,
      p.last_active_at,
      count(distinct m.id)::bigint                                                                        as model_count,
      count(distinct r.id)::bigint                                                                        as run_count,
      count(distinct r.id) filter (where r.ran_at >= now() - interval '30 days')::bigint                 as runs_last_30d
    from public.profiles p
    left join public.des_models m on m.owner_id = p.id
    left join public.simulation_runs r on r.model_id = m.id
    group by p.id, p.email, p.role, p.plan, p.suspended, p.signup_at, p.last_active_at
    order by p.signup_at desc nulls last;
end;
$$;

-- ── 8. get_platform_stats() security-definer function ────────────────────────
-- Returns platform-wide KPI counts for the Usage tab.
create or replace function public.get_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission denied: admin only';
  end if;
  return jsonb_build_object(
    'total_users',   (select count(*)::bigint from public.profiles),
    'active_7d',     (select count(*)::bigint from public.profiles where last_active_at >= now() - interval '7 days'),
    'active_30d',    (select count(*)::bigint from public.profiles where last_active_at >= now() - interval '30 days'),
    'total_models',  (select count(*)::bigint from public.des_models)
  );
end;
$$;

-- ── 9. get_signup_counts() security-definer function ─────────────────────────
-- Returns daily signup counts for the signups-over-time bar chart.
create or replace function public.get_signup_counts(p_days integer default 30)
returns table (day date, count bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission denied: admin only';
  end if;
  return query
    select
      date_trunc('day', signup_at)::date  as day,
      count(*)::bigint                    as count
    from public.profiles
    where signup_at >= current_date - (p_days || ' days')::interval
    group by 1
    order by 1;
end;
$$;
