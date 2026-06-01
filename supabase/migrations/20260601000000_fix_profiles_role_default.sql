-- Fix: profiles.role default was 'Analyst' which violates the CHECK constraint
-- (role = ANY (ARRAY['user', 'admin'])). New signups were failing at the
-- on_auth_user_created trigger because the insert omits the role column.
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
