# Sprint 48 — Design Token System Completion
**Sprint:** 48 — Design Token System Completion
**Branch:** sprint-48
**Date:** 2026-05-16

## Objective
Complete the design token system by adding spacing, border-radius, shadow, z-index, typography, and transition constants to tokens.js. Then do a targeted normalisation pass on the most heavily used files to eliminate the ad-hoc hardcoded values identified in the UI/UX review.

## Background
`tokens.js` currently exports ~37 colour constants — a strong foundation — but nothing else. Spacing, padding, border-radius, shadows, z-index stacking, typography sizes, and transition timings are all hardcoded as raw pixel values scattered across ~18,000 lines of JSX. The result is visible inconsistency: form field padding varies between `"5px 8px"` (BEventEditor), `"7px 8px"` (AiAssistantPanel), and `"8px 10px"` (Field component) for the same conceptual slot. Five distinct border-radius values (4px, 5px, 6px, 8px, 10px) are in use with no documented rule for when each applies.

The hex-opacity suffix pattern (`C.amber + "18"`, `C.red + "44"`) appears in 30+ locations. It is CSS-valid but undocumented and will silently break if any base colour token is ever changed to a non-hex value. Modal overlays and panel shadows use inline hex literals (`"#000000aa"`, `"#000a"`) that bypass the token system entirely.

This sprint establishes the complete token vocabulary and applies it to the highest-traffic files. A full normalisation pass across all 18 editor components is scoped for a future cleanup sprint.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S48.1 | Add `export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }` to tokens.js | `src/ui/shared/tokens.js` |
| S48.2 | Add `export const RADIUS = { sm: 4, md: 6, lg: 10 }` to tokens.js (sm=inputs/chips, md=cards/buttons/panels, lg=modals/overlays) | `src/ui/shared/tokens.js` |
| S48.3 | Add `export const SHADOW = { panel: "-8px 0 32px rgba(0,0,0,0.6)", overlay: "0 8px 32px rgba(0,0,0,0.5)", card: "0 2px 8px rgba(0,0,0,0.4)" }` to tokens.js | `src/ui/shared/tokens.js` |
| S48.4 | Add `export const Z = { dropdown: 100, tooltip: 150, overlay: 180, modal: 200 }` to tokens.js | `src/ui/shared/tokens.js` |
| S48.5 | Add `export const TRANS = { fast: "120ms ease", base: "200ms ease", slow: "300ms ease" }` to tokens.js | `src/ui/shared/tokens.js` |
| S48.6 | Add `export const TYPO = { label: { fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" }, body: { fontSize: 12, fontWeight: 400, lineHeight: 1.5 }, caption: { fontSize: 11, fontWeight: 400 }, heading: { fontSize: 14, fontWeight: 700 }, title: { fontSize: 16, fontWeight: 700 } }` to tokens.js | `src/ui/shared/tokens.js` |
| S48.7 | Add `export const alpha = (hex, opacity) => \`\${hex}\${Math.round(opacity * 255).toString(16).padStart(2, '0')}\`` utility function to tokens.js; replace all 30+ `C.color + "18"` / `C.color + "44"` / `C.color + "66"` patterns with `alpha()` calls | `src/ui/shared/tokens.js`, `src/ui/ModelDetail.jsx`, `src/ui/execute/AiAssistantPanel.jsx`, `src/ui/editors/BEventEditor.jsx`, `src/ui/shared/components.jsx` |
| S48.8 | Add `C.overlay = "rgba(0,0,0,0.67)"` and `C.surfaceHover = "#ffffff08"` to the C object in tokens.js; replace `"#000000aa"` in ModelDetail.jsx line 1288 with `C.overlay`; replace `"#ffffff08"` ghost button bg in components.jsx with `C.surfaceHover` | `src/ui/shared/tokens.js`, `src/ui/ModelDetail.jsx`, `src/ui/shared/components.jsx` |
| S48.9 | Replace hardcoded `boxShadow: '-8px 0 32px #000a'` in App.jsx line 154 with `SHADOW.panel` | `src/App.jsx` |
| S48.10 | Normalisation pass on components.jsx: apply SPACE, RADIUS, TYPO tokens to Btn, Field, CommitInput, SH, SectionPanel components | `src/ui/shared/components.jsx` |
| S48.11 | Normalisation pass on ModelDetail.jsx: apply SPACE, RADIUS, SHADOW, Z tokens to the header bar, tab navigation, modal overlays, and save banner | `src/ui/ModelDetail.jsx` |
| S48.12 | Audit Btn variants: document each variant's semantic purpose in a JSDoc comment; confirm or remove the unused `success` variant | `src/ui/shared/components.jsx` |

## Acceptance Criteria
- `tokens.js` exports: `C`, `FONT`, `SPACE`, `RADIUS`, `SHADOW`, `Z`, `TRANS`, `TYPO`, `alpha`
- `alpha(C.amber, 0.1)` returns a valid 8-digit hex colour string
- Zero instances of the pattern `C.\w+ \+ "\w{2}"` remain in the codebase (grep check)
- Zero hardcoded hex colour literals remain in ModelDetail.jsx or App.jsx (outside of tokens.js itself)
- `components.jsx` Btn, Field, and CommitInput all use SPACE and RADIUS tokens for padding and border-radius
- Ghost button variant uses `C.surfaceHover` (not `"#ffffff08"` literal)
- All modal overlays use `C.overlay`
- Btn variants are documented with JSDoc; `success` variant either has documented usage or is removed
- All existing tests pass; visual appearance is unchanged (pixel-level regressions not expected — spacing adjustments within ±2px are acceptable)

## Dependencies
- Sprint 47 must be complete: the TYPO scale must use the 11px font-size floor established in S47.3
- No engine changes required
- This sprint is a prerequisite for Sprint 52 (responsive hooks) and Sprint 53 (decomposition), both of which need shared token imports
