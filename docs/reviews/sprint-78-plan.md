# Sprint 78 — Visual Designer Canvas Visibility

**Sprint:** 78
**Theme:** Maximise canvas visibility through collapsible panels and uncapped canvas height
**Status:** ✅ Complete | **Completed:** 2026-05-31
**Branch:** `claude/mobile-designer-visibility-2022P`
**Owner:** parkinsonsj@gmail.com

---

## Goal

Improve modeller productivity in the Visual Designer by giving the canvas as much screen real estate as possible. Prior to this sprint, the Node Palette and Inspector were always rendered at fixed widths, the canvas had a hard 680 px height cap, and there was no way to dismiss either side panel.

Sprint 78 delivers three targeted UX improvements:

1. **Collapsible Node Palette** — collapses to a 44 px icon strip; persists preference in localStorage.
2. **Auto-hide + dismissible Inspector** — opens automatically when a node is selected; can be manually closed; a re-open handle remains visible while a node is active.
3. **Uncapped canvas height** — canvas now fills available vertical space up to 900 px (was hard-capped at 680 px).

---

## Scope Guardrails

- Changes confined to `src/ui/visual-designer/` (VisualDesignerPanel, VisualNodeInspector, FlowDiagramReactFlow)
- No schema changes, no Supabase migrations, no new dependencies
- No changes to engine, run semantics, or test fixtures
- All drag-drop and click-to-add palette interactions remain functional in the collapsed icon strip
- Keyboard delete handler unaffected

---

## Feature Scope

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F78.1 | Collapsible Node Palette | ✅ | 44 px icon strip with coloured node-type buttons; `‹`/`›` toggle; preference persisted to `localStorage("des.palette.collapsed")` |
| F78.2 | Auto-hide Inspector | ✅ | Inspector width animates to 0 when no node selected; auto-opens (width 280 px) on node select |
| F78.3 | Dismissible Inspector with re-open handle | ✅ | `›` close button in Inspector header; vertical `Inspector ›` handle tab appears when node is selected but inspector is closed |
| F78.4 | Uncapped canvas height | ✅ | Canvas height changed from `clamp(380, 100vh−360, 680)` to `clamp(400, 100vh−260, 900)` |
| F78.5 | Smooth width transitions | ✅ | `width 220ms cubic-bezier(0.4,0,0.2,1)` on both palette and inspector wrappers |

---

## Design Decisions

### Layout: grid → flexbox

The previous 3-column CSS grid prevented width animation (CSS grid column-width transitions are not well-supported). The layout was refactored to a flex row so that `width` transitions on the palette and inspector wrappers produce smooth slide animations via `overflow: hidden`.

### Palette collapsed state

Rather than rendering a zero-width version of the full palette, the collapsed state renders a purpose-built icon strip (44 px). Each icon button is independently draggable and clickable, preserving all palette functionality. The `PALETTE_ITEMS` constant is hoisted to module scope so both render paths share the same type/color data.

### Inspector visibility model

| State | Width | Behaviour |
|---|---|---|
| No node selected | 0 px | Inspector hidden; no handle shown |
| Node selected, inspector open | 280 px | Full inspector content visible |
| Node selected, inspector manually closed | 0 px | Vertical "Inspector ›" handle tab shown at right edge |

A `useEffect` on `selectedNodeId` resets `inspectorCollapsed` to `false` whenever a new node is selected — ensuring the inspector always opens on first click. The user can then close it with the `›` button.

### Canvas height

The 680 px cap was introduced for a narrower viewport assumption. The new formula `clamp(400px, calc(100vh - 260px), 900px)` accounts for the header (~56 px), tab bar (~44 px), canvas toolbar (~32 px), and outer padding (~128 px) summing to ~260 px, giving the canvas the remaining viewport height up to 900 px on very tall displays.

---

## Files Changed

| File | Change |
|---|---|
| `src/ui/visual-designer/VisualDesignerPanel.jsx` | Full layout refactor: flex row, collapsible palette, animated inspector, re-open handle |
| `src/ui/visual-designer/VisualNodeInspector.jsx` | Added `onClose` prop; close button in inspector header |
| `src/ui/visual-designer/FlowDiagramReactFlow.jsx` | Canvas height formula updated |
| `docs/reviews/sprint-78-plan.md` | This document |
| `docs/simmodlr_Build_Plan.md` | Sprint 78 entry added to roadmap snapshot |
| `AGENTS.md` | Current sprint pointer updated to Sprint 78 |
