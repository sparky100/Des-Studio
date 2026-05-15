# Sprint 38 — Closure Report

**Sprint:** 38 — User Management & SaaS Administration
**Completed:** 2026-05-15
**Branch:** `claude/review-sprints-31-33-0R5Mx`

## Delivered Scope

| Item | Description | Result |
|------|-------------|--------|
| S38.1 | Password reset / recovery flow | ✅ Done |
| S38.2 | Hard quota enforcement (DB-level triggers) | ✅ Done |
| S38.3 | User suspension — DB field, RLS gate, admin toggle | ✅ Done |
| S38.4 | User settings UI panel | ✅ Done |
| S38.5 | Admin audit log — table, security-definer RPC, Admin panel tab | ✅ Done |

## Detail

### S38.1 — Password Reset

- "Forgot password?" link added to the sign-in form; visible only in `signin` mode
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })` — sends a recovery email via Supabase Auth
- Supabase's `onAuthStateChange` fires `PASSWORD_RECOVERY` when the user returns via the recovery link; this sets `isRecoverySession: true`
- While `isRecoverySession` is true, the app renders a dedicated "Set new password" screen instead of the main UI
- On submit, calls `supabase.auth.updateUser({ password: newPassword })` with min-length (8) and confirm-match validation
- On success, `isRecoverySession` is cleared and the user lands in the authenticated app normally

### S38.2 — Hard Quota Enforcement

Two DB-level before-insert triggers enforce platform limits regardless of how the client connects:

- `trg_enforce_model_quota` on `des_models` — reads `maxModelsPerUser` from `platform_config`, counts the owner's existing models, and raises `P0001` if the limit is reached
- `trg_enforce_run_quota` on `simulation_runs` — reads `maxRunsPerModel`, counts runs for the model, and raises `P0001` if reached
- `get_platform_limit(key, field)` — security-definer helper reads from `platform_config`; defaults to `INT_MAX` if config is missing (no enforcement without explicit config)
- The UI already surfaces DB errors from `saveModel` and `saveSimulationRun`; quota errors propagate with the `quota_exceeded:` prefix in the message

### S38.3 — User Suspension

- `profiles.suspended boolean NOT NULL DEFAULT false` + `profiles.suspended_at timestamptz` added via migration
- `is_user_suspended(uid)` security-definer function — used in RLS policies to avoid recursive policy evaluation
- `des_models` select RLS policy updated: `NOT is_user_suspended(auth.uid()) AND (owner_id = auth.uid() OR ...)` — suspended users cannot read any models via the API
- App renders "Account Suspended" screen (with Sign Out) when `profile.suspended` is true, before the main UI loads
- Admin panel Users tab: Suspend/Unsuspend buttons on each row; current user's own row has no action buttons (self-suspension guard)
- `suspendUser(userId)` / `unsuspendUser(userId)` DB helpers in `models.js`

### S38.4 — User Settings UI

New `src/ui/UserSettingsPanel.jsx` with three tabs:

- **Simulation** — default replications, default warm-up period, default max simulation time
- **AI** — response style (concise/balanced/detailed), auto-propose template checkbox
- **UI** — theme preference (system/dark/light; stored for future theming support)

Uses existing `fetchUserSettings` / `saveUserSettings` backend (namespaced `{ ui, execute, ai }` JSON with `schema_version` tracking). Accessible via a "Settings" button in the main app header.

### S38.5 — Admin Audit Log

- `admin_audit_log` table: `id`, `actor_id`, `action`, `target_id`, `target_key`, `old_value`, `new_value`, `created_at`
- RLS: admin-only read; direct client insert blocked (`with check (false)`)
- `log_admin_action(p_action, p_target_id, p_target_key, p_old_value, p_new_value)` — security-definer RPC; verifies caller is an admin before writing; prevents row forgery
- `logAdminAction(...)` in `models.js` calls the RPC
- Every admin action is logged: promote, demote, suspend, unsuspend, update LLM config, update limits
- Admin panel "Audit Log" tab shows the 100 most recent entries with timestamp, action tag (colour-coded), target ID, and old→new value detail

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20260515000000_sprint38_user_management.sql` | Migration: `profiles.suspended`, `admin_audit_log`, `is_user_suspended()`, `log_admin_action()`, `get_platform_limit()`, quota triggers, RLS update (NEW) |
| `src/db/models.js` | `normalizeProfile` extended with `suspended`; added `suspendUser`, `unsuspendUser`, `logAdminAction`, `fetchAuditLog` |
| `src/ui/AdminPanel.jsx` | Suspend/Unsuspend in users table; Audit Log tab; action logging on role/suspend/config changes |
| `src/ui/UserSettingsPanel.jsx` | New user settings panel (NEW) |
| `src/App.jsx` | Password reset flow; `PASSWORD_RECOVERY` event handling; suspended-user screen; Settings button |
| `tests/setup.js` | Added `rpc: vi.fn()` to global supabase mock |
| `tests/ui/admin-panel.test.jsx` | 6 new tests (NEW) |
| `tests/db/user-management.test.js` | 10 new tests (NEW) |

## Test results

```
tests/ui/admin-panel.test.jsx       6/6  pass
tests/db/user-management.test.js   10/10 pass
Full suite: 1152/1152 pass (91 test files)
```

## Acceptance criteria — final status

- [x] "Forgot password?" flow sends a recovery email; reset page updates the password successfully
- [x] DB triggers enforce model and run quotas regardless of client access method
- [x] Suspended users see "Account Suspended" screen; `des_models` RLS excludes their rows
- [x] Admin panel Suspend/Unsuspend toggle updates `profiles.suspended`
- [x] User settings panel loads existing settings and persists changes per namespace
- [x] Admin Audit Log tab shows the 100 most recent entries; every admin action writes a row via security-definer RPC
- [x] All existing tests pass; 16 new tests cover each change
- [x] Migration file is idempotent (`IF NOT EXISTS`, `OR REPLACE`, `DROP TRIGGER IF EXISTS`)

## SaaS gap status after Sprint 38

| Gap | Status |
|-----|--------|
| Password reset / recovery | ✅ Closed |
| Hard quota enforcement | ✅ Closed (DB triggers) |
| User suspension | ✅ Closed |
| User settings UI | ✅ Closed |
| Admin audit log | ✅ Closed |
| Billing / subscription tiers | ❌ Backlog |
| OAuth (Google/GitHub) | ❌ Backlog |
| MFA | ❌ Backlog |
| Invite-only / domain allowlist | ❌ Backlog |
