# ADR-002: Public Model Run Permissions

**Date:** 2026-04-30
**Status:** Accepted
**Sprint:** Sprint 3
**Decided by:** Architecture review (Claude Code session)

---

## Context

ADR-001 established that public models are view-only for non-owners
until this ADR is accepted. Before Sprint 4 builds the run history
and results streaming features, a decision is needed on whether
non-owners can run public models, and if so, how results are stored
and surfaced.

---

## Questions to Answer

1. Can a non-owner user run a public model?

2. If yes: do run records appear in the owner's history, the runner's
   history, or both?

3. If yes: can the runner delete their own run records?

4. If yes: does the owner see run counts from non-owner executions?

5. Should the implementation use a fork model (copy model_json to a
   new row with the runner's user_id) or a shared-run model (runs
   table references the original model_id regardless of who ran it)?

---

## Constraints to Consider

- The runs table currently has model_id referencing the models table.
  If a non-owner runs a public model, the run record references a
  model they do not own. This may conflict with existing RLS policies.

- If a fork model is used, changes to the original public model are
  not reflected in forked copies. This is clean for isolation but
  confusing if the modeller expects to share a live model.

- The results streaming feature (Sprint 4) writes run records to
  Supabase in real time. The user_id filtering on the frontend
  subscription must be correct from the start or non-owners would
  see each other's live results.

---

## Decision

Accepted: Non-owner users CAN run public models.

**Implementation Model:** Fork Model.
When a non-owner user runs a public model:
*   A new, private copy of the public model is created in the runner's account (forked).
*   All subsequent runs and their records are associated with this forked copy.

**Specifics:**
1.  **Can a non-owner user run a public model?** Yes.
2.  **Do run records appear in the owner's history, the runner's history, or both?** Runner's history (against their forked copy).
3.  **Can the runner delete their own run records?** Yes (they own the forked model).
4.  **Does the owner see run counts from non-owner executions?** No (runs are against forked copies).

---

## Rules to Add to CLAUDE.md

*   **Public Model Execution:** When a non-owner user initiates a run on a public model, the UI MUST first create a private copy (fork) of that model for the user. All subsequent simulation runs will be associated with this forked model.
*   **Ownership of Forked Models:** Forked models are entirely owned by the user who initiated the run.
*   **Run History and Deletion:** Simulation run records for forked models appear exclusively in the runner's history and can be deleted by the runner.
*   **Original Model Integrity:** The original public model's run history and metrics MUST NOT be affected by non-owner executions via the fork mechanism.
