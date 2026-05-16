# Sprint 41 — Closure Report
**Sprint:** 41 — Engine UI Exposure
**Completed:** 2026-05-15
**Branch:** sprint-41 (merged to claude/review-sprints-31-33-0R5Mx)

## Delivered Scope
| Item | Description | Result |
|------|-------------|--------|
| S41.1 | COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR added to BEventEditor effects dropdown | ✅ Done |
| S41.2 | Same macro set added to CEventEditor effects dropdown | ✅ Done |

## Detail

### S41.1 — BEventEditor Effects Dropdown
**Problem:** The bEffectOptions function in helpers.jsx listed only basic queue operations. Seven engine macros implemented across Sprints 32–34 were absent, making them unreachable in the UI.

**What was built:** The bEffectOptions array in helpers.jsx was extended with entries for COST(amount), PREEMPT(serverType, custId), FAIL(serverType), REPAIR(serverType), SPLIT(n), SET(var, expr), and SET_ATTR(attr, expr). Each entry follows the existing option schema (value, label, description) so the dropdown renders them identically to existing options.

**Files changed:** src/ui/editors/helpers.jsx

**Key design decisions:** Macros were appended in the same order as their engine implementation sprints to make future audits straightforward. No changes were made to the BEventEditor component itself — the dropdown is data-driven from bEffectOptions, so updating the helper was sufficient.

### S41.2 — CEventEditor Effects Dropdown
**Problem:** The cEffectOptions function had the same gap. Conditional events fire on state conditions and legitimately need cost, server, and attribute operations.

**What was built:** The cEffectOptions array received the same seven macro entries as bEffectOptions. The CEventEditor component already consumed cEffectOptions from helpers.jsx, so no component changes were needed.

**Files changed:** src/ui/editors/helpers.jsx

**Key design decisions:** Sharing the macro set between B and C editors ensures consistency. Any future macro additions need only update helpers.jsx.

## Test Results
All existing editor tests passed without modification. No new test files were written. The effect option lists are pure data arrays rendered by existing dropdown logic; the existing snapshot and integration tests cover rendering of the dropdown, which now includes the new entries.

## What's Next
Sprint 42 addresses the usability problem created by the now-large flat dropdown — 30+ options are unwieldy. The EffectPicker chip-based component introduced in Sprint 42 replaces the flat dropdown with a categorised, chip-based UI that groups these new macros under logical headings (Server, State, Cost).
