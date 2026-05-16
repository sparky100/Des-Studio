# Sprint 47 — Accessibility Foundations
**Sprint:** 47 — Accessibility Foundations
**Branch:** sprint-47
**Date:** 2026-05-16

## Objective
Fix all WCAG 2.1 AA violations identified in the UI/UX review. These are not cosmetic — they are compliance failures that make the application unusable for keyboard-only users and assistive-technology users. This sprint addresses every accessibility finding before any visual polish work begins.

## Background
The UI/UX review (docs/ui-ux-review.md) assigned an overall maturity rating of 6/10. Every accessibility finding is either Critical or High severity. The most damaging issue — no focus ring on any interactive element — means keyboard users have no way to track where focus is on any screen. This is a blanket WCAG 2.4.7 failure across the entire application.

Label font sizes of 8–9px sit below the physiological legibility threshold for monospace text at 96 dpi. The muted text colour (#5c7a99) produces only ~3.6:1 contrast against the dark background, below the WCAG AA minimum of 4.5:1. Streaming AI responses have no aria-live region, modal dialogs lack aria-labelledby, data tables lack scope attributes, and a number of icon-only buttons carry no accessible name.

All of these issues are independently testable, have precise recommended fixes, and can be resolved without architectural changes.

## Scope
| ID | Item | File(s) |
|----|------|---------|
| S47.1 | Add global focus-visible CSS rule to index.html: `*:focus-visible { outline: 2px solid #06b6d4; outline-offset: 2px; }` | `index.html` |
| S47.2 | Lighten `C.muted` from `#5c7a99` to `#7a98bb` in tokens.js to reach WCAG AA 4.5:1 contrast against `C.bg = "#080c10"` | `src/ui/shared/tokens.js` |
| S47.3 | Establish 11px minimum font size floor: mark `"8"` and `"9"` sizes in tokens.js as deprecated; update all usages across editors to use 11px minimum | `src/ui/shared/tokens.js`, all editor components |
| S47.4 | Add `aria-live="polite"` and `aria-atomic="false"` to the AI streaming response container in AiAssistantPanel.jsx | `src/ui/execute/AiAssistantPanel.jsx` |
| S47.5 | Add `scope="col"` to all `<th>` elements in BottomPanel.jsx (line 582) and ModelDetail.jsx run history table | `src/ui/execute/BottomPanel.jsx`, `src/ui/ModelDetail.jsx` |
| S47.6 | Add `aria-labelledby` to all modal dialog containers in ModelDetail.jsx; assign unique `id` to each modal title element | `src/ui/ModelDetail.jsx` |
| S47.7 | Audit all single-character and icon-only buttons; add `ariaLabel` prop wherever missing — priority: BottomPanel.jsx × remove buttons, AiAssistantPanel.jsx close button, all editor delete/remove buttons | `src/ui/execute/BottomPanel.jsx`, `src/ui/execute/AiAssistantPanel.jsx`, all editor components |
| S47.8 | Verify Btn component in components.jsx correctly forwards the `ariaLabel` prop as `aria-label` on the underlying `<button>` element | `src/ui/shared/components.jsx` |

## Acceptance Criteria
- `index.html` contains exactly one `*:focus-visible` CSS rule using `#06b6d4` (the accent token value) with 2px offset; tabbing through any screen shows a visible cyan outline on the focused element
- `C.muted` in tokens.js is `#7a98bb`; verified via contrast checker to produce ≥ 4.5:1 against `#080c10`
- No visible text in the application renders below 11px; all-caps uppercase labels previously at 8–9px are updated to 11px minimum
- The AI assistant streaming response container has `aria-live="polite"` and `aria-atomic="false"`
- All `<th>` elements in BottomPanel.jsx and ModelDetail.jsx have `scope="col"`
- Every modal dialog in ModelDetail.jsx has a matching `aria-labelledby` pointing to its title element's `id`
- No single-character or icon-only button exists anywhere in the application without an `ariaLabel` / `aria-label`
- All existing tests continue to pass; at least 5 new accessibility-focused tests added to the relevant test files

## Dependencies
- CI-1 (C.primary undefined token) was already fixed in the Sprint 46 post-merge commit — no action needed here
- No engine changes required
- Must be completed before Sprint 48 (token system) as the font-size floor established here informs the TYPO scale
