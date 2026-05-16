# DES Studio — UI/UX Review Report

> Reviewed: 2026-05-16  
> Scope: Full application source — `src/ui/**`, `src/App.jsx`, `index.html`  
> Reviewer: Senior Product Designer / UX Specialist / Front-end UI Reviewer

---

## Executive Summary

DES Studio is a purpose-built discrete-event simulation workbench with a coherent dark theme, strong semantic colour coding, and a well-considered token architecture. The product targets technical users (operations researchers, engineers, modellers) and the aesthetic — dense monospace typography, high-contrast dark palette, simulation-domain colour semantics — is appropriate for that audience.

The application has clearly been built iteratively over many sprints, and that shows. The design system foundation is solid but incomplete: colours are well-tokenised, but spacing, typography scale, border-radius, z-index, and shadows are all hardcoded ad-hoc throughout ~18,000 lines of JSX. Three "god components" (App.jsx 863 lines, ModelDetail.jsx 1,410 lines, ExecutePanel/index.jsx ~1,200 lines) carry a disproportionate share of UI logic. Accessibility is partially addressed but has systematic gaps that would fail a WCAG 2.1 AA audit.

### Top Strengths

- Thoughtful semantic colour system (phase, role, state, domain)
- Undo/redo on the model editing workflow
- Inline validation badges on tabs guiding user attention
- Consistent `Btn` component with clear variant semantics
- Multi-path authoring (Design / AI / Templates)

### Top Weaknesses

- No focus ring on any interactive element — systematic keyboard/accessibility failure
- Spacing, border-radius, typography scale all hardcoded with no tokens
- Inline style duplication across hundreds of repeated `style={{}}` objects
- `C.primary` referenced but undefined in AiAssistantPanel — runtime error path
- Extremely small label text (8–10px) that will fail WCAG contrast at typical screen distances
- No skeleton/loading states — lazy components show plain text "Loading…"

### Overall UX Maturity Rating: 6 / 10

The tool is functional and domain-appropriate. It falls short of production polish at the interaction layer (feedback, loading states, focus, microinteractions) and would benefit significantly from design system consolidation.

---

## Critical Issues

### CI-1 — Undefined colour token: `C.primary`

**Severity:** Critical  
**Location:** `src/ui/execute/AiAssistantPanel.jsx`, line 348

**Evidence:**
```js
color: C.primary  // C.primary does not exist in tokens.js
```

`tokens.js` exports `C.accent` (`#06b6d4`) but no `C.primary`. This is a runtime fault: the conversation history messages render with `color: undefined`, producing unstyled or invisible text for every prior AI exchange shown in the panel.

**Why it matters:** Every user who revisits a conversation history will see broken text rendering.

**Recommended fix:** Replace `C.primary` with `C.accent` throughout AiAssistantPanel.

---

### CI-2 — No visible focus indicators on any interactive element

**Severity:** Critical  
**Location:** `src/ui/shared/components.jsx` (Btn, Field, CommitInput), all editor components, all inputs

**Evidence:**
All interactive elements explicitly suppress the browser default:
```js
outline: "none"  // on inputs in Field component
```
No `:focus-visible` equivalent is applied anywhere. The `Btn` component has no `:focus` state at all.

**Why it matters:** This fails WCAG 2.4.7 (Focus Visible) and renders the application completely unusable by keyboard-only and assistive-technology users. Any user navigating by Tab will have no idea where focus is.

**Recommended fix:** Add a single CSS rule to `index.html`:
```css
*:focus-visible { outline: 2px solid #06b6d4; outline-offset: 2px; }
```
Individual components can override it, but no element should produce a focus-invisible state.

---

### CI-3 — Label font sizes below legibility threshold

**Severity:** Critical  
**Location:** Throughout — `tokens.js` defines scale starting at 8px; used as labels across all editors

**Evidence:**
```js
// tokens.js
"8": "8px",   // used as column headers, field labels
"9": "9px",   // used for all-caps uppercase labels
"10": "10px", // used for secondary captions
```

WCAG SC 1.4.3 requires a minimum 4.5:1 contrast ratio — but even with perfect contrast, 8–9px monospace text at 96 dpi is physiologically difficult to read and inaccessible to anyone with moderate low vision.

**Why it matters:** A simulation tool is already cognitively demanding. Forcing users to squint at 8px labels on a dark background adds unnecessary fatigue and creates accessibility failures.

**Recommended fix:** Set a floor of 11px for all visible text. Reserve 9–10px only for absolutely non-critical decorative badges. Update `tokens.js` to mark sizes below 11px as deprecated.

---

### CI-4 — Three god components with mixed concerns

**Severity:** High  
**Location:** `App.jsx` (863 lines), `ModelDetail.jsx` (1,410 lines), `src/ui/execute/index.jsx` (~1,200 lines)

**Evidence:** `ModelDetail.jsx` manages undo/redo state, tab routing, save/dirty state, validation, keyboard shortcuts, responsive layout detection, modal visibility, and run history — all in a single component. `App.jsx` handles auth state, model library, template browsing, forking, and admin mode.

**Why it matters:** New feature additions are forced into already-overloaded files, making regressions likely. UI state leaks between concerns. Testing is impractical.

**Recommended fix:** Extract logical sub-domains. Minimum viable split for ModelDetail: `<ModelDetailHeader>`, `<ModelDetailTabs>`, `<ModelSaveManager>`, `<ModelValidationSummary>`. For App.jsx: `<AuthShell>`, `<ModelLibrary>`, `<AppShell>`.

---

## Consistency Findings

### CON-1 — Spacing is entirely hardcoded, no token backing

**Severity:** High

`tokens.js` defines colours exhaustively but has zero spacing, padding, or margin constants. Across the codebase, padding values appear as: `4`, `5`, `6`, `7`, `8`, `10`, `11`, `12`, `14`, `16`, `18`, `20`, `24`, `28` pixels — in no consistent system.

Examples of the same conceptual slot using different values:

| Context | Value used |
|---------|-----------|
| Form field padding | `"5px 8px"` (BEventEditor), `"7px 8px"` (AiAssistantPanel), `"8px 10px"` (Field component) |
| Card inner padding | `12px` (most editors), `10px` (BottomPanel tabs), `14px` (GoalsEditor) |
| Section gap | `8`, `10`, `12`, `14` all used interchangeably |

**Recommended fix:** Add to `tokens.js`:
```js
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
```
Then progressively normalise usage. This alone will give the UI a more rhythmic, intentional feel.

---

### CON-2 — Border-radius is inconsistent across equivalent components

**Severity:** Medium

Five distinct radii are in use — `4px`, `5px`, `6px`, `8px`, `10px` — with no documented rule for when each applies. Buttons use `5px`, inputs use `4–5px`, cards use `6px`, modals use `8–10px`. This spread is too close together to convey intentional semantic meaning and too varied to look consistent.

**Recommended fix:** Reduce to three tiers and add to tokens:
```js
export const RADIUS = { sm: 4, md: 6, lg: 10 };
// sm: inputs/chips  md: cards/buttons/panels  lg: modals/overlays
```

---

### CON-3 — Opacity suffix pattern (`C.color + "18"`) is fragile and undocumented

**Severity:** Medium

The codebase uses a hex-opacity suffix pattern like `C.amber + "18"`, `C.red + "44"`, `C.border + "66"` pervasively (30+ instances). This is CSS-valid but:

- Not documented anywhere
- Produces different opacity values in an inconsistent spread (11%, 27%, 40%, 53%, etc.)
- Will silently break if any token value is ever changed to a colour name or variable

**Recommended fix:** Define explicit semantic opacity variants in tokens or use a utility function:
```js
export const alpha = (hex, opacity) =>
  `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
// alpha(C.amber, 0.1)  →  "#f0883e1a"
```
Or define named variants:
```js
C.amberSubtle  = C.amber + "18";  // ~10% — background tints
C.amberMid     = C.amber + "44";  // ~27% — borders
C.borderSubtle = C.border + "44"; // lighter dividers
```

---

### CON-4 — Hardcoded overlay and shadow colours

**Severity:** Medium

`ModelDetail.jsx` line 1288 uses `background: "#000000aa"` for modal overlays. `App.jsx` line 154 uses `boxShadow: '-8px 0 32px #000a'`. These bypass the token system. If a light theme option is ever implemented (UserSettingsPanel already has a theme toggle, albeit unimplemented), these values will be silently wrong.

**Recommended fix:** Add `C.overlay = "rgba(0,0,0,0.67)"` and `SHADOW.panel = "-8px 0 32px rgba(0,0,0,0.6)"` to tokens.

---

### CON-5 — Ghost button background is hardcoded

**Severity:** Low

`components.jsx` defines the `ghost` variant with `bg: "#ffffff08"` — 3% white opacity on a dark surface. This is not a token and represents a design decision invisible to the system.

**Recommended fix:** Add `C.surfaceHover = "#ffffff08"` to tokens and reference it from the button variant definition.

---

## UX Findings

### UX-1 — DistPicker is cognitively overloading

**Severity:** High  
**Location:** `src/ui/shared/components.jsx` — `DistPicker` component

The distribution picker has six distinct interaction paths — Fixed, CSV empirical, Piecewise, Schedule, standard parametric (with 6+ sub-types) — and the parameter sub-form varies per distribution. All this is presented in a single compact component with no progressive disclosure or contextual guidance.

**Why it matters:** Distribution selection is one of the most consequential decisions a modeller makes. A user who doesn't know the difference between Exponential and Lognormal has no in-UI help. A user picking Triangular must know what min/mode/max mean without any tooltip.

**Recommended fix:**
1. Add inline parameter tooltips to every distribution type (e.g., "Rate = 1/mean. Use for inter-arrival times with memoryless property.")
2. Add a "?" icon that opens a modal with a visual distribution curve preview
3. Consider a two-step design: first pick the family (empirical / parametric / scheduled), then sub-parameters

---

### UX-2 — No save keyboard shortcut (Ctrl+S)

**Severity:** High  
**Location:** `ModelDetail.jsx`

The application has Ctrl+Z / Shift+Z for undo/redo but no Ctrl+S for save. Every other desktop-class editing tool registers this shortcut. Users will attempt it and be confused when nothing happens.

**Recommended fix:** Add to the existing `keydown` handler in ModelDetail:
```js
if ((e.ctrlKey || e.metaKey) && e.key === 's') {
  e.preventDefault();
  onSave(model);
}
```

---

### UX-3 — "Unsaved changes" banner competes with model content

**Severity:** Medium  
**Location:** `ModelDetail.jsx` — dirty state banner

The unsaved-changes warning banner renders inline in the page flow, pushing content down. On small viewports this means the user must scroll past the banner to reach the actual model fields. The banner includes both "Save" and "Discard changes" in equal visual weight — a user in a hurry could accidentally click Discard.

**Recommended fix:**
1. Make Discard a ghost/danger button with a confirmation step
2. Consider a sticky top-bar notification rather than an inline page-flow element

---

### UX-4 — The starter guide blocks first-use context

**Severity:** Medium  
**Location:** `ModelDetail.jsx` — `showStarterGuide` modal

The starter guide fires on first render for empty models, presenting three options: Design, AI, Templates. It doesn't tell the user what any of these actually do before they choose. Once dismissed, there is no way to reopen it.

**Recommended fix:** Convert to a persistent "getting started" card in the Overview tab, visible until the user has completed at least one of: adding an entity type, running a simulation, or importing a CSV. Remove the blocking modal.

---

### UX-5 — Tab validation badges show counts but not details

**Severity:** Medium  
**Location:** `ModelDetail.jsx` — tab navigation badges

Tabs show error and warning counts (e.g., "B-Events ×2") but hovering provides no tooltip explaining what the errors are. Users must click in and scroll through editors to find the issue.

**Recommended fix:** Add a `title` attribute to tab badges listing the first one or two error messages as a tooltip.

---

### UX-6 — AI "Apply & Rerun" has no loading indicator between steps

**Severity:** Medium  
**Location:** `src/ui/execute/AiAssistantPanel.jsx` — `handleApplyAndRerun`

When a user clicks "Apply & Rerun" on a suggestion, the patch is applied and a new simulation run executes. There is no spinner or progress indicator during the rerun — only a button state change. For models with many replications this creates a period of silent waiting.

**Recommended fix:** Set `verifyStatus` to `"running"` immediately on click and render a progress indicator in the BeforeAfterTable area.

---

### UX-7 — Run history table has no bulk operations

**Severity:** Medium  
**Location:** `ModelDetail.jsx` — History tab

The run history table provides individual archive/label/export buttons per row. There is no way to select multiple runs and act on them together. For users running sweeps with dozens of sub-runs this is very tedious.

**Recommended fix:** Add checkbox selection and a bulk-action toolbar (Archive selected, Export CSV of selected).

---

### UX-8 — Log viewer has no search or filter

**Severity:** Medium  
**Location:** `src/ui/execute/LogViewer.jsx`

The simulation event log can contain thousands of entries with no text search, entity filter, or phase filter. Finding why a specific entity reneged requires manually scrolling.

**Recommended fix:** Add a search input that filters log entries by entity name/ID or event type. A Phase A / B / C toggle filter would reduce noise significantly.

---

### UX-9 — Empty states are generic and non-actionable

**Severity:** Low  
**Location:** Multiple — model library, history tab

The `Empty` component displays generic messages ("No runs yet", "No models") without directing the user to next steps.

**Recommended fix:** Make empty state messages context-aware with a direct CTA: "No runs yet — click Run Simulation to start."

---

### UX-10 — Goal metric paths are undiscoverable

**Severity:** Low  
**Location:** `src/ui/editors/GoalsEditor.jsx`

The goals editor requires the user to type an internal metric key like `summary.avgWait`. This is not discoverable from the UI. A user who doesn't know the available metric keys cannot use goals without reading documentation.

**Recommended fix:** Replace the free-text metric field with a dropdown of available metrics drawn from `GOAL_STAT_KEY` / `DEFAULT_KPI_SLOTS`, with human-readable labels ("Average wait time" → `summary.avgWait`).

---

## Accessibility Findings

### A-1 — No focus ring on any element

See CI-2. WCAG 2.4.7 failure. All interactive elements have `outline: none` with no replacement focus indicator.

---

### A-2 — 8–9px label text fails minimum size guidance

See CI-3. WCAG 1.4.4 (Resize Text) and practical accessibility. Text at 8px in a monospace font is essentially unreadable at default 96 dpi without screen zoom.

---

### A-3 — `aria-live` missing on streaming AI responses

**Location:** `AiAssistantPanel.jsx` — streaming text content area

When the AI streams a response token by token, screen readers receive no update notifications. The container should have `aria-live="polite"` and `aria-atomic="false"` so assistive technologies can announce chunks of the response.

---

### A-4 — Table headers missing `scope="col"`

**Location:** `BottomPanel.jsx` line 582, `ModelDetail.jsx` run history table

Data tables use `<th>` without `scope="col"`. Screen readers may not correctly associate header cells with data columns.

**Recommended fix:** Add `scope="col"` to all column header cells.

---

### A-5 — Modal dialogs missing `aria-labelledby`

**Location:** Multiple modals in `ModelDetail.jsx`

Modals have `role="dialog"` and `aria-modal="true"` — a good start — but none reference a title element via `aria-labelledby`. Screen readers announce "dialog" without context.

**Recommended fix:** Give each modal title a unique `id` and add `aria-labelledby` to the dialog container.

---

### A-6 — Muted text colour likely below 4.5:1 contrast

**Location:** `tokens.js` — `C.muted = "#5c7a99"` on `C.bg = "#080c10"`

`#5c7a99` on `#080c10` produces approximately 3.6:1 contrast — below the WCAG AA threshold of 4.5:1 for normal text. This muted colour is used for secondary labels, help text, and captions throughout the application.

**Recommended fix:** Lighten `C.muted` from `#5c7a99` to approximately `#7a98bb` to reach 4.5:1 against `#080c10`.

---

### A-7 — Icon-only buttons lack accessible names in some locations

**Location:** `BottomPanel.jsx` line 306 — remove `×` button in certain table rows

Several `×` remove buttons rely solely on the character glyph and carry no `aria-label`. The `Btn` component supports the `ariaLabel` prop, but it is not consistently applied.

**Recommended fix:** Audit all icon-only and single-character buttons and add `ariaLabel` props where missing.

---

## Responsive Design Findings

### R-1 — Single breakpoint at 720px is insufficient for tablet

The entire application switches between mobile and desktop layouts at exactly 720px. Tablets at 768–1024px receive a desktop layout that is often too dense. The ModelDetail editor tab bar overflows and clips on a 768px iPad in landscape.

**Recommended fix:** Add a second breakpoint at 1024px with a "compact desktop" mode between 720–1024px that reduces tab bar items and uses more vertical stacking.

---

### R-2 — Responsive detection via `window.innerWidth` is a React anti-pattern

**Location:** `ModelDetail.jsx` lines 235–241

Checking `window.innerWidth` in a `useState` initialiser and resize listener is prone to hydration mismatches and requires careful cleanup. It does not respond to CSS media query changes correctly in all environments.

**Recommended fix:** Use a `useMediaQuery` hook or `ResizeObserver` API on the root container instead of `window.innerWidth`.

---

### R-3 — Admin panel has no mobile consideration

**Location:** `src/ui/AdminPanel.jsx`

The admin panel renders a multi-column form with wide input fields and data tables. On mobile it becomes horizontally scrollable and unusable. Since admin access is a real user role, mobile admins are effectively blocked.

---

## Quick Wins

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| QW-1 | Add `*:focus-visible { outline: 2px solid #06b6d4; outline-offset: 2px; }` to `index.html` | 5 min | Fixes CI-2 entirely |
| QW-2 | Fix `C.primary` → `C.accent` in `AiAssistantPanel.jsx` line 348 | 5 min | Fixes runtime rendering bug |
| QW-3 | Add `Ctrl+S` save shortcut to ModelDetail keyboard handler | 15 min | High-impact UX for power users |
| QW-4 | Add `scope="col"` to all table `<th>` elements | 15 min | Fixes A-4 |
| QW-5 | Add `aria-labelledby` to all modal dialogs | 20 min | Fixes A-5 |
| QW-6 | Lighten `C.muted` from `#5c7a99` to `#7a98bb` | 5 min | Fixes WCAG contrast on secondary text |
| QW-7 | Add `title` attribute to tab error badges with first error message | 30 min | Reduces hunt-and-click friction |
| QW-8 | Require confirmation on "Discard changes" button | 30 min | Prevents accidental data loss |
| QW-9 | Replace GoalsEditor metric free-text with a KPI dropdown | 45 min | Eliminates undiscoverable internal key names |
| QW-10 | Add `aria-live="polite"` to AI response streaming container | 10 min | Fixes A-3 |

---

## Strategic Improvements

### S-1 — Complete the design token system

**Priority:** High

Extend `tokens.js` to cover the full style vocabulary:

```js
export const SPACE   = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const RADIUS  = { sm: 4, md: 6, lg: 10 };
export const Z       = { modal: 200, dropdown: 100, tooltip: 150, overlay: 180 };
export const SHADOW  = { panel: "-8px 0 32px rgba(0,0,0,0.6)", overlay: "0 8px 32px rgba(0,0,0,0.5)" };
export const TRANS   = { fast: "120ms ease", base: "200ms ease" };
```

Doing a single normalisation pass after this eliminates CON-1, CON-2, CON-4, and CON-5 simultaneously and makes future design changes a one-line edit.

---

### S-2 — Decompose the three god components

**Priority:** High

Recommended split for `ModelDetail.jsx` (1,410 lines):
- `<ModelHeader>` — name, breadcrumb, save state, sharing controls
- `<ModelTabBar>` — tab navigation with validation badges
- `<ModelOverviewPane>` — description, goals, health summary
- `<ModelDesignPane>` — sub-tab routing for editors
- `<UndoRedoProvider>` — context provider for undo/redo state

Recommended split for `App.jsx` (863 lines):
- `<AuthShell>` — sign-in, recovery, suspended states
- `<ModelLibrary>` — model cards, search, tabs
- `<AppShell>` — top nav, user avatar, admin link

---

### S-3 — Introduce a toast notification system

**Priority:** Medium

Currently all system feedback (save success, export complete, LLM rate limit reached) appears as inline banners that push content and require manual dismissal. Toast notifications (bottom-right, auto-dismissing) are the correct pattern for transient feedback in a persistent-layout tool. The `ErrorBoundary` infrastructure is already in place; a lightweight portal-based toast context is a small addition.

---

### S-4 — Replace "Loading…" text with skeleton screens

**Priority:** Medium

Lazy-loaded components (`ExecutePanel`, `VisualDesignerPanel`) currently render:
```jsx
<Suspense fallback={<div>Loading…</div>}>
```

For a production tool this should be a skeleton that mirrors the expected layout — grey placeholder bars in the approximate shape of the component. This dramatically reduces perceived load time and prevents layout shift.

---

### S-5 — Redesign DistPicker as a guided two-step selector

**Priority:** Medium

The distribution picker is the most-touched form control in the application and currently the most confusing (see UX-1). A two-step design — (1) pick the distribution family with a visual sparkline preview, (2) enter parameters with inline explanations — would reduce modelling errors and improve confidence for non-expert users.

---

### S-6 — Add a keyboard shortcuts overlay

**Priority:** Low

The application already has non-trivial keyboard support (Ctrl+Z, Shift+Z, and now Ctrl+S). A `?` global shortcut opening a modal listing all available shortcuts converts hidden functionality into discoverable power features.

---

## Design System Recommendations

1. **Formalise the token vocabulary** — Add `SPACE`, `RADIUS`, `Z`, `SHADOW`, and `TRANS` constants to `tokens.js`. This is the single highest-leverage change in the entire codebase.

2. **Establish a named typography scale** — Define named text styles as objects:
   ```js
   export const TYPO = {
     label:   { fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" },
     body:    { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
     caption: { fontSize: 11, fontWeight: 400, color: C.muted },
     heading: { fontSize: 14, fontWeight: 700 },
   };
   ```
   Apply by spreading: `style={{ ...TYPO.label, color: C.muted }}`.

3. **Add an opacity utility** — Replace the `C.color + "18"` hex-suffix pattern:
   ```js
   export const alpha = (hex, opacity) =>
     `${hex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
   ```

4. **Audit and document button variants** — The `success` variant is defined in `components.jsx` but never used in the application. Either add usage or remove it. Document the intended semantic for each variant (`primary` = single main action per screen, `ghost` = secondary/tertiary, `danger` = destructive, `amber` = warning/important-but-not-destructive).

5. **Enforce a minimum focus style globally** — One CSS rule in `index.html` as the universal fallback. Individual components can refine it but no component should produce a focus-invisible state.

6. **Create a component reference document** — A single `docs/design-system.md` listing what each shared component does, which props it accepts, when to use each `Btn` variant, and what the colour token semantics mean would dramatically reduce design drift as the codebase scales.
