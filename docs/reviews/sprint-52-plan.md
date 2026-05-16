# Sprint 52 — Responsive Design & Layout Robustness
**Sprint:** 52 — Responsive Design & Layout Robustness
**Branch:** sprint-52
**Date:** 2026-05-16

## Objective
Replace the single 720px breakpoint and `window.innerWidth` anti-pattern with a proper two-breakpoint responsive system backed by a `useViewport()` custom hook. Fix tablet layout clipping in the model editor tab bar and ExecutePanel. Make the admin panel usable on mobile.

## Background
The application detects viewport width by reading `window.innerWidth` inside a `useState` initialiser in `ModelDetail.jsx` (lines 235–241) and attaching a raw resize event listener. This is a React anti-pattern: it is incompatible with server-side rendering, requires manual cleanup, and can produce stale values if the component renders before the resize event fires.

More importantly, there is only a single breakpoint at 720px. Tablets at 768–1024px (iPad Air landscape, Surface Pro) receive the full desktop layout, which is too dense at that width. The ModelDetail tab bar overflows and clips at ~900px. The ExecutePanel's side-by-side canvas + AI panel layout clips the AI panel entirely at widths below ~950px. The admin panel has no responsive consideration at all — at mobile widths it becomes a horizontally scrolling table with no usable form controls.

A `useViewport()` hook using `ResizeObserver` on the document body provides a clean, testable, SSR-safe replacement for the current pattern. Defining the breakpoints as shared constants means both components and the hook use the same values.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S52.1 | Create `src/ui/shared/hooks.js`: export `useViewport()` hook using `ResizeObserver` on `document.documentElement`; returns `{ width, isMobile, isCompact, isDesktop }`; define `BP = { mobile: 720, compact: 1024 }` as an exported constant | `src/ui/shared/hooks.js` |
| S52.2 | Replace `window.innerWidth` state + resize listener in ModelDetail.jsx with `useViewport()`; remove the manual `addEventListener`/`removeEventListener` calls | `src/ui/ModelDetail.jsx` |
| S52.3 | Add compact desktop layout for ModelDetail tab bar (720–1024px): hide the three least-used tabs (Access, History, Validate) behind a "More ▾" dropdown at compact width; all tabs remain accessible | `src/ui/ModelDetail.jsx` |
| S52.4 | Fix ExecutePanel side-by-side layout at compact width: when `isCompact` is true, stack AI assistant panel below the simulation canvas vertically rather than side-by-side; the AI panel should not clip | `src/ui/execute/index.jsx` |
| S52.5 | Admin panel mobile treatment: when `isMobile` is true, each admin section (LLM Config, Platform Limits, Users, Audit Log) renders as a collapsible accordion; form fields stack full-width; tables use card-style stacked rows instead of horizontal scroll | `src/ui/AdminPanel.jsx` |
| S52.6 | Add `isCompact` handling to AdminPanel.jsx: at 720–1024px the two-column form layout (label left, input right) collapses to single-column stacked | `src/ui/AdminPanel.jsx` |
| S52.7 | Export `BP` constant from `hooks.js` and import it in ModelDetail.jsx, execute/index.jsx, and AdminPanel.jsx to ensure all breakpoint checks use the same values | `src/ui/shared/hooks.js`, `src/ui/ModelDetail.jsx`, `src/ui/execute/index.jsx`, `src/ui/AdminPanel.jsx` |

## Acceptance Criteria
- `useViewport()` hook is implemented using `ResizeObserver`; no component uses `window.innerWidth` directly or `window.addEventListener("resize", ...)` for layout decisions
- At 768px width, the ModelDetail tab bar does not overflow or clip; less-used tabs appear in a "More" dropdown
- At 900px width, the ExecutePanel AI assistant panel is visible and scrollable below the canvas (not clipped)
- At 480px width, the admin panel shows a usable single-column stacked layout with accordion sections
- At 1280px width, all existing desktop layouts are unchanged
- `BP.mobile` and `BP.compact` constants are defined once and used everywhere
- All existing tests pass; new tests cover: `useViewport()` returns correct `isMobile`/`isCompact` flags for given widths, ModelDetail renders correct tab configuration at each breakpoint

## Dependencies
- Sprint 48 (design tokens) should be complete — the `SPACE` and `RADIUS` tokens are used in the new responsive layouts
- Sprint 53 (god component decomposition) will benefit from this sprint being complete first, as the extracted sub-components will import `useViewport()` from hooks.js
- No engine changes required
