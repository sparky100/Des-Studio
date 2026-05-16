# Sprint 41 — Engine UI Exposure
**Sprint:** 41 — Engine UI Exposure
**Branch:** sprint-41 (merged to claude/review-sprints-31-33-0R5Mx)
**Date:** 2026-05-15

## Objective
Sprints 32–34 implemented a range of engine-level macros (COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR) but these were never surfaced in the UI. This sprint exposes every implemented macro as a selectable effect in both the B-event and C-event editors, giving modellers access to the full engine capability set without needing to hand-edit model JSON.

## Background
The Three-Phase engine supports a rich vocabulary of entity and server operations: cost accounting via COST, server preemption via PREEMPT, failure injection via FAIL and REPAIR, entity splitting via SPLIT, and state/attribute mutation via SET and SET_ATTR. These were tested at the engine level and confirmed working, but the BEventEditor and CEventEditor effect dropdowns were never updated to include them. Users attempting to model cost-aware or failure-prone systems had no in-UI path to access these capabilities.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S41.1 | Add COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR to BEventEditor effects dropdown | src/ui/editors/helpers.jsx (bEffectOptions) |
| S41.2 | Add the same macro set to CEventEditor effects dropdown | src/ui/editors/helpers.jsx (cEffectOptions) |

## Acceptance Criteria
- The BEventEditor effects dropdown includes COST(amount), PREEMPT(serverType, custId), FAIL(serverType), REPAIR(serverType), SPLIT(n), SET(var, expr), and SET_ATTR(attr, expr) as selectable options
- The CEventEditor effects dropdown includes the same macro set
- Existing effect options (SEIZE, RELEASE, JOIN, etc.) remain present and unaffected
- All existing editor tests pass without modification
- No new test files are required because the effect option lists are pure data and covered by existing snapshot/integration tests

## Dependencies
- Sprint 32: COST and PREEMPT engine macros implemented
- Sprint 33: FAIL, REPAIR, SPLIT engine macros implemented
- Sprint 34: SET and SET_ATTR engine macros implemented
- BEventEditor and CEventEditor components must be present (implemented in earlier UI sprints)
- helpers.jsx bEffectOptions and cEffectOptions functions must exist as the central registry for effect option lists
