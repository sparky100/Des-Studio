# Sprint 68 Plan — Model Versioning

**Sprint:** 68
**Theme:** Explicit model versioning — milestones, not save counters
**Date planned:** 2026-05-20
**Branch:** `main`

---

## Objectives

1. Allow modellers to tag a model state as a named version (milestone, not auto-increment)
2. Track version history with notes and timestamps
3. Distinguish structural changes (topology) from parameter tweaks (scenarios)
4. Reference versions in run records for reproducibility
5. Keep sharing at the model level — fork copies the current draft

---

## Design Principles

| Principle | Rationale |
|-----------|-----------|
| Versions are explicit milestones | Modellers save 50 times while drafting; only some states deserve a version tag |
| Model = topology | Entity types, events, queues, routing logic define the model; distribution parameters are scenarios |
| Sharing is model-level | You share "the model", not "version 3 of the model" |
| Fork copies the draft | Forkers get the current working model, not a tagged version |
| Runs optionally reference a version | Reproducibility is guaranteed by `model_snapshot`; version reference is for human navigation |

---

## Scope

| # | Item | Area | Files |
|---|------|------|-------|
| 68-1 | Database schema — `model_versions` table + SQL migration | DB | `supabase/migrations/`, `docs/` |
| 68-2 | DB layer — CRUD wrappers: `createVersion()`, `listVersions()`, `getVersion()`, `deleteVersion()` | DB | `src/db/models.js` |
| 68-3 | Engine — structural change detection utility (`detectStructuralChanges()`) | Engine | `src/engine/validation.js` (new) |
| 68-4 | UI — Version history panel in ModelDetail (new tab or sidebar section) | UI | `src/ui/ModelDetail.jsx`, `src/ui/VersionHistoryPanel.jsx` (new) |
| 68-5 | UI — Create version dialog with name, notes, and structural change summary | UI | `src/ui/CreateVersionModal.jsx` (new) |
| 68-6 | UI — Run records store `version_id` (optional, nullable) | UI/DB | `src/ui/execute/index.jsx`, `src/db/models.js` |
| 68-7 | Tests — DB layer, UI components, structural change detection | Tests | `tests/db/`, `tests/ui/`, `tests/engine/` |
| 68-8 | Full regression — all tests pass, build succeeds | CI | — |
| 68-9 | Documentation — AGENTS.md, User Guide, ADR-015 | Docs | `AGENTS.md`, `docs/DES_Studio_User_Guide.md`, `docs/decisions/` |

---

## Detailed Design

### 68-1: Database Schema

New table `model_versions`:

```sql
CREATE TABLE model_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    UUID NOT NULL REFERENCES des_models(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,           -- 1, 2, 3... per model
  name        TEXT,                       -- optional label: "v1 - Initial design"
  notes       TEXT,                       -- modeller's description of what changed
  model_json  JSONB NOT NULL,             -- snapshot of model_json at version time
  is_structural BOOLEAN DEFAULT true,     -- true = topology change, false = parameter tweak
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  created_by  UUID REFERENCES auth.users(id),
  UNIQUE(model_id, version)
);

CREATE INDEX idx_model_versions_model ON model_versions(model_id, version DESC);
```

Migration file: `supabase/migrations/20260520000000_add_model_versions.sql`

### 68-2: DB Layer

New functions in `src/db/models.js`:

```javascript
export async function createVersion(modelId, userId, { version, name, notes, modelJson, isStructural })
export async function listVersions(modelId)              // ordered by version DESC
export async function getVersion(modelId, version)       // single version by number
export async function deleteVersion(modelId, versionId, userId)  // owner-only
export async function getNextVersion(modelId)            // max(version) + 1
```

Rules:
- Only model owner can create/delete versions
- `version` auto-increments (next = max + 1)
- `modelJson` is a deep copy of current `model_json`

### 68-3: Structural Change Detection

Utility in `src/engine/validation.js`:

```javascript
export function detectStructuralChanges(oldModel, newModel) {
  // Structural keys: entityTypes, bEvents, cEvents, queues, graph
  // Parameter keys: distribution params, server counts, experimentDefaults
  // Returns: { isStructural: boolean, changes: string[] }
}
```

Structural changes (topology):
- Entity type added/removed/renamed
- B-Event or C-Event added/removed/renamed
- Queue added/removed/renamed
- Condition logic changed (predicate JSON differs)
- Macro actions changed
- Graph structure changed (nodes/edges)

Parameter changes (not structural):
- Distribution parameter values changed (rate, mean, min/max)
- Server pool size changed
- Experiment defaults changed (warm-up, run length, replications)
- Model name/description changed

### 68-4: Version History Panel

New component `src/ui/VersionHistoryPanel.jsx`:

- Shows list of versions in descending order (newest first)
- Each row: version number, name (if set), date, structural/parameter badge, notes preview
- Click a version to view its snapshot (read-only)
- "Create version" button opens dialog
- Owner-only: delete button on each version

Placement: New tab in ModelDetail workflow shell, or section in the existing "Access" tab.

### 68-5: Create Version Dialog

New component `src/ui/CreateVersionModal.jsx`:

- Pre-filled version number (next available)
- Optional name field (e.g., "v1 - Initial design")
- Notes textarea (what changed, why this is a milestone)
- Structural change summary (auto-detected from last version)
- "Create version" button saves the snapshot

### 68-6: Run Records Reference Version

Update `saveRun()` in `src/db/models.js`:
- Add optional `version_id` parameter (nullable UUID)
- Run records store `version_id` if run was against a tagged version
- Existing runs remain valid (no migration needed)

UI change in Execute panel:
- If current model has versions, show "Running against: draft" or "Running against: v2"
- After run, store the version_id if running against a tagged version

### 68-7: Tests

DB tests (`tests/db/model-versions.test.js`):
- `createVersion()` stores snapshot correctly
- `listVersions()` returns versions in descending order
- `getNextVersion()` returns max + 1
- Non-owner cannot create/delete versions
- `deleteVersion()` removes the version

UI tests (`tests/ui/version-history.test.jsx`):
- Version history panel renders with mock versions
- Create version dialog shows next version number
- Structural change badge displays correctly
- Delete version requires owner

Engine tests (`tests/engine/structural-changes.test.js`):
- Entity type addition → structural
- Distribution parameter change → not structural
- C-Event condition change → structural
- Server count change → not structural
- Graph node addition → structural

---

## Implementation Guardrails

- Do not change the `model_snapshot` mechanism in run records — it remains the source of truth for reproducibility
- Do not change the fork mechanism — it copies the current draft `model_json`
- Do not auto-create versions on save — versions are always explicit
- Do not break existing runs — `version_id` is nullable, old runs remain valid
- Preserve the existing `model_json` column as the current draft

---

## Exit Gate

- All new tests pass (DB, UI, engine)
- Full regression: 1000+ tests passing
- Production build succeeds (`npm run build`)
- ADR-015 created: "Model versioning as explicit milestones"
- AGENTS.md updated with versioning rules
- User Guide updated to v1.13.0
