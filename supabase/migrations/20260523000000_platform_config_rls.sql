-- RLS policies for platform_config
-- The table was created without policies, blocking all client-side writes.
-- Edge function uses service-role key (bypasses RLS) so reads are unaffected.

alter table public.platform_config enable row level security;

-- Admins can read all config (needed by AdminPanel to load current values)
create policy "Admins can read platform config"
  on public.platform_config
  for select
  to authenticated
  using (public.is_platform_admin());

-- Admins can insert new config keys
create policy "Admins can insert platform config"
  on public.platform_config
  for insert
  to authenticated
  with check (public.is_platform_admin());

-- Admins can update existing config keys
create policy "Admins can update platform config"
  on public.platform_config
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
