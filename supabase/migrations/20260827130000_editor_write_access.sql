-- Fix: editor collaborators cannot save models or schedules ("Cannot coerce
-- the result to a single JSON object" / PGRST116 surfaced to users).
--
-- ModelDetail's canEdit flag (src/App.jsx) is `isOwner || accessRole ===
-- 'editor'` and both the Draw and Run screens let an editor collaborator
-- change and save model fields (e.g. experiment defaults / schedules) on
-- that basis. The des_models "Allow update" policy from
-- 20260510090004_fix_rls_recursion.sql only ever allowed owner_id =
-- auth.uid() — never extended to match "Allow select" on the same table,
-- which already grants viewer/editor access via the access jsonb map. An
-- editor's UPDATE therefore matches zero rows under RLS, and the app's
-- `.select().single()` call on that zero-row result throws PostgREST's
-- PGRST116 ("Cannot coerce the result to a single JSON object") straight at
-- the user. model_schedules has the identical gap: its only write policy
-- ("model owner can manage schedules") is owner-only, yet ScheduleManager
-- gates schedule editing on the same canEdit flag.
--
-- This does not touch des_models insert/delete (creating/deleting whole
-- models stays owner-only) or grant any access to the 'viewer' role.

-- ── des_models: allow editor collaborators to update ──────────────────────────

drop policy if exists "Allow update" on public.des_models;

create policy "Allow update"
  on public.des_models
  for update
  to authenticated
  using (
    owner_id = auth.uid()
    or (access ->> auth.uid()::text) = 'editor'
  )
  with check (
    owner_id = auth.uid()
    or (access ->> auth.uid()::text) = 'editor'
  );

-- ── model_schedules: allow editor collaborators to manage schedules ───────────

create policy "editor collaborators can manage schedules"
  on public.model_schedules
  for all
  using (
    exists (
      select 1 from public.des_models m
      where m.id = model_schedules.model_id
        and (m.access ->> auth.uid()::text) = 'editor'
    )
  )
  with check (
    exists (
      select 1 from public.des_models m
      where m.id = model_schedules.model_id
        and (m.access ->> auth.uid()::text) = 'editor'
    )
  );
