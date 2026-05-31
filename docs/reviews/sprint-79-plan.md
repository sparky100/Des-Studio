# Sprint 79 — Consistent Panel Visibility UX (All Main Views)

**Sprint:** 79
**Theme:** Extend Sprint 78's collapsible-panel UX pattern to BottomPanel and Results Workspace
**Status:** ✅ Complete | **Completed:** 2026-05-31
**Branch:** `claude/mobile-designer-visibility-2022P`
**Owner:** parkinsonsj@gmail.com

---

## Goal

Sprint 78 delivered collapsible panels and smooth animations for the Visual Designer. Sprint 79 audits every other main panel in the app and applies the same best-in-class pattern where genuine value exists.

---

## Panel Audit Summary

| Panel | Assessment | Action |
|---|---|---|
| Visual Designer palette + inspector | ✅ Done (Sprint 78) | No change |
| Execute **BottomPanel** | Collapse/resize work but state resets every session | **Build** |
| **Results Workspace** | 5 sections in a fixed long scroll; no collapse | **Build** |
| Design editors (Entities, Queues, B-Events, C-Events) | Already have per-item accordion + Expand/Collapse all | Leave alone |
| AI Sidebar | Already has draggable resize + localStorage persistence | Leave alone |
| Execute Studies / Experiments | Already have chevron collapse | Leave alone |
| Validate tab | Simple list, nothing to collapse | Leave alone |
| Overview tab | Read-only summary, nothing to collapse | Leave alone |

---

## Feature Scope

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F79.1 | BottomPanel — localStorage persistence (collapsed, height, tab) | ✅ | State restored on every session; collapse, height and active tab all persisted |
| F79.2 | BottomPanel — Preset height pills (S / M / L) | ✅ | S=220, M=320, L=520 px buttons in panel header; active pill highlighted; preset persisted |
| F79.3 | Results Workspace — Collapsible section headers | ✅ | 5 collapsible sections with rotating chevron; localStorage persistence; badge counts on chart sections |

---

## Design Decisions

### BottomPanel persistence

The three state variables `collapsed`, `bodyHeight`, and the active tab are initialised from `localStorage` using lazy initialisers (same pattern as Visual Designer palette). Tab validation guards against stale values from old app versions. Height is persisted on drag-end via a functional updater that reads the latest state value (avoids stale closure).

localStorage keys: `des.bottomPanel.collapsed`, `des.bottomPanel.height`, `des.bottomPanel.tab`

### Preset height pills

Three pills (S / M / L) appear in the panel header when not collapsed. The active preset is detected by proximity (within 4 px). Clicking a preset also disables maximized mode. This matches the UX convention where the header controls are always visible and clearly labelled.

### Results Workspace sections

Five collapsible sections replace the flat scroll. Each has a consistent `SectionHeader` button component with a rotating `▶` chevron, uppercase label, optional badge count, and `aria-expanded` attribute. State is persisted as a JSON object to `localStorage("des.results.sections")`.

Sections default open on first visit. The "Bottlenecks" section carries a count badge (number of charts). The outer wrapper `display` is controlled explicitly (`"flex"/"none"` or `"block"/"none"`) rather than the HTML `hidden` attribute to avoid a CSS specificity conflict with inline `display: flex` styles.

The early-return path (no chart data available) also gets collapsible summary and runtime sections for consistency.

---

## Files Changed

| File | Change |
|---|---|
| `src/ui/execute/BottomPanel.jsx` | localStorage initialisers for collapsed/height/tab; persist on change; S/M/L preset pills |
| `src/ui/results/ResultsWorkspace.jsx` | `SECTION_DEFAULTS` constant, `SectionHeader` component, `sectionsOpen` state, `toggleSection` handler, 5 collapsible section wrappers |
| `docs/reviews/sprint-79-plan.md` | This document |
| `docs/DES_Studio_Build_Plan.md` | Sprint 79 entry added |
| `AGENTS.md` | Sprint pointer updated to Sprint 79 |
