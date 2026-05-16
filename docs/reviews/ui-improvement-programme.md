# DES Studio — UI Improvement Programme
**Source:** `docs/ui-ux-review.md` (reviewed 2026-05-16)
**Sprints:** 47–53
**Baseline rating:** 6 / 10 UX maturity
**Target rating:** 8.5 / 10 UX maturity

---

## Programme Overview

Seven sprints translate the UI/UX review findings into actionable, sequenced work. They are ordered so that foundational changes (accessibility, tokens, responsive infrastructure) land before feature-level polish and structural refactoring. Each sprint is self-contained and can be merged independently.

| Sprint | Title | Primary Review Refs | Effort | Risk |
|--------|-------|---------------------|--------|------|
| 47 | Accessibility Foundations | CI-2, CI-3, A-1–A-7 | Small | Low |
| 48 | Design Token System Completion | CON-1–CON-5, DS-1–DS-3 | Medium | Low |
| 49 | UX Quick Wins & Interaction Polish | UX-2–UX-6, UX-9–UX-10, QW-3, QW-7–QW-9 | Small | Low |
| 50 | Feedback, Loading States & Notifications | S-3, S-4, S-6, UX-7, UX-8 | Medium | Low |
| 51 | DistPicker Redesign | UX-1, S-5 | Medium | Medium |
| 52 | Responsive Design & Layout Robustness | R-1, R-2, R-3 | Medium | Medium |
| 53 | Component Architecture: God Component Decomposition | CI-4, S-2 | Large | High |

---

## Recommended Delivery Sequence

```
Sprint 47 (Accessibility)
    │
    └─► Sprint 48 (Tokens)
              │
              ├─► Sprint 49 (UX Quick Wins)   ─► Sprint 50 (Notifications)
              │
              └─► Sprint 52 (Responsive)
                        │
                        └─► Sprint 51 (DistPicker)  ─► Sprint 53 (Decomposition)
```

Sprints 49 and 52 can run in parallel once Sprint 48 is merged. Sprint 51 depends on Sprint 48 only. Sprint 53 must come last.

---

## Issues Addressed by Sprint

### Sprint 47 — Accessibility Foundations
| Issue | Severity | Fix |
|-------|----------|-----|
| CI-2 / A-1: No focus rings | Critical | Global `*:focus-visible` CSS rule in index.html |
| CI-3 / A-2: 8–9px label text | Critical | Minimum 11px floor; tokens.js update |
| A-3: No aria-live on AI stream | Medium | `aria-live="polite"` on response container |
| A-4: Table headers missing scope | Medium | `scope="col"` on all `<th>` elements |
| A-5: Modal dialogs missing aria-labelledby | Medium | Add `id` + `aria-labelledby` to all modals |
| A-6: Muted text contrast 3.6:1 | High | Lighten `C.muted` to `#7a98bb` |
| A-7: Icon buttons missing aria-label | Medium | Audit and add `ariaLabel` props |

### Sprint 48 — Design Token System Completion
| Issue | Severity | Fix |
|-------|----------|-----|
| CON-1: Spacing hardcoded | High | `SPACE` token object |
| CON-2: Border-radius inconsistent | Medium | `RADIUS` token object |
| CON-3: Opacity suffix pattern fragile | Medium | `alpha()` utility function |
| CON-4: Overlay/shadow hardcoded | Medium | `C.overlay`, `SHADOW` tokens |
| CON-5: Ghost button bg hardcoded | Low | `C.surfaceHover` token |
| DS-1: No typography scale | High | `TYPO` token object |
| DS-2: No z-index / transition tokens | Medium | `Z`, `TRANS` token objects |
| DS-4: Btn variants undocumented | Low | JSDoc comments; audit `success` variant |

### Sprint 49 — UX Quick Wins & Interaction Polish
| Issue | Severity | Fix |
|-------|----------|-----|
| UX-2: No Ctrl+S save shortcut | High | Keyboard handler in ModelDetail.jsx |
| UX-3: Discard button no confirmation | Medium | Two-step confirmation state |
| UX-4: Starter guide is blocking modal | Medium | Inline dismissible card in Overview tab |
| UX-5: Tab badges no tooltip detail | Medium | `title` attribute on badge elements |
| UX-6: Apply & Rerun no loading state | Medium | "Verifying…" state in AiAssistantPanel |
| UX-9: Empty states generic | Low | `action` prop on Empty component |
| UX-10: Goal metrics undiscoverable | Low | KPI dropdown in GoalsEditor |

### Sprint 50 — Feedback, Loading States & Notifications
| Issue | Severity | Fix |
|-------|----------|-----|
| S-3: No toast notification system | Medium | `ToastContext.jsx` + portal rendering |
| S-4: "Loading…" text for lazy panels | Medium | `SkeletonPanel.jsx` with pulse animation |
| UX-7: Run history no bulk operations | Medium | Checkbox + bulk-action bar |
| UX-8: Log viewer no search/filter | Medium | Text search + phase toggle buttons |
| S-6: Keyboard shortcuts not discoverable | Low | `KeyboardShortcutsModal.jsx` + `?` shortcut |

### Sprint 51 — DistPicker Redesign
| Issue | Severity | Fix |
|-------|----------|-----|
| UX-1 / S-5: DistPicker cognitively overloading | High | Two-step family picker + inline help text + parameter validation + sparkline preview |

### Sprint 52 — Responsive Design & Layout Robustness
| Issue | Severity | Fix |
|-------|----------|-----|
| R-1: Single breakpoint at 720px | High | Second breakpoint at 1024px; tab overflow handling |
| R-2: `window.innerWidth` anti-pattern | Medium | `useViewport()` hook with ResizeObserver |
| R-3: Admin panel no mobile layout | Medium | Accordion sections on mobile |

### Sprint 53 — Component Architecture
| Issue | Severity | Fix |
|-------|----------|-----|
| CI-4 / S-2: ModelDetail.jsx 1,410 lines | High | 5 extracted components; shell ≤ 350 lines |
| CI-4 / S-2: App.jsx 863 lines | High | 3 extracted components; shell ≤ 200 lines |
| CI-4: ExecutePanel/index.jsx ~1,200 lines | High | 3 extracted components; shell ≤ 300 lines |

---

## Issues Already Fixed (Pre-Programme)

The following critical issues were resolved in the Sprint 46 post-merge commit (PR #44) before this programme began:

| Issue | Fix Applied |
|-------|-------------|
| CI-1: `C.primary` undefined in AiAssistantPanel | Replaced with `C.text` |
| AI suggestion display shows raw ```json fences | Stripped in streaming display |

---

## New Files Created by Programme

| File | Sprint | Purpose |
|------|--------|---------|
| `src/ui/shared/hooks.js` | 52 | `useViewport()` hook, `BP` breakpoint constants |
| `src/ui/shared/ToastContext.jsx` | 50 | Toast notification system |
| `src/ui/shared/SkeletonPanel.jsx` | 50 | Loading skeleton placeholder |
| `src/ui/shared/KeyboardShortcutsModal.jsx` | 50 | Keyboard shortcuts overlay |
| `src/ui/shared/DistHelp.js` | 51 | Distribution help text constants |
| `src/ui/shared/DistSparkline.jsx` | 51 | Distribution curve SVG renderer |
| `src/ui/UndoRedoProvider.jsx` | 53 | Undo/redo React context |
| `src/ui/ModelDetailHeader.jsx` | 53 | Header bar sub-component |
| `src/ui/ModelTabBar.jsx` | 53 | Tab navigation sub-component |
| `src/ui/ModelSaveManager.jsx` | 53 | Save/discard lifecycle manager |
| `src/ui/ModelOverviewPane.jsx` | 53 | Overview tab content |
| `src/ui/AuthShell.jsx` | 53 | Authentication screens |
| `src/ui/AppShell.jsx` | 53 | Top navigation bar |
| `src/ui/ModelLibrary.jsx` | 53 | Model library and cards |
| `src/ui/execute/ExperimentControls.jsx` | 53 | Experiment config form |
| `src/ui/execute/SweepConfig.jsx` | 53 | Sweep parameter config |
| `src/ui/execute/RunController.jsx` | 53 | Run orchestration logic |

---

## Expected UX Maturity Progression

| After Sprint | Maturity Rating | Primary Gain |
|-------------|----------------|--------------|
| Baseline | 6.0 / 10 | — |
| 47 | 6.5 / 10 | Keyboard and AT users can now use the app |
| 48 | 7.0 / 10 | Visual consistency improves noticeably |
| 49 | 7.3 / 10 | Core editing interactions feel polished |
| 50 | 7.7 / 10 | System feedback is professional-grade |
| 51 | 8.0 / 10 | Distribution authoring is guided and safe |
| 52 | 8.3 / 10 | Tablet and mobile are genuinely usable |
| 53 | 8.5 / 10 | Codebase is maintainable at scale |
