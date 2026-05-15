-- Sprint 38: User management & SaaS administration
-- Adds: profiles.suspended, admin_audit_log table, is_user_suspended() helper,
-- log_admin_action() security-definer RPC, updated RLS to gate suspended users,
-- and DB-level quota enforcement triggers.

-- ── 1. Suspension column on profiles ─────────────────────────────────────────

alter table public.profiles
  add column if not exists suspended     boolean      not null default false,
  add column if not exists suspended_at  timestamptz;

-- ── 2. Admin audit log ────────────────────────────────────────────────────────

create table if not exists public.admin_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  actor_id    uuid        not null references auth.users(id) on delete set null,
  action      text        not null,
  target_id   uuid        references auth.users(id) on delete set null,
  target_key  text,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

-- Only platform admins may read the audit log
create policy "Admins can read audit log"
  on public.admin_audit_log
  for select
  to authenticated
  using (public.is_platform_admin());

-- Inserts only via the security-definer RPC below; block direct client inserts
create policy "No direct client inserts"
  on public.admin_audit_log
  for insert
  to authenticated
  with check (false);

-- ── 3. is_user_suspended() helper ────────────────────────────────────────────

create or replace function public.is_user_suspended(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select suspended from public.profiles where id = p_uid),
    false
  );
$$;

-- ── 4. log_admin_action() security-definer RPC ───────────────────────────────
-- Called by the client; writes to admin_audit_log bypassing the block policy.
-- Only succeeds if the caller is a platform admin.

create or replace function public.log_admin_action(
  p_action      text,
  p_target_id   uuid    default null,
  p_target_key  text    default null,
  p_old_value   text    default null,
  p_new_value   text    default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'permission denied: admin only';
  end if;
  insert into public.admin_audit_log
    (actor_id, action, target_id, target_key, old_value, new_value)
  values
    (auth.uid(), p_action, p_target_id, p_target_key, p_old_value, p_new_value);
end;
$$;

-- ── 5. Update des_models RLS to exclude suspended users ───────────────────────

drop policy if exists "Allow select" on public.des_models;

create policy "Allow select"
  on public.des_models
  for select
  to public
  using (
    not public.is_user_suspended(auth.uid())
    and (
      owner_id = auth.uid()
      or visibility = 'public'
      or (access ->> auth.uid()::text) in ('viewer', 'editor')
      or public.model_has_active_share(id)
    )
  );

-- ── 6. DB-level quota enforcement triggers ────────────────────────────────────

-- Helper: read a numeric limit from platform_config
create or replace function public.get_platform_limit(p_key text, p_field text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (value ->> p_field)::integer from public.platform_config where key = p_key),
    2147483647  -- no limit if config missing
  );
$$;

-- Trigger: enforce maxModelsPerUser before inserting a new model
create or replace function public.enforce_model_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  max_models    integer;
begin
  max_models := public.get_platform_limit('limits', 'maxModelsPerUser');
  select count(*) into current_count
    from public.des_models
   where owner_id = new.owner_id;
  if current_count >= max_models then
    raise exception 'quota_exceeded: model limit (%) reached', max_models
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_model_quota on public.des_models;
create trigger trg_enforce_model_quota
  before insert on public.des_models
  for each row execute function public.enforce_model_quota();

-- Trigger: enforce maxRunsPerModel before inserting a new simulation run
create or replace function public.enforce_run_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  max_runs      integer;
begin
  max_runs := public.get_platform_limit('limits', 'maxRunsPerModel');
  select count(*) into current_count
    from public.simulation_runs
   where model_id = new.model_id;
  if current_count >= max_runs then
    raise exception 'quota_exceeded: run limit (%) reached', max_runs
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_run_quota on public.simulation_runs;
create trigger trg_enforce_run_quota
  before insert on public.simulation_runs
  for each row execute function public.enforce_run_quota();
