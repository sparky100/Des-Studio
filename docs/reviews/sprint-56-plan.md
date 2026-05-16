# Sprint 56 — ExecutePanel Custom Hooks Extraction

**Sprint:** 56
**Branch:** sprint-47a
**Date planned:** 2026-05-16
**Status:** Planned

---

## Context

Sprint 55a completed the component-layer god component decomposition:
- `ModelDetail.jsx` reduced to 965 lines (−22%)
- `App.jsx` reduced to 504 lines (−33%)
- `execute/index.jsx` reduced to 2,293 lines (−7%)
- All `editors/` already decomposed in prior sprints

The remaining god component is `execute/index.jsx` (2,293 lines), which cannot be further reduced by component extraction alone. The remaining work requires *custom hook extraction* — moving stateful logic out of the render function into dedicated `src/ui/execute/hooks/` files.

---

## Audit Findings

`execute/index.jsx` contains 9 logical concerns. Four are safely extractable as self-contained hooks with minimal cross-concern dependencies:

| Concern | State vars | Key logic | Shared state risk |
|---------|-----------|-----------|-------------------|
| Run History | 3 | fetch/reload saved runs | Low |
| Saved Experiments | 7 | fetch/CRUD saved experiments | Low |
| Visualization Settings | 6 | animation, KPI slots, speed, persist | Low |
| Share Links | 7 | create/revoke/list share links | Medium (saveStatus) |

Five concerns (**Simulation Engine**, **Replication Runner**, **Sweep Runner**, **Experiment Setup**, **Export & Comparison**) share core state (`results`, `saveStatus`, `seed`, `warmupPeriod`, `maxSimTime`, etc.) and cannot be safely extracted without a larger architectural refactor. These are deferred.

---

## Scope

### Deliverables

| ID | Hook | File | What moves |
|----|------|------|------------|
| F56.1 | `useRunHistory` | `src/ui/execute/hooks/useRunHistory.js` | `savedRunHistory`, `runHistoryStatus`, `runHistoryError`, load-on-AI-panel-open effect |
| F56.2 | `useSavedExperiments` | `src/ui/execute/hooks/useSavedExperiments.js` | `experiments`, `experimentsStatus`, `experimentsError`, load-on-section-change effect |
| F56.3 | `useVisualizationSettings` | `src/ui/execute/hooks/useVisualizationSettings.js` | `animationEnabled`, `collectTimeSeries`, `kpiSlots`, `speedMultiplier`, `selectedNodeLabel`, `selectedEntityId`, load-settings effect, persist handlers |
| F56.4 | `useShareLinks` | `src/ui/execute/hooks/useShareLinks.js` | `shareLinks`, `showShareModal`, `shareConfig`, `shareSaving`, `justCreatedLink`, `shareLinksLoading`, `qrToken`, `qrRef`, create/revoke/toggle handlers |

### Hook Interface Specs

#### F56.1 — `useRunHistory`

```js
export function useRunHistory({ userId, modelId, aiPanelOpen }) {
  // returns:
  return { savedRunHistory, runHistoryStatus, runHistoryError, loadRunHistory };
}
```

#### F56.2 — `useSavedExperiments`

```js
export function useSavedExperiments({ userId, modelId, executeSection }) {
  // returns:
  return { experiments, experimentsStatus, experimentsError, loadExperiments };
}
```

#### F56.3 — `useVisualizationSettings`

```js
export function useVisualizationSettings({ userId }) {
  // returns:
  return {
    animationEnabled, collectTimeSeries, kpiSlots, speedMultiplier,
    selectedNodeLabel, setSelectedNodeLabel, selectedEntityId, setSelectedEntityId,
    effectiveAutoSpeed,
    toggleAnimation, handleKpiSlotChange, saveExecuteSetting,
  };
}
```

#### F56.4 — `useShareLinks`

```js
export function useShareLinks({ userId, modelId, results, latestRunId, onStatusChange }) {
  // returns:
  return {
    shareLinks, showShareModal, setShowShareModal,
    shareConfig, setShareConfig, shareSaving, justCreatedLink,
    shareLinksLoading, qrToken, setQrToken, qrRef,
    loadShareLinks, handleCreateShareLink, handleRevokeShareLink, toggleWidget,
  };
}
```

`onStatusChange` is a callback for `(status)` → `setSaveStatus` in the parent, keeping saveStatus in execute/index.jsx.

### Directory structure

```
src/ui/execute/hooks/
  useRunHistory.js
  useSavedExperiments.js
  useVisualizationSettings.js
  useShareLinks.js
```

---

## Target Metrics

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `execute/index.jsx` | 2,293 | ~1,970 | −14% |
| New hook files | — | ~340 | — |

---

## Out of Scope

- `useSimulationEngine` — tightly coupled to `results`, `saveStatus`, `replicationResults`
- `useReplicationRunner` — tightly coupled to same core state
- `useSweepRunner` — tightly coupled to same core state
- `useExperimentSetup` — core parameters shared by all runners; cannot extract
- Any changes to engine, db, or test files

---

## Acceptance Criteria

- [ ] All 4 hooks created in `src/ui/execute/hooks/`
- [ ] Each hook has explicit return type (named properties)
- [ ] `execute/index.jsx` < 2,000 lines
- [ ] No state or behaviour changes — existing tests pass
- [ ] `npx vite build --mode development` passes
- [ ] `npx vitest run` passes (600+ tests)
