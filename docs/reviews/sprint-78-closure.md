# Sprint 78 — Closure Report
## Visual Designer Canvas Visibility

**Sprint:** 78
**Completed:** 2026-05-31
**Branch:** `claude/mobile-designer-visibility-2022P`
**Owner:** parkinsonsj@gmail.com

---

## Delivered Scope

All five features in the sprint plan were delivered in full.

| ID | Feature | Delivered |
|---|---|---|
| F78.1 | Collapsible Node Palette (44 px icon strip, localStorage persistence) | ✅ |
| F78.2 | Auto-hide Inspector (animates to 0 when no node selected; opens on node select) | ✅ |
| F78.3 | Dismissible Inspector with vertical re-open handle | ✅ |
| F78.4 | Uncapped canvas height — `clamp(400px, 100vh−260px, 900px)` replacing 680 px cap | ✅ |
| F78.5 | Smooth width transitions — `220ms cubic-bezier(0.4,0,0.2,1)` on palette and inspector | ✅ |

---

## Files Changed

| File | Change |
|---|---|
| `src/ui/visual-designer/VisualDesignerPanel.jsx` | Layout refactored from CSS grid to flex row; collapsible palette; animated inspector; re-open handle |
| `src/ui/visual-designer/VisualNodeInspector.jsx` | Added `onClose` prop and close button in inspector header |
| `src/ui/visual-designer/FlowDiagramReactFlow.jsx` | Canvas height formula updated to remove 680 px cap |

---

## Scope Guardrails — Confirmed

- ✅ Changes confined to `src/ui/visual-designer/`
- ✅ No schema changes, no Supabase migrations, no new dependencies
- ✅ No changes to engine, run semantics, or test fixtures
- ✅ Drag-drop and click-to-add palette interactions functional in collapsed icon strip
- ✅ Keyboard delete handler unaffected

---

## Key Design Decisions

**Grid → flexbox refactor:** CSS grid column-width transitions are not well-supported, so the layout was refactored to a flex row to enable smooth `width` animations on palette and inspector wrappers.

**Inspector visibility model:** A `useEffect` on `selectedNodeId` resets `inspectorCollapsed` to `false` on every new node selection, ensuring the inspector always opens on first click, with the option to dismiss it manually.

**Canvas height formula:** `clamp(400px, calc(100vh - 260px), 900px)` — the 260 px offset accounts for header (~56 px), tab bar (~44 px), canvas toolbar (~32 px), and outer padding (~128 px).

---

## Acceptance Criteria — Verified

- [x] Palette collapses to icon strip; expand/collapse toggle works; preference persists on reload
- [x] Inspector auto-opens when a node is selected; auto-hides when selection is cleared
- [x] Inspector can be manually dismissed; vertical handle re-appears while node remains selected
- [x] Canvas fills available viewport height; no longer capped at 680 px
- [x] No regressions in node add, connect, delete, or property editing flows
