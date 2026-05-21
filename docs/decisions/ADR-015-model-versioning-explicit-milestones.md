# ADR-015: Model versioning as explicit milestones

**Date:** 2026-05-21  
**Status:** Accepted  
**Sprint:** 68

## Context

DES Studio modellers iterate frequently — saving dozens of times during a session. Auto-versioning every save would create noise and make it hard to identify meaningful states. Run records already store `model_snapshot` for reproducibility. The question was whether to add an explicit versioning layer and, if so, how it should relate to run snapshots and model sharing.

## Decision

Model versions are **explicit milestones** created by the modeller, not automatic events. A `model_versions` table stores full model snapshots at the times the modeller chooses to tag them. The working draft (`des_models.model_json`) remains the editable copy; versions are read-only snapshots.

Forked models (scenario baselines) store a `parent_model_id` reference so the provenance chain is visible in the UI.

## Alternatives Considered

**Auto-version on every save** — rejected because it creates thousands of versions per session, defeating the purpose of a milestone system. The undo stack already provides fine-grained rollback within a session.

**Version on every run** — rejected because runs are parameterised experiments on the same model; versioning on run would conflate model evolution with experiment execution.

**Use run snapshots as the version history** — partially adopted (the "View model at this run" diff uses run snapshots), but not the primary version mechanism because run snapshots are not named, labelled, or browsable as model history.

## Consequences

### Positive
- Modellers have full control over what constitutes a milestone
- No noise from auto-versioning
- Reproducibility (run snapshots) and navigation (named versions) are separate concerns with clear ownership
- `parent_model_id` enables scenario branching workflows without complex graph machinery

### Negative
- Modellers who forget to create versions before significant changes lose the ability to recover a named state (undo stack still works within the session)
- Collaborators cannot create versions (owner-only constraint); this limits version history for shared models

### Rules added to AGENTS.md
- Do not auto-create versions on save
- Version creation is always owner-initiated
- `parent_model_id` on `des_models` uses ON DELETE SET NULL (not CASCADE)
- The fork "Copy" operation does NOT set `parent_model_id` — only "Save as scenario baseline" does

## Open Questions

- Multi-user versioning: should editors be allowed to create versions? Needs a follow-up ADR.
- Version branching: currently linear (v1, v2, v3). Non-linear branching (v2.1, v2.2) is not planned.
