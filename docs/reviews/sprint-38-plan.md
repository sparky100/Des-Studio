# Sprint 38 — Plan

**Sprint:** 38 — User Management & SaaS Administration
**Branch:** `claude/review-sprints-31-33-0R5Mx`
**Date:** 2026-05-15

## Objective

Harden simmodlr for SaaS deployment by adding the minimum viable set of user management features: password recovery, hard quota enforcement, user suspension, a user-facing settings panel, and an admin audit log.

## Background

The user management assessment (2026-05-15) identified the following gaps against a production SaaS deployment:

- No password reset / recovery flow — users permanently locked out on forgotten password
- Platform quotas stored in `platform_config` but enforced only in the UI; any direct API caller is unlimited
- No user suspension mechanism — bad actors can only be removed by full account deletion
- `user_settings` backend table is complete (namespaced JSON, versioned schema) but not exposed in the UI
- No audit trail for admin actions (promote, demote, limit changes, suspension)

OAuth, MFA, billing, and invite-only registration are out of scope for this sprint (backlog items).

## Scope

| ID | Item | File(s) |
|----|------|---------|
| S38.1 | Password reset / recovery flow | `src/ui/auth/AuthPanel.jsx` (or auth entry point), new `src/ui/auth/ResetPassword.jsx` |
| S38.2 | Hard quota enforcement in edge function | `supabase/functions/llm-proxy/index.ts`, new enforcement helper |
| S38.3 | User suspension — DB field + auth gate | new migration, `src/db/models.js`, `src/ui/AdminPanel.jsx` |
| S38.4 | User settings UI panel | new `src/ui/UserSettingsPanel.jsx`, `src/db/userSettings.js` |
| S38.5 | Admin audit log | new migration + `src/db/adminAudit.js`, `src/ui/AdminPanel.jsx` |

### S38.1 — Password Reset

- Add "Forgot password?" link to the login form calling `supabase.auth.resetPasswordForEmail(email, { redirectTo })`
- Add a `ResetPassword` page/route rendered when the URL contains the Supabase `#access_token` + `type=recovery` hash fragment
- The reset page calls `supabase.auth.updateUser({ password: newPassword })` on submit
- Validation: password minimum length (8 chars), confirm-password match, empty guard

### S38.2 — Hard Quota Enforcement

- Read `platform_config` from the DB inside the `llm-proxy` edge function (or a shared config module)
- On each LLM call, check `maxReplications`, `maxRunsPerModel`, and `maxModelsPerUser` against live counts
- Return `429 Too Many Requests` with a structured error body `{ error: "quota_exceeded", limit: N }` when breached
- UI already handles non-200 responses from the proxy; add friendly quota-exceeded message

### S38.3 — User Suspension

- Add `suspended boolean NOT NULL DEFAULT false` column to `profiles` table via migration
- `is_platform_admin()` security-definer helper already exists; add `is_user_suspended(uid)` similarly
- RLS: add `AND NOT is_user_suspended(auth.uid())` to model/run read policies; suspended users see an empty gallery
- Admin panel: add "Suspend" / "Unsuspend" toggle button in the user list row (alongside existing Promote/Demote)
- Suspended users who reload the app see an "Account suspended" message instead of the main UI

### S38.4 — User Settings UI

The `user_settings` table already stores `settings_json: { ui: {}, execute: {}, ai: {} }` per user.

UI panel (accessible from the user avatar menu):
- **UI tab**: theme preference (system / light / dark), default canvas zoom level
- **Execute tab**: default replication count, default warm-up period, default max sim time
- **AI tab**: preferred LLM response style (concise / detailed), whether to auto-propose a template

`src/db/userSettings.js`: `getUserSettings(userId)` / `saveUserSettings(userId, patch)` — patch-merges namespace keys, increments `schema_version`

### S38.5 — Admin Audit Log

New migration adds:

```sql
create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users not null,
  action      text not null,         -- 'promote', 'demote', 'suspend', 'unsuspend', 'update_limit'
  target_id   uuid references auth.users,
  target_key  text,                  -- for limit changes: the config key
  old_value   text,
  new_value   text,
  created_at  timestamptz default now()
);
-- RLS: only platform admins may read; inserts via security-definer function only
```

`src/db/adminAudit.js`: `logAdminAction(action, targetId?, targetKey?, oldValue?, newValue?)` — calls a security-definer RPC to insert, preventing direct table writes from the client

Admin panel: add an "Audit Log" tab showing the last 100 entries with actor, action, target, timestamp

## Acceptance Criteria

- [ ] "Forgot password?" flow sends a recovery email and the reset page updates the password successfully
- [ ] LLM proxy returns `429` with `{ error: "quota_exceeded" }` when replication count exceeds the configured limit
- [ ] Suspended users see an "Account suspended" screen; their models do not appear in the gallery
- [ ] Admin panel Suspend/Unsuspend toggle updates the `profiles.suspended` column
- [ ] User settings panel loads existing settings and persists changes per namespace
- [ ] Admin Audit Log tab shows the 100 most recent entries; every promote/demote/suspend/limit-change action writes a row
- [ ] All existing tests pass; new tests cover each change
- [ ] Migration files are idempotent and include rollback comments

## Test Plan

| Test file | Coverage |
|-----------|---------|
| `tests/ui/auth/reset-password.test.jsx` | Email submission, hash-fragment detection, password update, validation errors |
| `tests/db/user-settings.test.js` | Load, patch-merge, schema_version increment |
| `tests/db/admin-audit.test.js` | logAdminAction writes correct row; non-admin cannot read log |
| `tests/ui/admin-panel.test.jsx` | Suspend toggle, audit log tab render |
| `tests/supabase/quota-enforcement.test.js` | 429 path for replication quota; pass path under limit |
