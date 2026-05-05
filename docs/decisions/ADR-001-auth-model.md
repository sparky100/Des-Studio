# ADR-001: Multi-User Authentication Model and Public Model Rules

**Date:** 2026-04-30
**Status:** Accepted
**Sprint:** Pre-Sprint 1
**Decided by:** Architecture review (claude.ai planning session)

---

## Context

DES Studio is a multi-user application. The existing codebase has a
working Supabase Auth implementation with session management in App.jsx,
a profiles table linked to auth.users, and a models table with user_id
and is_public columns.

The original specification (v1) did not mention authentication at all.
The sprint plan and CLAUDE.md as initially drafted referenced auth only
in passing. This created a risk that Claude Code would silently break
multi-user data isolation during Sprint 1 engine refactoring, since
none of the prohibited patterns explicitly covered auth-related mistakes.

A secondary risk was identified: the new Function() eval vulnerability
(audit finding C1) is exploitable specifically because models can be
marked is_public and shared with other authenticated users. A crafted
public model can execute arbitrary JavaScript in any viewer's browser.
This means C1 is a security fix, not only a correctness fix.

A third question was identified but not yet answered: what permissions
does a non-owner user have over a public model? Specifically, can they
run it, and if so, where do the results appear?

---

## Decision

**The following rules are accepted as architectural constraints for all
sprints, effective immediately:**

1. Every Supabase query against the models table that returns a list
   must filter by either user_id = session.user.id (own models) or
   is_public = true (public models). A query with neither filter is
   a data isolation violation.

2. Every INSERT into models must set user_id to the current
   authenticated user's ID. Every INSERT into runs must reference a
   model_id owned by the current user.

3. The is_public flag must be preserved on every patch operation that
   does not explicitly change it. It must never be silently overwritten
   or defaulted.

4. Auth session is managed exclusively in App.jsx. Components read
   session state via context or props. Direct calls to
   supabase.auth.getSession() inside components are prohibited.

5. The Supabase client singleton in src/db/supabase.js is the only
   permitted client instance. A second instance is prohibited.

6. Supabase Row Level Security (RLS) is the enforcement boundary.
   Frontend filtering is required for correct UX but must not be
   treated as the security layer.

7. Until ADR-002 is accepted, public models are view-only for
   non-owners. Run permissions for public models must not be
   implemented with assumed behaviour.

8. Task 1 of Sprint 1 (removing new Function() eval) is classified
   as a security fix due to the public model sharing feature, not
   merely a correctness fix. It must be completed before any other
   Sprint 1 work.

---

## Alternatives Considered

**Alternative A — Treat auth as out of scope for Sprint 1**
Rejected. Sprint 1 touches db/models.js CRUD wrappers directly as part
of the validation and seeded RNG work. Without explicit auth rules,
Claude Code could refactor these wrappers in ways that remove the
user_id filter, silently exposing all users' models to each other.
The risk of introducing a regression is too high to defer.

**Alternative B — Implement RLS only and remove all frontend filtering**
Rejected. RLS alone is correct for security, but frontend filtering is
needed so that users never see data they should not see in the UI, even
for a moment before RLS rejects the query. Both layers are needed.

**Alternative C — Allow non-owners to run public models immediately**
Deferred, not rejected. The question of where run results are stored
(owner's history or runner's history) has not been answered. Deferring
to ADR-002 prevents an ad-hoc implementation choice that would be
difficult to reverse once run history data is in production.

---

## Consequences

### Positive
- Multi-user data isolation is explicitly protected during all sprint
  refactoring, not accidentally broken.
- The XSS risk from new Function() is correctly classified as a
  security issue, giving it appropriate sprint priority.
- Public model sharing is preserved as a feature without accidentally
  granting run permissions before the implications are considered.
- All DB access patterns are documented, making code review easier.

### Negative
- Claude Code must read this ADR when working on any DB query or auth
  flow, adding a small overhead to session startup.
- The public model run question is deferred, which means non-owners
  cannot run public models until ADR-002 is accepted. This is a
  deliberate feature limitation, not an oversight.

### Rules added to CLAUDE.md
- Section 14: Authentication & Multi-User Rules (full section)
- Section 15: Architectural Decision Records (ADR process)
- Section 16 Prohibited Patterns: Authentication & Data Isolation block
- Section 17 Reference Documents: ADR-001 and ADR-002 entries

---

## Open Questions (for ADR-002)

1. Can a non-owner user run a public model?

2. If yes: do the resulting run records appear in the model owner's
   run history, the runner's run history, or both?

3. If yes: can the runner delete their own run records against a
   public model?

4. If yes: does the owner see run counts from non-owner executions
   in their model statistics?

5. Should there be a distinction between "view model definition" and
   "fork model to own account and run it"? The fork approach is clean
   but requires copying model_json to a new row with the runner's
   user_id, which has storage and sync implications.

These questions should be answered at the Sprint 3 retrospective, before
Sprint 4 begins building the run history and results streaming features.
