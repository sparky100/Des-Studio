# flow (simmodlr) — Expert UX Review

> Reviewed: 2026-08-24
> Scope: Full application source — `src/ui/**`, `src/App.jsx`, `index.html`, with reference to `AGENTS.md` §7.10–7.11 and `docs/sprint-67-plain-language-ux-guide.md`
> Reviewer: Senior UX Specialist / Discrete-Event Simulation Modeller
> Prior art: `docs/ui-ux-review.md` (2026-05-16, rated 6/10)

---

## Executive Summary

flow has matured substantially since the May review. The design token system the prior review asked for now exists in full (`SPACE`, `RADIUS`, `Z`, `SHADOW`, `TRANS`, `TYPO`, `alpha()` — `src/ui/shared/tokens.js:52–85`), a global `:focus-visible` rule is in `index.html:10`, Ctrl+S save works (`ModelDetail.jsx:666`), the toast system, skeleton loaders, light and high-contrast themes, two responsive breakpoints on a `ResizeObserver`, and a redesigned two-step DistPicker have all landed. The Sprint 67 plain-language programme shows real craft: the main Run Setup speaks the modeller's intent ("Ignore early results", "Number of runs", "Random starting point" — `ExperimentControls.jsx:92–260`), the Results workspace is organised around the questions a modeller actually asks ("What happened? Can I trust this?"), and Model Health leads with outcomes, not codes. Nine of the ten prior Quick Wins are verifiably done.

But three of the improvements were installed without being wired all the way through, and one of them is severe: **the `ToastProvider` only wraps the model-library branch of `App.jsx`**. The model-editing branch — where a modeller spends 95% of their time — returns earlier in the render, outside the provider, so all ~31 toast calls in ModelDetail, the run-history tab, CSV import, and the AI assistant silently resolve to a no-op fallback. Every "Model saved", "Save failed", "Report ready", and "saved with N validation errors" notification in the core authoring loop does nothing. Combined with a save routine that proceeds despite validation errors, a modeller can believe a broken model is saved and healthy when neither is true. Similarly, the new keyboard-shortcuts modal is unreachable (no code path sets its state to true), and the global focus ring is overridden on every form control by 156 inline `outline:"none"` declarations.

This is the signature of a codebase improving faster than it is being verified end-to-end. The bones are now good; the priority is closing the gap between what was built and what the user actually experiences.

### Top Strengths

- Sprint 67 plain-language execution in Run Setup, Results ("How reliable are these results?" with a colour-graded verdict), and Model Health outcome-first copy
- Complete, documented token vocabulary (spacing, radius, z-index, shadow, typography, alpha) — the prior review's single highest-leverage ask, delivered
- Warm-up handling is genuinely modeller-grade: "Suggest a value" detection, an explanation, and a cumulative-mean settling chart (`ExperimentControls.jsx:95–160`)
- Effect and condition pickers generate readable English options ("Start service with Nurse and Patient from Triage Queue") rather than raw macro syntax
- Three themes including High Contrast Dark, `system` tracking, and a dedicated accessibility test file (`tests/ui/accessibility.test.jsx`)
- Keyboard-openable model cards, 54 `scope="col"` table headers, 17 `aria-labelledby` dialogs, guarded discard confirmation, bulk run-history operations, searchable log viewer — prior UX-3/-7/-8, A-4/-5, QW-4/-5/-8 all fixed

### Top Weaknesses

- Toast notifications are dead in the entire model-editing flow — provider scoping bug (CI-1)
- All 156 form controls suppress the global focus ring with inline `outline:"none"` (CI-2)
- Save succeeds silently on models with blocking validation errors; the intended warning toast is dead per CI-1 (CI-3)
- Undo snapshots per keystroke into a 20-deep stack, and Ctrl+Z is hijacked inside text fields (CI-4)
- Ten native `window.confirm`/`alert` dialogs coexist with the themed modal system (CON-2)
- B-Events / C-Events remain the first-layer vocabulary of the Define workflow; the Arrivals/Activities rename is documented but deferred (M-1)

### Overall UX Maturity Rating: 7.5 / 10

Up from 6/10 (2026-05-16). The foundation-level failures of the prior review — no tokens, no focus rule, no toast system, undiscoverable metric keys, single breakpoint — are fixed, and the plain-language work lifts the tool meaningfully for its stated audience of non-coding simulation modellers. What holds the score below 8 is not missing capability but broken wiring: the feedback system, the focus system, and the shortcuts overlay all exist and all fail at the point of use. CI-1 through CI-4 are cheap to fix relative to their impact; resolving them plus the aria-hidden badge pattern would justify 8.5.

---

## Critical Issues

### CI-1 — ToastProvider does not wrap the model-editing branch: all authoring feedback is silently dropped

**Severity:** Critical
**Evidence:** `src/App.jsx:703` and `:792` — `<ToastProvider>` opens and closes only around the final return (the model library). The `openId` branch returns earlier at `App.jsx:588–670` and renders `<ModelDetail>` with no provider above it; the same is true of the `showAdmin` (`:545`), `showSettings` (`:563`), `pendingImport` (`:521`), `shareToken` (`:517`), and `AuthShell` (`:698`) branches. `src/ui/shared/ToastContext.jsx:118–124` — `useToast()` outside a provider returns a documented no-op fallback (`{ toast: () => {}, success: () => {}, … }`). Consumers rendered inside the unwrapped branch: `ModelDetail.jsx` (20 toast calls, e.g. "Model saved" `:631/:686`, "Save failed" `:692`, "Report ready — downloading" `:898`), `ModelHistoryTab.jsx` (9 calls), `CsvImportModal.jsx` (1), `execute/AiAssistantPanel.jsx` (2). Only `ModelLibrary.jsx`'s calls actually render.

**Impact:** The modeller receives no confirmation that a save happened, no error when it fails, no "saved with N validation errors — check Model Health" warning, no report-generation status, and no run-history archive/export/delete confirmations — across the entire create → define → run → analyse journey. Because saves usually do succeed, the failure is invisible in happy-path testing; the person who most needs the feedback (save failed, offline, RLS rejection) is exactly the person who gets nothing. This resurrects, in worse form, the feedback gap the prior review's S-3 was meant to close.

**Remediation:** Mount `ToastProvider` once, above all branches — the cleanest place is `src/main.jsx` around `<App/>` (alongside `ThemeProvider`), then remove the branch-local wrapper in `App.jsx`. Add a regression test that renders `ModelDetail`, triggers a save failure, and asserts a toast appears.

**Effort:** S

---

### CI-2 — 156 inline `outline:"none"` declarations defeat the global focus ring on every form control

**Severity:** Critical
**Evidence:** `index.html:10` defines `*:focus-visible { outline: 2px solid #06b6d4; outline-offset: 2px; }` — the prior review's QW-1, correctly applied. However, `grep 'outline:"none"' src/ui` returns 156 matches, all as element-level inline styles, which win over any stylesheet rule. Representative: the shared `Field` component's `inputBase` (`src/ui/shared/components.jsx:141–142`), every `DistPicker` select (`components.jsx:572`, `:628–629`), the model-name input (`ModelDetail.jsx:1172`), run-setup inputs (`execute/index.jsx:202`, `ExperimentControls.jsx` throughout), editor filter inputs (`CEventEditor.jsx:128`). No `focus-visible` handling or `outlineOffset` exists anywhere in the JSX.

**Impact:** Buttons get the global ring (the `Btn` component sets no outline), but every input, select, and textarea — the controls a modeller actually tabs between when defining distributions, conditions, and run settings — shows no focus indicator. WCAG 2.4.7 failure for keyboard users, and a practical annoyance for sighted keyboard-first modellers filling in long editor forms. The prior review's CI-2 was half-fixed: the rule exists, the overrides remain.

**Remediation:** Delete `outline:"none"` from the shared components first (`Field`, `CommitInput` call sites, `DistPicker`, `DropField`) — that covers most of the surface via reuse — then sweep the remainder. Where the default ring clashes visually with a focused-border treatment (e.g. the model-name underline at `ModelDetail.jsx:1172–1174`), replace with an explicit visible focus style instead of none.

**Effort:** M

---

### CI-3 — Save proceeds despite blocking validation errors, and the compensating warning is dead

**Severity:** High
**Evidence:** `src/ui/ModelDetail.jsx:672–695` — `save()` runs `validateModel(model)`, then calls `overrides.onSave?.(model)` unconditionally; errors only downgrade the toast copy (`:676–680`). Two compounding defects: (1) the "Model saved with N validation errors" / "…warnings" toasts fire **before** the save promise resolves, so a subsequent save failure would follow a message implying success; (2) per CI-1, none of these toasts render at all in this branch. The only surviving cue is the generic save banner. Contrast `exportJson` (`:823–827`), which does gate on errors via `window.confirm`.

**Impact:** A modeller can save a model that cannot run — a broken schedule reference, a priority queue without a priority attribute — and receive no signal whatsoever that anything is wrong until they reach the Run tab, where the run button is disabled for reasons they were never told about. For the target user (no code, trusts the UI), this is a trust-eroding dead end. Allowing saves of invalid work-in-progress is the right call for an authoring tool; doing it silently is not.

**Remediation:** After CI-1 is fixed the toasts start working; additionally move the warning/info toast into the `.then()` so it reflects the actual outcome, and have the save banner (which does render — `SaveBanner.jsx`) show a persistent "Saved — N issues to fix before running" state with a link to Model Health.

**Effort:** S

---

### CI-4 — Undo snapshots per keystroke into a 20-deep stack, and Ctrl+Z is intercepted inside text fields

**Severity:** High
**Evidence:** `src/ui/ModelDetail.jsx:582–588` — `setField` pushes a full-model snapshot on **every** change event; the name and description inputs call it per keystroke (`:1170`, description field likewise). All history pushes cap at 20 entries (`p.slice(-19)` at `:584`, `:590`, `:616`, `:624`, `:653`). `:661–670` — the document-level keydown handler intercepts Ctrl/Cmd+Z with `e.preventDefault()` and calls model-level undo with no check on `document.activeElement`, unlike the `?` handler in `App.jsx:277` which does exclude INPUT/TEXTAREA/SELECT.

**Impact:** Typing a 20-character model description evicts the modeller's entire structural undo history — the queue they just rewired, the C-event they just deleted — replaced by 20 one-character snapshots. Worse, pressing Ctrl+Z while focused in a text field does not undo typing (native undo is suppressed); it reverts the whole model one keystroke-snapshot at a time, moving the caret's field content out from under the user. For a modeller mid-edit on a large model this reads as data loss.

**Remediation:** (1) Skip the global undo/redo handler when focus is in a text control, letting native text undo work. (2) Debounce or coalesce `setField` history pushes (snapshot on blur/commit, or merge consecutive edits to the same field). (3) Raise the cap — full-model snapshots of typical models are small; 50–100 entries is cheap.

**Effort:** M

---

## Consistency Findings

### CON-1 — Two run-setup forms with two vocabularies: plain English in one, bare jargon in the other

**Severity:** Medium
**Evidence:** The main Run Setup (`src/ui/execute/ExperimentControls.jsx:92–260`) is the Sprint 67 exemplar — "RUN NAME", "IGNORE EARLY RESULTS" (+ helper "Use this when the system needs time to settle…"), "NUMBER OF RUNS", "RANDOM STARTING POINT" (+ "Use the same value to repeat the same random pattern"), "WHEN SHOULD THE RUN STOP?". Its duplicate for saved experiments, `ExperimentRunSettingsFields` (`src/ui/execute/index.jsx:192–261`), labels the same state setters "WARM-UP" (`:208`), "REPLICATIONS" (`:214`), "SEED" (`:220`), "STOP CONDITION" (`:226`) with no helper text, no warm-up suggestion, and no seed randomiser.

**Impact:** The same setting has two names depending on which panel the modeller opens, directly contravening AGENTS.md §7.11 ("Prefer **Ignore early results** with helper text noting the technical term **warm-up period**"). A modeller who learned "Number of runs" in Run Setup meets "REPLICATIONS" when editing a saved experiment and must re-derive the mapping themselves.

**Remediation:** Extract the labelled field group from `ExperimentControls` into a shared component (it already shares the state setters by design — see the comment at `execute/index.jsx:189–191`) and render it in both places, or at minimum copy the labels and helper text across.

**Effort:** S

---

### CON-2 — Ten native `window.confirm`/`alert` dialogs alongside the themed modal system

**Severity:** Medium
**Evidence:** `App.jsx:451` (delete model); `ModelDetail.jsx:720` (leave with unsaved changes), `:825` (export with errors); `VersionHistoryPanel.jsx:63` (delete version), `:164` (restore version); `BEventEditor.jsx:47` (delete referenced B-event); `components.jsx:648` (change distribution family), `:696` (CSV skip-rate), `:699` (`window.alert`, no numeric values); `ModelHistoryTab.jsx:248` (bare `confirm`, delete selected runs). Meanwhile the fork flow uses a proper themed `role="dialog"` modal (`App.jsx:766–777`) and discard uses an inline two-step confirm (`SaveBanner.jsx`).

**Impact:** Destructive actions — the moments demanding the most trust — are the one place the product's visual language disappears, replaced by unstyled browser chrome that ignores theme, cannot show detail (which C-events reference this B-event?), and on some browsers can be suppressed entirely ("prevent this page from creating additional dialogues"), which would make deletes fire without any confirmation.

**Remediation:** A single shared `ConfirmDialog` (the fork modal is already the template) with variant styling for destructive actions; migrate the ten call sites.

**Effort:** M

---

### CON-3 — Tab identity drift: "Model Data" is a grab-bag, "Data Sources" hides under the id `state`

**Severity:** Medium
**Evidence:** `ModelDetail.jsx:928–946` — tab id `containers` is labelled **Model Data** and renders Skills (`:1399–1437`), Container Types (`:1439`), the Distance Registry (`:1451`), *and* State Variables (`:1454`); tab id `state` is labelled **Data Sources** and renders only the live-feed `DataSourcesEditor` (`:1331–1334`). `MODEL_HEALTH_TAB_LABELS` (`:202–217`) still carries a `history: "Run History"` entry for a tab that no longer exists in `TABS`.

**Impact:** A modeller looking for a state variable will plausibly try "Data Sources" (state lives there in the code's own naming) and not find it; a modeller looking for skills or travel distances must know they count as "Model Data". Four unrelated concepts under one tab also means validation badges on "Model Data" don't say which of the four needs attention. The id/label mismatch additionally taxes every future maintainer reading `issue.tab` values.

**Remediation:** Either split Model Data into its constituents in the Define sub-bar (there is room — the sub-bar already holds nine items) or add an in-tab section index; rename ids to match labels at the next schema-safe opportunity.

**Effort:** M

---

### CON-4 — Static token palette has drifted from the theme palettes; two components are theme-blind

**Severity:** Medium
**Evidence:** `src/ui/shared/tokens.js:3–42` still exports a static `C` including `errorLight: "#fee2e2"` (`:34`); none of the three palettes in `src/ui/shared/ThemeContext.jsx:5–125` define `errorLight`. `MarkdownContent.jsx` and `AdminPanel.jsx` import the static `C` from `tokens.js` rather than using `useTheme()`, so they render dark-palette colours regardless of the active theme.

**Impact:** Any component that switches from static `C` to `useTheme()` and happens to use `errorLight` gets `undefined` as a colour. More concretely today: an admin using the light theme gets dark-theme text/surface colours in the admin panel and in all rendered markdown (help content, AI responses) — low-contrast or illegible combinations on light backgrounds.

**Remediation:** Make `ThemeContext` palettes the single source of truth: add the missing keys, convert the two static-`C` importers to `useTheme()`, and reduce `tokens.js`'s `C` to a deprecated re-export of the dark palette (or delete it once imports are migrated).

**Effort:** S

---

### CON-5 — Dead conditions and vestigial state in user-facing paths

**Severity:** Low
**Evidence:** `ModelHealthPanel.jsx:24–25` — `showActions = … && (true || latestResults || completedRuns > 0)`: the `true ||` short-circuit makes the run/results gating dead, so the quick-action row always renders once a model is runnable. `execute/index.jsx:291` — `resolvedSeed`/`setResolvedSeed` declared, never set or read. `App.jsx:123` — `showKeyboardShortcuts` can never become true (see UX-1).

**Impact:** Individually cosmetic, collectively a smell: conditions that look intentional but aren't make the next change riskier (someone will "fix" the gating and change behaviour, or trust `resolvedSeed` to hold the seed actually used). The health panel offering "Open Results" logic that can't gate correctly slightly misleads new users about what the panel is telling them.

**Remediation:** Delete the `true ||`, delete `resolvedSeed`, and resolve UX-1; add a lint pass for unused state.

**Effort:** S

---

## UX Findings

### UX-1 — The keyboard-shortcuts modal is unreachable, and `?` does something else

**Severity:** Medium
**Evidence:** `App.jsx:123` declares `showKeyboardShortcuts`; `:778–780` renders `KeyboardShortcutsModal` when true; **no code path calls `setShowKeyboardShortcuts(true)`** (grep confirms the only two references are the declaration and the `onClose`). The global `?` handler (`App.jsx:275–284`) toggles the Help Assistant instead. The modal's own content documents `?` as its trigger (`src/ui/shared/KeyboardShortcutsModal.jsx:15` — "Show this keyboard shortcuts list").

**Impact:** The prior review's S-6 was built — a well-made, accessible modal listing nine shortcuts including the Visual Designer's copy/paste/duplicate — and then never connected. Power-modeller features (Ctrl+D duplicate on the canvas, Ctrl+S) remain undiscoverable, and the one place that documents them lies about how to open it.

**Remediation:** Decide the owner of `?` (suggestion: `?` opens shortcuts, `F1` or the existing header button opens Help), wire `setShowKeyboardShortcuts(true)`, and add a "Keyboard shortcuts" entry to the account/help menu so it is discoverable without knowing the key.

**Effort:** S

---

### UX-2 — Stale `beforeunload` closure: canvas edits don't arm the reload warning

**Severity:** High
**Evidence:** `ModelDetail.jsx:737–745` — the `beforeunload` handler reads both `dirty` and `visualPending`, but the effect's dependency array is `[dirty]` only. Draw-tab edits set `visualPending` without setting `dirty` (`setWholeModel`, `:589–598`), so while the modeller stays on the Draw tab the registered listener still sees `visualPending === false`. The mitigation at `:730–735` (promote `visualPending` to `dirty` on tab switch) only helps if they leave the tab first.

**Impact:** A modeller who lays out a process map on the canvas and hits reload — or whose browser restarts — gets no "unsaved changes" warning and loses the layout. This is precisely the highest-effort, least-recoverable kind of work in the app.

**Remediation:** Add `visualPending` to the dependency array (one-line fix), or track both flags in a ref read by a stable listener.

**Effort:** S

---

### UX-3 — Canvas-init save failures are swallowed without any signal

**Severity:** Medium
**Evidence:** `ModelDetail.jsx:1133` — `onModelInit={async (nextModel) => { setModel(nextModel); try { await overrides.onSave?.(nextModel); } catch {} }}` — the Visual Designer's initial graph persistence catches and discards all errors.

**Impact:** If the auto-save of the initial canvas state fails (network, auth expiry, RLS), the modeller's in-memory model and the stored model silently diverge; the next explicit save may then surprise them with conflicts or the next load with missing structure. Even a dead toast (CI-1) is not attempted here — there is genuinely no handling.

**Remediation:** Route the failure through the same path as `save()`: set `saveError` (which renders inline at `:1117`) and mark the model dirty so the save banner appears.

**Effort:** S

---

### UX-4 — Validation codes lead the message in editor tabs, against the product's own presentation rule

**Severity:** Low
**Evidence:** `ModelDetail.jsx:70–82` — `TabErrors` renders `[{e.code}] {e.message}` — the internal code is the first thing read. The Model Health tab does it correctly: message first, "· Code V4" as a trailing detail (`:1493–1502`), matching §7.11's "state the user consequence before the internal code". Import status items repeat the code-first pattern (`App.jsx:350`, `:358`, `:393`, `:401`).

**Impact:** Minor on its own, but these inline banners are the *first* place a modeller meets a validation failure (they sit at the top of the editor tab they're working in); leading with `[V14]` frames the product as machine-first at exactly the teachable moment. Consistency with Model Health also matters: the same issue reads differently in two places.

**Remediation:** Mirror the Model Health format in `TabErrors` and the import status list: message first, code as a muted suffix.

**Effort:** S

---

## Accessibility Findings

### A-1 — Clickable issue badges are `aria-hidden` interactive spans nested inside buttons

**Severity:** High
**Evidence:** `ModelTabBar.jsx:88–115` (tab-level error/warning badges) and `:273–300` (mode-level badges) — `<span aria-hidden="true" … onClick={… setTab("validate")}>` rendered *inside* the tab `<button>`. The parent button's `aria-label` does include the counts (`:131–132` — good), but the badge's distinct affordance (jump straight to Model Health) is invisible to assistive technology, unreachable by keyboard, and nested interactive content inside a button is invalid interaction structure. The badges are also 9px text (`:95`, `:108`). Same pattern: skill-chip remove is a bare `<span onClick>` (`ModelDetail.jsx:1411`).

**Impact:** A keyboard or screen-reader modeller can reach the tab but not the shortcut the badge provides; a sighted mouse user gets a hidden bonus behaviour (clicking the number navigates somewhere different from clicking the tab) that nothing announces. This is the kind of split experience that erodes confidence in what clicking will do.

**Remediation:** Make the badge a real sibling `<button>` with an `aria-label` ("2 errors — open Model Health"), or drop the special click and let the whole tab carry one behaviour with the tooltip. Convert the skill-chip `×` to `Btn`/`button` with `ariaLabel` (the codebase's own pattern, cf. `CEventEditor.jsx:206`).

**Effort:** M

---

### A-2 — Focus trapping and restoration exist in two components and nowhere else

**Severity:** Medium
**Evidence:** `FeedbackModal.jsx:70–94` implements a full Tab/Shift-Tab trap with initial focus; `HeaderAccountMenu.jssx:86–113` traps and restores focus to its trigger. `AboutModal.jsx:29` and `ChartDataChoiceDialog.jsx:29` focus their first button but do not trap. The remaining dialogs — `KeyboardShortcutsModal`, the fork confirm (`App.jsx:766–777`), `NewModelModal`, `VersionHistoryPanel`, `CsvImportModal`, `SimPyExportModal`, the diff preview — neither trap nor restore focus.

**Impact:** Tabbing from an open modal walks into the obscured page behind it; on close, focus lands on `<body>` and a screen-reader user is dropped back at the top of a 2,000-line editor. The codebase demonstrably knows how to do this right — it just hasn't been shared.

**Remediation:** Extract the FeedbackModal trap into a `useFocusTrap(ref)` hook (or a `ModalShell` component that also standardises overlay, `role="dialog"`, `aria-labelledby`, and Escape) and adopt it across the eleven dialog components.

**Effort:** M

---

### A-3 — Run progress and result-save status have no live region

**Severity:** Medium
**Evidence:** `execute/index.jsx` — the batch progress readout ("Running 3/10", worker pool line, `:2877–2886`) and the save-status banner driven by `setSaveStatus` ("Saving results…", "✓ Results saved", "✗ Save failed", `:150–183`) render as plain divs; grep finds no `aria-live`/`role="status"` anywhere in the file's 3,394 lines. The model-level `SaveBanner` does it right (`role="status"`, `SaveBanner.jsx:12`, `:25`), as do toasts (`ToastContext.jsx:27–28`) and the AI response area (`AiAssistantPanel.jsx:1321`).

**Impact:** For a screen-reader modeller the most consequential asynchronous events in the product — a multi-minute batch completing, results failing to persist — pass in silence; they must manually re-scan the page to learn the run finished.

**Remediation:** `role="status"` on the save-status banner; a polite live region announcing batch start/completion (announcing every replication tick would be noise — announce at start, on completion, and on error).

**Effort:** S

---

### A-4 — Sub-11px text persists despite the 11px TYPO floor

**Severity:** Medium
**Evidence:** `tokens.js:74–80` sets the intended floor (`TYPO.label`/`caption` at 11px). In practice: 9px badges and disabled tab labels (`ModelTabBar.jsx:95`, `:108`, `:124`, `:280`, `:294`), 9px stat labels in Model Health cards (`ModelDetail.jsx:1485`), and 10px is the default size for field labels, helper text, and param labels across the editors and execute panel (e.g. `ExperimentControls.jsx` label style, `CEventEditor.jsx:212`, `components.jsx:756`, `DistPicker` family buttons `:729`).

**Impact:** Improved from the prior review's 8px floor, but the label tier a modeller reads constantly — CONDITION, ENTITY FILTER, WARM-UP, distribution parameter names — sits at 10px monospace, below the product's own standard and hard on low-vision users during long modelling sessions.

**Remediation:** Sweep 10px labels to `...TYPO.label` (11px) and reserve 9px strictly for the numeric count badges, ideally lifting those to 10px; the tokens already exist, this is adoption.

**Effort:** M

---

### A-5 — `prefers-reduced-motion` is never consulted

**Severity:** Low
**Evidence:** No match for `prefers-reduced-motion` anywhere in `src/` or `index.html`. Animations in use: spinner keyframes (`App.jsx:590`, `HelpAssistant.jsx:611`), pulse (`components.jsx:907`, `SkeletonPanel.jsx:14`), sidebar slide-in (`NodeDetailSidebar.jsx:370`), and continuous token movement on the execute canvas (`execute/AnimatedEdge.jsx`).

**Impact:** Users with vestibular sensitivity cannot suppress motion. The execute canvas mitigates this with its explicit "Show movement during auto-run" checkbox (`ExperimentControls.jsx`, Extra options) — good — but the default should also respect the OS setting.

**Remediation:** A `usePrefersReducedMotion()` hook; default `animationEnabled` from it and gate the decorative keyframes.

**Effort:** S

---

## Responsive Design Findings

The prior review's R-1 (single 720px breakpoint), R-2 (`window.innerWidth` anti-pattern), and R-3 (AdminPanel) are all fixed: `useViewport` (`src/ui/shared/hooks.js`) uses a `ResizeObserver` with `BP = { mobile: 720, compact: 1024 }`, ModelDetail consumes both tiers (`ModelDetail.jsx:956–957`), and AdminPanel now uses the hook (`AdminPanel.jsx:244`).

### R-1 — Mobile Design mode presents all twelve authoring tabs with no prioritisation

**Severity:** Low
**Evidence:** `ModelDetail.jsx:958–967` — the mobile `DISPLAY_MODES` "Design" entry carries the same twelve tab ids as desktop; `ModelTabBar.jsx:213–244` renders the Define sub-bar as a wrapping row of nine icon buttons, so on a phone the two-level bar stacks into three-plus rows of 11px targets before content begins. The compact tier's "More sections" overflow (`ModelTabBar.jsx:117–119`) also still lists a `history` id that no longer exists in `TABS`.

**Impact:** Editing on a phone is possible but the chrome consumes a third of the viewport, and the small wrapped targets are error-prone. Genuine mobile authoring is rare for DES, but reviewing a model on a phone (a stakeholder opening a shared link) hits the same layout.

**Remediation:** On the mobile tier, collapse the Define sub-tabs into a select or bottom sheet; remove the dead `history` entry.

**Effort:** M

---

### R-2 — Run-setup and picker controls rely on flex-wrap of fixed-width fields

**Severity:** Low
**Evidence:** Fixed widths — `execute/index.jsx:202` (`width: 90`), `ExperimentControls.jsx` inputs at 80–160px, `DistPicker` selects at 160/200px (`components.jsx:628`). All sit inside `flexWrap:"wrap"` rows, so nothing clips, but at compact widths the Run Setup form re-rags into an unpredictable column order (RUN NAME, then the warm-up block with its chart, then NUMBER OF RUNS on a new row).

**Impact:** Cosmetic rather than blocking: the settle-chart under IGNORE EARLY RESULTS stretches the row and separates related fields, making the setup form feel unstructured exactly where the plain-language copy is trying to build confidence.

**Remediation:** A simple two-column grid (`repeat(auto-fit,minmax(220px,1fr))`) for the field group, letting the chart span full width beneath it.

**Effort:** S

---

## Modeller-Workflow Findings

*(New category: issues specific to the discrete-event-modelling journey — create → define → validate → run → analyse → share.)*

The journey itself is coherent and mostly well-signposted: the WelcomeDialog offers three-layer copy per path (heading / friendly summary / guidance — `WelcomeDialog.jsx:20–48`), the in-model starter guide mirrors it (`ModelDetail.jsx:1139–1162`), Draw/Describe/Define are honest names for the three authoring modes, Model Health leads with "This model needs a few fixes before it can run" rather than error dumps (`ModelHealthPanel.jsx:16–22`), error chips deep-link to the offending editor with an error filter (`ModelDetail.jsx:1493`), the Execute tab stays mounted across tab switches so run state survives navigation (`:1513`), and the Results reliability section renders a plain-verdict ("Not enough repeated runs yet" / "High confidence" / "Use with caution" — `ResultsWorkspace.jsx:1163–1168`) with a colour-graded ±% confidence badge on metric cards (`:280–296`). This is genuinely better DES pedagogy than most commercial tools ship.

### M-1 — B-Events / C-Events remain the first-layer vocabulary of Define

**Severity:** Medium
**Evidence:** `ModelDetail.jsx:935–936` — tab labels "B-Events" and "C-Events"; 101 occurrences of the terms across `src/`; Model Health stat cards headline "B-EVENTS" / "C-EVENTS" counts (`:1481–1482`). The mitigations are real — the C-Events editor opens with an excellent plain explanation ("A C-event fires the moment its condition becomes true — e.g. 'a customer is waiting and a server is free'", `CEventEditor.jsx:139–143`) and effect options read as English — but the deferred rename is acknowledged in `docs/reviews/arrivals-activities-plain-language-plan.md` ("Phase 2 — documented only, not implemented").

**Impact:** The target user "must never need to write code", yet the core authoring decision — where do arrivals go, where do activities go — is labelled in Three-Phase engine internals (Tocher's B/C phases). Every new modeller pays a vocabulary tax before they can place their first event; §7.11 explicitly demands plain-first labels. The deferral rationale (BATCH/COSEIZE/MATCH don't classify cleanly) is sound engineering caution, but the pure labelling step doesn't require the classifier: "Scheduled events (B-Events)" costs nothing.

**Remediation:** Short term: two-layer tab labels — "Arrivals & timed events" with "B-Events" as the retained technical suffix in the editor heading, per the §7.11 pattern already used for warm-up. Longer term: execute the documented Phase 2 with an advanced toggle.

**Effort:** L (full rename) / S (two-layer labels)

---

### M-2 — Effect option lists grow combinatorially and are served in a flat select

**Severity:** Medium
**Evidence:** `src/ui/editors/helpers.jsx` — MATCH generates queue-pair × target-queue options (`:204–219`: for *n* queues, n(n−1)/2 × n entries — 10 queues → 450 options); COSEIZE generates queue × server-pair × (1 + skills) (`:222–249`); ASSIGN generates queue × server × (1 + skills + string-attrs) (`:64–107`). All land in one `<select>` (`:540–547`). The category filter chips with counts (`:524–538`) are a good mitigation, but there is no text search within the dropdown.

**Impact:** On the toy models the pickers feel magic; on a realistic model (a dozen queues, several server types with skills) the modeller scrolls hundreds of near-identical English sentences to find "Start service with Nurse (triage) and Patient from Majors Queue". Selection errors between adjacent permutations are easy and hard to spot afterwards.

**Remediation:** Add a filter-as-you-type input above the select (the log viewer already establishes the pattern), and/or compose the option progressively (pick macro → pick queue → pick server) instead of pre-expanding the cross-product.

**Effort:** M

---

### M-3 — Macro parameters are quantised to hardcoded values the modeller cannot change

**Severity:** Medium
**Evidence:** `helpers.jsx` — BATCH offered only at sizes 2/5/10 (`:154–159`); FILL and DRAIN only at 10/50/100 (`:383–388`, `:195–200`); SPLIT only into 2/3/5 (`:373–379`); ASSIGN's container-gated form only "consuming 1" (`:129–150`). The design intent is documented ("no free-text escape hatch — audit C1", `:393`) and the engine validates arbitrary values (V22: batch size any integer ≥ 2), but the expression-macro row (`:548+`) covers only SET/SET_ATTR/COST/ROUND_ROBIN/CANCEL/MATCH — not these.

**Impact:** A modeller who needs "batch 6 pallets" or "drain 25 litres" — utterly ordinary requirements — cannot express them anywhere in the UI. Their options are to distort the model to a supported constant or hand-edit exported JSON, which the product's no-code promise forbids. This is a capability cliff hidden behind a picker that looks complete.

**Remediation:** After inserting a quantity-bearing effect chip, make the number editable in place (chip click → small stepper), or add BATCH/FILL/DRAIN/SPLIT to the structured expression row with a validated numeric input. Keeps the no-free-text principle: the macro stays structured, only the integer is typed.

**Effort:** M

---

### M-4 — C-event priority is drag-only: no numeric entry, no keyboard path

**Severity:** Medium
**Evidence:** `CEventEditor.jsx:53–66` — reordering is exclusively HTML5 drag-and-drop, with `priority` recomputed from array index (`:63`, `:50`); the badge (`P1`, `P2`… `:189–194`) displays but does not edit; drag is disabled while the name filter is active (`:183`); there are no move-up/move-down buttons. AGENTS.md §7.10: "C-Event priority is an explicit integer field — never implicit array order."

**Impact:** C-event priority is semantically load-bearing in Three-Phase simulation — it decides which activity claims a contested resource. A keyboard-only modeller cannot change it at all; a mouse user with 15 C-events must drag an item across several screens of expanded cards; and because priority is silently rewritten from position, there is no way to leave deliberate gaps or set an explicit ordering scheme. The letter of §7.10 (explicit integer stored) is met; its spirit (the modeller states priority) is not.

**Remediation:** Make the P-badge an editable committed integer (with collision handling), and add up/down buttons on each card as the accessible path; keep drag as the fast path.

**Effort:** S

---

### M-5 — Reliability detail (half-width, replication count) is hover-only

**Severity:** Low
**Evidence:** `ResultsWorkspace.jsx:280–296` — `CiBadge` shows the excellent colour-graded "±12%" chip, but the absolute half-width and n ("±3.2 half-width, n=10 reps") live only in a `title` tooltip, unavailable on touch devices and to screen readers.

**Impact:** The relative badge answers "can I trust this?", but a modeller writing up results needs the absolute interval and n; making them hover-only pushes exactly the audience the reliability section was built for (decision-writers) to the raw tables. Minor because the reliability tab itself surfaces fuller statistics.

**Remediation:** Include half-width and n in the badge's accessible name, and repeat them in the metric card's expanded/detail state; consider "±3.2 (n=10)" as the badge text at wide viewports.

**Effort:** S

---

## Quick Wins

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| QW-1 | Move `ToastProvider` to `main.jsx` above `<App/>` | 15 min | Fixes CI-1 — restores every save/error/report notification in the authoring flow |
| QW-2 | Add `visualPending` to the `beforeunload` dependency array (`ModelDetail.jsx:745`) | 5 min | Fixes UX-2 — stops silent loss of canvas work on reload |
| QW-3 | Guard the Ctrl+Z handler with an `activeElement` check (mirror `App.jsx:277`) | 15 min | Halves CI-4 — restores native text undo |
| QW-4 | Wire `setShowKeyboardShortcuts(true)` to `?` (move Help Assistant to another trigger) and add a menu entry | 30 min | Fixes UX-1 — makes the already-built shortcuts overlay reachable |
| QW-5 | Delete `outline:"none"` from `Field`, `DistPicker`, and `DropField` in `components.jsx` | 30 min | Covers the majority of CI-2 via shared-component reuse |
| QW-6 | Move save toasts into `.then()` and add "Saved — N issues to fix before running" to `SaveBanner` | 45 min | Fixes CI-3's misleading sequencing and gives a provider-independent cue |
| QW-7 | Replace `(true \|\| …)` in `ModelHealthPanel.jsx:24` and delete `resolvedSeed` | 10 min | Fixes CON-5's behavioural half |
| QW-8 | Set `saveError` + dirty instead of `catch {}` at `ModelDetail.jsx:1133` | 15 min | Fixes UX-3 |
| QW-9 | Reformat `TabErrors` to message-first, "· Code Vn" suffix | 20 min | Fixes UX-4, aligns with §7.11 and Model Health |
| QW-10 | `role="status"` on the ExecutePanel save-status banner; announce batch completion | 20 min | Fixes the highest-value part of A-3 |
| QW-11 | Editable integer on BATCH/FILL/DRAIN/SPLIT chips | 2–3 h | Fixes M-3 — removes the quantised-parameter capability cliff |
| QW-12 | Add up/down buttons + editable P-badge to C-event cards | 2–3 h | Fixes M-4 |

---

## Strategic Improvements

### S-1 — Institute an "is it wired?" verification pass for cross-cutting UI systems

**Priority:** High

CI-1, CI-2, and UX-1 share one root cause: a system was built correctly and connected incompletely, and nothing failed. Add integration tests that exercise features from the top of the tree — render `App` with an open model and assert a toast appears on save failure; assert `?` opens the shortcuts modal; assert a focused input shows a computed outline. `tests/ui/accessibility.test.jsx` is the right template; it currently tests components in isolation, which is exactly why these three bugs survived.

### S-2 — One modal system

Consolidate the eleven dialog implementations and ten native `confirm`/`alert` calls (CON-2, A-2) onto a single `ModalShell` providing overlay, dialog semantics, `aria-labelledby`, focus trap/restore, and Escape — the FeedbackModal already contains the reference implementation. This one change closes CON-2, A-2, and the remaining `aria-labelledby` gaps simultaneously.

### S-3 — Finish the plain-language programme where it started

The Sprint 67 work is the product's differentiator, and its remaining gaps are all in the Define stage: two-layer labels for B-/C-Events (M-1), the jargon duplicate run-settings form (CON-1), code-first inline errors (UX-4), and the Model Data grab-bag (CON-3). A focused sprint applying the §7.11 pattern to Define would make the plain-English experience continuous from create through analyse rather than skipping the hardest middle.

### S-4 — Scale the structured pickers for real models

The no-free-text principle is right for this audience, but M-2/M-3 show it straining at realistic model sizes. Adopt a progressive composition pattern (macro → operands → quantities) with type-ahead filtering as the standard picker interaction, replacing pre-expanded cross-products. This also naturally fixes the quantised parameters.

### S-5 — Undo as a modeller-grade facility

Beyond CI-4's fixes: coalesced field edits, a larger cap, and ideally a labelled history ("Deleted C-event 'Seize'", "Changed Triage service time") surfaced in the UI. For a tool whose users iterate on structure experimentally, undo confidence directly increases willingness to explore — the same rationale as the Versions tab, at a finer grain.

### S-6 — Decompose the two remaining god components

`execute/index.jsx` (3,394 lines, ~45 useState hooks) and `ModelDetail.jsx` (2,013 lines) are the successors to the prior review's CI-4. The extraction pattern already proven with `ModelTabBar`/`ModelDetailHeader`/`SaveBanner`/`ModelHistoryTab` should continue: sweep configuration, batch execution, and run persistence are separable domains within ExecutePanel.

---

## Remediation Required vs Improvement Recommendations

| Code | Finding | Class | Effort |
|------|---------|-------|--------|
| CI-1 | ToastProvider scope — authoring feedback dead | **Remediation required** | S |
| CI-2 | Inline `outline:"none"` defeats focus ring on all form controls | **Remediation required** | M |
| CI-3 | Silent save with blocking validation errors | **Remediation required** | S |
| CI-4 | Per-keystroke undo, 20-cap, Ctrl+Z hijack in text fields | **Remediation required** | M |
| UX-2 | Stale `beforeunload` closure — canvas work lost on reload | **Remediation required** | S |
| UX-3 | Swallowed canvas-init save failure | **Remediation required** | S |
| A-1 | `aria-hidden` clickable badges / nested interactive spans | **Remediation required** | M |
| CON-4 | Theme-blind components (AdminPanel, MarkdownContent) + `errorLight` drift | **Remediation required** | S |
| UX-1 | Unreachable shortcuts modal, `?` conflict | Improvement recommended | S |
| CON-1 | Duplicate run-setup form with jargon labels | Improvement recommended | S |
| CON-2 | Native confirm/alert vs themed modals | Improvement recommended | M |
| CON-3 | "Model Data" grab-bag / tab id-label drift | Improvement recommended | M |
| CON-5 | Dead conditions and vestigial state | Improvement recommended | S |
| UX-4 | Code-first inline validation text | Improvement recommended | S |
| A-2 | Inconsistent modal focus management | Improvement recommended | M |
| A-3 | No live region on run progress / result save | Improvement recommended | S |
| A-4 | 9–10px text below the product's own 11px floor | Improvement recommended | M |
| A-5 | `prefers-reduced-motion` unused | Improvement recommended | S |
| R-1 | Mobile Design mode tab density | Improvement recommended | M |
| R-2 | Flex-wrap ragging of fixed-width setup fields | Improvement recommended | S |
| M-1 | B-/C-Event first-layer jargon (rename deferred) | Improvement recommended | S–L |
| M-2 | Combinatorial effect option lists | Improvement recommended | M |
| M-3 | Quantised macro parameters (BATCH 2/5/10 etc.) | Improvement recommended | M |
| M-4 | Drag-only C-event priority | Improvement recommended | S |
| M-5 | Hover-only CI half-width / replication count | Improvement recommended | S |

**Summary:** 8 findings require remediation (correctness, data-loss, or WCAG failures — all S/M effort, none architectural); 17 are recommendations that would consolidate an already-strong 7.5/10 experience toward production polish.
