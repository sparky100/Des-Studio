-- Sign-up notifications, v2.
--
-- The earlier webhook trigger ("notify-new-signup", 20260730120000) carried
-- a shared secret as a literal in its definition, so the committed version
-- had a placeholder that had to be patched by hand afterwards. On the live
-- project the trigger is gone altogether, so no sign-up has been announced.
--
-- This version needs no secret. The trigger posts only the new user's id;
-- the notify-new-signup function looks the user up with the service role
-- key and emails only when the account is a few minutes old and hasn't been
-- announced before (signup_notifications below). A forged call can at most
-- announce a real, brand-new sign-up once.
--
-- The function's URL comes from Supabase Vault, so nothing project-specific
-- is committed. Set it once per project:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
-- Without it the trigger does nothing. The trigger can never block or fail a
-- sign-up: any error is caught and logged as a warning.

drop trigger if exists "notify-new-signup" on auth.users;

-- Which sign-ups have been announced. Written only by the edge function
-- (service role); RLS with no policies keeps it out of reach of clients.
create table if not exists public.signup_notifications (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  notified_at timestamptz not null default now()
);
alter table public.signup_notifications enable row level security;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url' limit 1;
  if v_url is null then
    raise log 'notify_new_signup: vault secret project_url not set; skipping';
    return new;
  end if;
  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/notify-new-signup',
    body    := jsonb_build_object('user_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'notify_new_signup: % (sign-up not affected)', sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_new_signup() from public, anon, authenticated;

drop trigger if exists notify_new_signup on auth.users;
create trigger notify_new_signup
  after insert on auth.users
  for each row execute function public.notify_new_signup();
