# Sprint 68 — Closure Report

Created: 2026-05-21  
Status: ✅ Complete  
Plan reference: `docs/reviews/sprint-68-plan.md`

## Sprint Summary

Sprint 68 delivered first-class model versioning to DES Studio. Modellers can now tag model milestones as named versions, view a structural-change diff between any two model states, restore a past version into the editor, and fork models as scenario baselines with full provenance tracking back to the parent model.

## Goal

Give modellers confidence in model evolution by making versioning, diffing, and scenario branching explicit, labelled, and reversible.

## Delivery Status

| Work item | Status | Notes |
|---|---|---|
| 68-1 — DB: `model_versions` table + migration | ✅ Complete | `20260520000000_add_model_versions.sql`; RLS owner-only |
| 68-2 — DB: `latest_version` denormalisation | ✅ Complete | `20260520000001_add_latest_version_to_models.sql`; backfill included |
| 68-3 — DB: `parent_model_id` on `des_models` | ✅ Complete | `20260521000000_add_parent_model_id.sql`; ON DELETE SET NULL |
| 68-4 — DB layer: `createVersion`, `listVersions`, `getVersion`, `deleteVersion`, `getNextVersion` | ✅ Complete | `src/db/models.js`; owner-guard on delete; `latest_version` kept in sync |
| 68-5 — DB layer: `forkModel` stores `parent_model_id` | ✅ Complete | Signature: `forkModel(sourceId, userId, name, options)` |
| 68-6 — DB layer: `norm()` maps `parentModelId` and `latestVersion` | ✅ Complete | Camel-case normalisation consistent with all other fields |
| 68-7 — Engine: `detectStructuralChanges()` | ✅ Complete | `src/engine/validation.js`; returns `{ isStructural, changes[] }` |
| 68-8 — UI: `VersionHistoryPanel` — list, create, delete | ✅ Complete | `src/ui/VersionHistoryPanel.jsx`; owner-tab in ModelDetail |
| 68-9 — UI: Run history "View model at this run" diff button | ✅ Complete | `src/ui/ModelHistoryTab.jsx`; reads `model_snapshot`, calls `buildModelDiff` |
| 68-10 — UI: Version row "Diff vs. current" button | ✅ Complete | `VersionHistoryPanel.jsx`; read-only `ModelDiffPreview` modal |
| 68-11 — UI: Version row "Restore" button | ✅ Complete | Calls `onRestoreVersion(modelJson)` → `setWholeModel`; marks dirty, no auto-save |
| 68-12 — UI: "Save as scenario baseline" card (Overview tab) | ✅ Complete | `ModelDetail.jsx`; modal prompt; calls `forkModel` with `parentModelId` |
| 68-13 — UI: Provenance badge ("Forked from X on [date]") | ✅ Complete | `ModelDetail.jsx` Overview tab; resolves parent name via `overrides.parentModelName` |
| 68-14 — UI: `ModelDiffPreview` `readOnly` prop | ✅ Complete | Hides Apply/Save buttons when `readOnly=true` |
| 68-15 — Run records store `version_id` (nullable) | ✅ Complete | `saveSimulationRun` + `fetchRunHistory` join; version badge in run history table |
| 68-16 — Tests: `structural-changes.test.js` | ✅ Complete | 8 test cases covering structural vs. parameter changes |
| 68-17 — Tests: `model-versions.test.js` (DB layer) | ✅ Complete | Mock Supabase; `getNextVersion`, `listVersions`, normalisation |
| 68-18 — Tests: `model-diff.test.js` (buildModelDiff) | ✅ Complete | 6 cases: added, removed, modified, unchanged |
| 68-19 — Documentation: closure, capability guide, AGENTS.md, User Guide | ✅ Complete | This document + `sprint-68-model-versioning-guide.md` |

## Delivered Scope

### Database layer
- Three migrations shipped: `model_versions` table, `latest_version` on `des_models`, `parent_model_id` on `des_models`
- `model_versions` stores: version number, name/label, notes, full `model_json` snapshot, structural flag, timestamps, author
- RLS: only model owner can create/delete versions; public models allow read
- `simulation_runs.version_id` nullable FK to `model_versions` — run history table shows version badge (`V{n}`)
- `forkModel(sourceId, userId, name, { parentModelId })` stores provenance — Copy flow uses default (no parent), Scenario Baseline sets `parentModelId`

### Engine layer
- `detectStructuralChanges(oldModel, newModel)` in `src/engine/validation.js` — detects topology changes (entity types, events, queues, graph, conditions) vs. parameter tweaks (distribution params, experiment defaults, server counts)
- Used in `CreateVersionModal` to auto-classify each version and prompt users when they are saving a parameter-only change

### UI surfaces
- **Versions tab** (owner-only): lists all tagged versions; Create/Delete; structural vs. parameter badge
- **Create version modal**: auto-detects structural changes, name + notes input, next version number auto-assigned
- **"Diff vs. current" button** on each version row: opens read-only `ModelDiffPreview` modal comparing stored `modelJson` vs. live editor state
- **"Restore" button** on each version row: confirmation dialog → applies `modelJson` to editor via `setWholeModel`, marks dirty, no auto-save
- **"View model at this run"** in run history ⋯ menu: fetches `model_snapshot` from `getRun()`, opens read-only diff vs. current model
- **`ModelDiffPreview` `readOnly` prop**: hides Apply/Save buttons for history/version diff flows
- **"Save as scenario baseline" card** in Overview tab: name prompt → `forkModel` with `parentModelId` → navigates to forked model
- **Provenance badge**: if `model.parentModelId` set, Overview shows "Forked from [parent name] on [date]"

## Deferred / Out of Scope

| Item | Decision |
|---|---|
| Restore with auto-save | Deferred: restore marks dirty only, consistent with undo/redo and AI apply patterns |
| Version diff including `graph` layout | Deferred: `buildModelDiff` covers 5 structural sections; graph diff is a visual overlay sprint |
| Multi-user version access control (collaborators creating versions) | Deferred: owner-only for now; collaborator versioning requires an ADR |
| Local (unauthenticated) version history | Not started: local mode has no snapshot storage; noted in User Guide |

## Architectural Decisions

| ID | Decision | Outcome |
|---|---|---|
| A68.1 | Restore does not auto-save | Consistent with undo/redo; modeller retains control |
| A68.2 | `parent_model_id` uses ON DELETE SET NULL | Deleting parent orphans children gracefully; no cascade |
| A68.3 | "Copy" flow does NOT set `parent_model_id` | Copy and Scenario Baseline are distinct operations; Copy is a utility clone |
| A68.4 | `readOnly` prop on `ModelDiffPreview` | Minimal surface area; existing component reused; no new component needed |
| A68.5 | Provenance name resolved by parent via `overrides.parentModelName` | Avoids secondary DB fetch inside ModelDetail; App.jsx resolves from loaded models |

## Exit Gate Checklist

- [x] All new tests pass (`structural-changes`, `model-versions`, `model-diff`)
- [x] Full regression: existing engine tests unaffected
- [x] Production build succeeds
- [x] ADR-015 created: Model versioning as explicit milestones
- [x] AGENTS.md updated with versioning rules
- [x] User Guide updated to reflect versioning capability
- [x] Sprint 68 plan marked complete
