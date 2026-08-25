-- Baseline for the dashboard-created core schema (des_models, simulation_runs,
-- profiles) that predates the migration chain. Without this file a fresh
-- `supabase db reset` fails on the first ALTER TABLE of the chain — the core
-- tables existed only in the live database.
--
-- Generated 2026-08-24 from the live schema. Everything is guarded
-- (IF NOT EXISTS / CREATE OR REPLACE / drop-trigger-first) so replaying it
-- against the live database is a no-op. simulation_runs.version_id is
-- intentionally absent: it references model_versions, which
-- 20260520000000_add_model_versions.sql creates and back-fills.
--
-- NOTE (out-of-band state): the feedback webhook trigger
-- (20260524053043) reads current_setting('app.settings.supabase_url') and
-- ('app.settings.service_role_key'). Those database-level GUCs are set by
-- hand (ALTER DATABASE ... SET), are not captured by any migration, and the
-- trigger silently no-ops without them. Prefer moving the key to Supabase
-- Vault; until then a fresh environment needs them set manually.

create extension if not exists "uuid-ossp";

-- ── shared trigger helpers ───────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists(select 1 from public.profiles where id = uid and role = 'admin');
$$;

-- ── profiles ─────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  role           text not null default 'user' check (role = any (array['user'::text, 'admin'::text])),
  initials       text,
  color          text not null default '#06b6d4',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  suspended      boolean not null default false,
  suspended_at   timestamptz,
  email          text,
  plan           text not null default 'free' check (plan = any (array['free'::text, 'pro'::text])),
  signup_at      timestamptz,
  last_active_at timestamptz,
  organisation_id uuid,
  display_name   text
);

create index if not exists profiles_email_idx on public.profiles using btree (email);

alter table public.profiles enable row level security;

drop policy if exists "profiles: authenticated users can read all" on public.profiles;
create policy "profiles: authenticated users can read all"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles: users can insert own" on public.profiles;
create policy "profiles: users can insert own"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id or is_admin((select auth.uid())))
  with check ((select auth.uid()) = id or is_admin((select auth.uid())));

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if (new.role is distinct from old.role
      or new.suspended is distinct from old.suspended
      or new.suspended_at is distinct from old.suspended_at)
     and not public.is_admin(auth.uid()) then
    raise exception 'Only admins may change role/suspended/suspended_at'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileged_columns on public.profiles;
create trigger guard_profile_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- Auto-provision a profile row for each new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _name    text;
  _initial text;
  _colors  text[] := array[
    '#06b6d4','#f59e0b','#8b5cf6','#3fb950',
    '#f87171','#f0883e','#a78bfa','#34d399'
  ];
  _color   text;
begin
  _name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  _initial := upper(left(_name, 1));
  _color := _colors[ (abs(hashtext(new.id::text)) % array_length(_colors, 1)) + 1 ];

  insert into profiles (id, full_name, initials, color)
  values (new.id, _name, _initial, _color)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── des_models ───────────────────────────────────────────────────────────────

create table if not exists public.des_models (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text not null default '',
  entity_types    jsonb not null default '[]'::jsonb,
  state_variables jsonb not null default '[]'::jsonb,
  b_events        jsonb not null default '[]'::jsonb,
  c_events        jsonb not null default '[]'::jsonb,
  visibility      text not null default 'private' check (visibility = any (array['private'::text, 'public'::text])),
  access          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  queues          jsonb not null default '[]'::jsonb
);

create index if not exists des_models_owner_idx      on public.des_models using btree (owner_id);
create index if not exists des_models_updated_idx    on public.des_models using btree (updated_at desc);
create index if not exists des_models_visibility_idx on public.des_models using btree (visibility);
create index if not exists des_models_access_gin     on public.des_models using gin (access);

alter table public.des_models enable row level security;
-- Policies for des_models are created (drop-if-exists first) by
-- 20260510090003_fix_des_models_rls.sql and 20260510090004_fix_rls_recursion.sql.

drop trigger if exists des_models_updated_at on public.des_models;
create trigger des_models_updated_at
  before update on public.des_models
  for each row execute function public.set_updated_at();

-- ── simulation_runs ──────────────────────────────────────────────────────────

create table if not exists public.simulation_runs (
  id                  uuid primary key default uuid_generate_v4(),
  model_id            uuid not null references public.des_models(id) on delete cascade,
  run_by              uuid not null references auth.users(id) on delete cascade,
  replications        integer not null default 1,
  max_simulation_time double precision not null default 500.0,
  seed                integer,
  total_arrived       integer,
  total_served        integer,
  total_reneged       double precision,
  avg_wait_time       double precision,
  avg_service_time    double precision,
  renege_rate         double precision,
  results_json        jsonb,
  ran_at              timestamptz not null default now(),
  duration_ms         integer,
  warmup_period       real
);

create index if not exists simulation_runs_model_id_idx on public.simulation_runs using btree (model_id);
create index if not exists simulation_runs_user_idx     on public.simulation_runs using btree (run_by);
create index if not exists simulation_runs_ran_at_idx   on public.simulation_runs using btree (ran_at desc);

alter table public.simulation_runs enable row level security;
-- Policies for simulation_runs are created (drop-if-exists first) by
-- 20260510090004_fix_rls_recursion.sql.
