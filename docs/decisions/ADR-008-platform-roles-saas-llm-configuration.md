# ADR-008: Platform roles and user settings, with SaaS/LLM follow-ons

**Status:** Accepted
**Sprint:** Sprint 7A planning
**Date:** 2026-05-05
**Decided by:** Architecture review (Claude Code session)

---

## Context

DES Studio has moved from a single-user modelling tool toward a hosted multi-user product. Existing ADRs cover model ownership, public model access, run permissions, replication, and authoring modes. They do not yet cover:

- platform roles such as admin users
- user-specific settings
- tenant/workspace boundaries for a future SaaS product
- admin-controlled LLM provider/model configuration
- provider abstraction for Anthropic, OpenAI, Azure OpenAI, or other hosted LLMs

Sprint 6 introduced a Supabase Edge Function `llm-proxy` backed by Anthropic. This is secure for API-key handling, but the provider/model choice is currently implementation-specific rather than platform-configurable.

---

## Decision

Sprint 7A accepts the first platform foundation slice.

1. **Authorization model v2**
   - `profiles.role` is the source of truth for platform role.
   - Platform roles are initially:
     - `user` — default authenticated user
     - `admin` — platform administrator
   - `owner`, `editor`, and `viewer` are not platform roles. They remain model-level access concepts:
     - owner is derived from `des_models.owner_id`
     - editor/viewer are derived from `des_models.access`
     - public read access is derived from `des_models.visibility = 'public'`
   - Workspace/organization roles are deferred until a later tenancy ADR.
   - Admin assignment must not be self-service from the browser. Admin promotion/demotion must happen through a trusted database/service-role path such as Supabase dashboard, migration, or a future protected admin API.
   - Admin UI visibility may be driven by `profile.role === 'admin'`, but RLS/database policies remain the enforcement boundary.
   - Admin users do not automatically gain edit rights over private user models in the product UI. Any future break-glass/admin-inspection power requires a separate explicit ADR.

2. **User settings**
   - Durable user preferences belong in a dedicated `user_settings` table, not in local storage and not in display-oriented `profiles` fields.
   - Proposed table shape:

     ```sql
     create table user_settings (
       user_id uuid primary key references profiles(id) on delete cascade,
       schema_version integer not null default 1,
       settings_json jsonb not null default '{}'::jsonb,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now()
     );
     ```

   - Initial settings are intentionally generic. The application should read and write namespaced JSON preferences as needs emerge, for example:

     ```json
     {
       "ui": {},
       "execute": {},
       "ai": {}
     }
     ```

   - Users may read, insert, and update their own settings row.
   - Platform admins may not read or edit all user settings by default. If support/admin inspection is needed later, define it explicitly.
   - Settings that must follow a user across devices must not be stored only in browser local storage.

3. **RLS and helper functions**
   - Add or retain a security-definer helper for admin checks, for example `is_platform_admin()`, to avoid recursive `profiles` policies.
   - Profiles policies should allow authenticated users to read profile display fields needed by sharing/library UI.
   - Role mutation must be restricted to service-role/trusted paths, not ordinary authenticated clients.

The following topics remain in scope for the broader platform architecture direction, but are explicitly deferred from Sprint 7A:

3. **SaaS tenancy model**
   - Decide between a shared database with explicit `tenant_id`/`workspace_id` and RLS, or separate isolated deployments.
   - Preferred starting point: shared database with explicit tenant/workspace ownership and strong RLS, unless later requirements demand isolated customer infrastructure.

4. **LLM provider abstraction**
   - Keep all provider API keys server-side.
   - Route browser requests through a server-side provider abstraction.
   - Allow an admin-controlled provider/model selection rather than hardcoding a single vendor.

---

## Non-Decisions

This ADR does not yet choose the final tenancy schema, billing model, or LLM provider list. Those require separate implementation planning and migration review.

This ADR also does not implement the admin UI. It only defines the role/settings architecture that the future UI must follow.

---

## Consequences

- Any admin settings UI must be protected by an explicit role check and matching RLS/database guard.
- Any schema change for roles or settings must include migration notes and tests.
- Code should treat `profile.role` as a platform role only. It must not conflate platform admin with model ownership.
- User settings should be loaded through `src/db/models.js` or a future DB wrapper module, not directly from UI components.
- Future LLM work must not deepen the Anthropic-only coupling in browser code, even though provider switching is deferred from Sprint 7A.
- Any schema change for tenancy must be handled by a later tenancy-specific ADR or revision.
- Sprint 8 AI model authoring should be designed against a provider-neutral LLM interface if ADR-008 has not yet been fully accepted.

---

## Migration Notes

Future implementation should add:

1. A constrained role field if not already present:

   ```sql
   alter table profiles
     add column if not exists role text not null default 'user';

   alter table profiles
     add constraint profiles_role_check
     check (role in ('user', 'admin'));
   ```

2. A `user_settings` table with owner-only RLS.
3. Tests for role normalization, admin guards, and user settings CRUD wrappers.
