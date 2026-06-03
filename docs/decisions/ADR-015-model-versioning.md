# ADR-015: Model Versioning as Explicit Milestones

**Date:** 2026-05-20
**Status:** Accepted
**Sprint:** 68

## Context

Modellers save their work frequently while designing models. Without versioning, there's no way to:
- Mark a model state as a stable milestone
- Track what changed between significant design decisions
- Reference a specific model state when discussing results

Auto-incrementing versions on every save would create version inflation (50+ saves during drafting) and dilute the meaning of version numbers.

## Decision

Versions are **explicit milestones** that modellers create intentionally, not automatic save counters.

- **Draft** = the working copy (`model_json` column). Every save updates it. No version number assigned.
- **Version** = an explicit milestone the modeller creates when satisfied with a state. Like a git tag, not a commit.
- **Sharing** is at the model level — you share "the model", not "version 3".
- **Fork** copies the current draft `model_json`, not a tagged version.
- **Runs** optionally reference a `version_id` (nullable) for human navigation; `model_snapshot` remains the source of truth for reproducibility.

### Structural vs Parameter Changes

The system distinguishes between:
- **Structural changes** (topology): entity types, events, queues, conditions, graph structure
- **Parameter changes**: distribution values, server counts, experiment defaults, name/description

When creating a version, the system auto-detects structural changes and displays them to the modeller.

## Alternatives Considered

### Auto-increment on every save
- **Rejected**: Would create 50+ versions during drafting, diluting meaning
- **Rejected**: No distinction between "saved work" and "milestone reached"

### Git-like branching
- **Rejected**: Too complex for simmodlr's target users
- **Rejected**: Model sharing is at the model level, not version level

### Version-only sharing
- **Rejected**: Modellers share "the model", not a specific version
- **Rejected**: Forkers should get the current working model, not a historical snapshot

## Consequences

### Positive
- Versions are meaningful milestones, not save counters
- Modellers can track design evolution without clutter
- Structural change detection helps modellers understand what changed
- Run records can optionally reference versions for human navigation
- Reproducibility is maintained through `model_snapshot` (unchanged)

### Negative
- Modellers must remember to create versions at milestones
- No automatic versioning means some states may not be captured
- Fork copies the draft, not a tagged version (by design, but may surprise some users)

### Rules added to AGENTS.md
- Versions are explicit milestones — never auto-created on save
- `model_json` column remains the current draft
- `model_versions` table stores snapshots with version numbers
- `version_id` in run records is nullable — existing runs remain valid
- Fork mechanism unchanged — copies current draft `model_json`

## Open Questions

- Should there be a "diff" view between versions? (Future sprint)
- Should forkers be able to choose between draft and latest tagged version? (Future sprint)
- Should versions support rollback (restore a previous version as the draft)? (Future sprint)
