# Expert Review 2026-08 — Consolidated Remediation Register

**Date:** 2026-08-24
**Scope:** Consolidates the three companion expert reviews plus a verified test-suite baseline run:

| Document | Perspective | Verdict |
|---|---|---|
| `expert-review-2026-08-ux.md` | UX expert + simulation modeller | UX maturity **7.5/10** (up from 6/10 in `docs/ui-ux-review.md`, 2026-05-16); 8 remediation items, 17 recommendations |
| `expert-review-2026-08-functionality.md` | DES product capability | Capability **8/10** (mid-tier commercial standard for service-domain DES); documentation/process truthfulness **4/10** |
| `expert-review-2026-08-code.md` | Principal-engineer code review | Strong safety posture (no dynamic eval, server-side LLM keys, seeded RNG CI-gated); critical CI gap, dependency and provisioning risks, two god components |

Every finding in the companion documents is verified at file:line. This register de-duplicates across the three reviews, adds the executed test baseline, and proposes a sprint grouping.

---

## 1. Verified Quality Baseline (executed 2026-08-24, HEAD `80f7ba1`)

The CI pipeline does not run the test suite (C-1/F-1), so the suite was executed locally as part of this review:

```
Test Files  20 failed | 183 passed (203)
Tests       40 failed | 3045 passed | 2 skipped (3087)
Typecheck   PASS (tsc --noEmit — but covers only src/contracts/*.ts, 3 files)
```

**Failure characterisation** — the failures are test-rot, not fresh regressions in engine correctness:

- **~35 UI-drift failures** — Testing Library selectors no longer match renamed/moved elements (e.g. missing `button /^setup$/i`, `button /save changes/i`, text `v3 (auto-assigned)`, placeholder `/e.g. Queue with Reneging/i`, region `/model health/i`). Classic drift when the suite is not enforced on merge.
- **2 engine helper contract drifts** — `src/engine/__tests__/entities.test.js`: `busyOf` returns 0 where the test expects 1; `findById` returns `null` where the test expects `undefined`. Small, but these are engine-layer assertions and must be resolved deliberately (fix code or fix test with justification).
- **3 report-content drifts** — `src/reports/__tests__/reportGenerator.test.js`: generated HTML no longer contains `direct-routing`, `Journey Time Breakdown`, `Queue Wait-Time Distribution` sections the tests expect.

**Failing files (18 enumerated from the run; Vitest reports 20 failed files):**
`src/engine/__tests__/entities.test.js`, `src/reports/__tests__/reportGenerator.test.js`, `tests/engine/run-admission.test.js`, `tests/engine/single-run-control.test.js`, `tests/ui/accessibility.test.jsx`, `tests/ui/editors/container-editor.test.jsx`, `tests/ui/editors/queue-editor.test.jsx`, `tests/ui/execute/node-detail-sidebar.test.jsx`, `tests/ui/execute/run-admission.test.jsx`, `tests/ui/model-export.test.jsx`, `tests/ui/model-health.test.jsx`, `tests/ui/model-import.test.jsx`, `tests/ui/model-share-link.test.jsx`, `tests/ui/results/results-workspace.test.jsx`, `tests/ui/run-history.test.jsx`, `tests/ui/session-handoff.test.jsx`, `tests/ui/version-history.test.jsx`, `tests/ui/visual-designer/visual-designer-panel.test.jsx`

The analytical correctness gates that CI *does* run (M/M/1, M/M/c benchmarks, no-`Math.random`-in-engine grep) pass.

---

## 2. Remediation Required — Prioritised Register

IDs reference the companion documents (C-n = code review, F-n = functionality review, CI-/UX-/A-/CON- = UX review). T-1 is new to this register.

### Priority 0 — Trust and feedback (do first)

| # | Refs | Severity | Finding | Evidence | Action | Effort |
|---|---|---|---|---|---|---|
| R-01 | C-1, F-1 | **Critical** | CI job named "Vitest test suite" runs no tests; typecheck never runs in CI; `benchmarks`/`build` gate on a job proving nothing | `.github/workflows/ci.yml` (test job ends after `npm ci`) | Add `npm test` and `npm run typecheck` steps to the `test` job | S |
| R-02 | T-1 (this register) | **Critical** | 40 tests failing across 20 files at HEAD (see §1) — must be repaired *before* R-01's gate is enabled, or merges stall | §1 baseline | Triage per §1: update drifted UI selectors; deliberately resolve the 2 engine and 3 report assertion drifts | M |
| R-03 | UX CI-1 | **Critical** | `ToastProvider` wraps only the library branch; the model-editing branch returns earlier, so all ~31 save/error/report toasts in ModelDetail, editors, run history, CSV import and AI panels hit the silent no-op fallback — the entire authoring flow has no feedback | `src/App.jsx:588-670, 703, 792`; `src/ui/shared/ToastContext.jsx:118-124` | Move `ToastProvider` to wrap the whole authenticated shell (all branches incl. Admin, Settings, Auth, Dashboard, ImportPreview) | S |
| R-04 | C-5 | **High** | `xlsx@0.18.5` (known prototype-pollution and ReDoS advisories; last public-npm SheetJS release) parses user-uploaded spreadsheets | `package.json`; `src/ui/shared/xlsxParser.js`, `src/ui/execute/executeHelpers.js`, `src/ui/results/ResultsWorkspace.jsx`, `src/ui/ModelHistoryTab.jsx` | Move to SheetJS CDN release ≥0.20.2 or migrate to a maintained alternative (e.g. exceljs for the write path) | M |

### Priority 1 — Data safety, accessibility failures, provisioning

| # | Refs | Severity | Finding | Evidence | Action | Effort |
|---|---|---|---|---|---|---|
| R-05 | UX CI-3 | High | Save proceeds despite blocking validation errors; the compensating warning toast fires pre-resolve and is dead per R-03 — broken models save silently | `src/ui/ModelDetail.jsx:672-695` | Block or explicitly confirm save on blocking errors; fire toast after resolve | S |
| R-06 | UX CI-2 | High | 156 inline `outline:"none"` defeat the global `:focus-visible` ring on every input/select/textarea (WCAG 2.4.7) | `index.html:10`; `src/ui/shared/components.jsx:141-142` + 150 further sites | Remove from shared `Field`/input bases; add a visible token-driven focus style; sweep remaining sites | M |
| R-07 | UX CI-4 | High | Undo snapshots per keystroke into a 20-deep stack; global Ctrl+Z intercepts text-field undo with no `activeElement` guard — typing wipes structural undo | `src/ui/ModelDetail.jsx:582-588, 661-670` | Debounce/coalesce snapshots; skip handler when focus is in an editable element; raise cap | M |
| R-08 | C-9 | High | No baseline migration: `des_models`, `simulation_runs`, `profiles` have no `CREATE TABLE` in `supabase/migrations/` (tree starts 20260505, patch-only) — a fresh environment cannot be provisioned; service key stored in a DB GUC | `supabase/migrations/` | `supabase db dump` a baseline migration; move the key to Vault; fold in the stray `PR-001_run_record_integrity.sql` | M |
| R-09 | C-13, UX-3 | High | ~40 silent catch sites including a swallowed model-save failure inside a JSX callback and canvas-init save failures | `src/ui/ModelDetail.jsx:1133` (first), plus `ModelDetail.jsx:872,1696`, `execute/index.jsx:1257`, `ResultsWorkspace.jsx:1620`, `ModelHistoryTab.jsx:660`, `ExportPopover.jsx:348`, `ImportPreview.jsx:41` | Surface via the (re-wired) toast system; annotate the deliberate silences as `src/db/supabase.js:15-17` already does | M |
| R-10 | UX-2 | High | `beforeunload` guard reads `visualPending` but depends only on `[dirty]` — canvas edits lost without warning on reload | `src/ui/ModelDetail.jsx:737-745` | Add `visualPending` to the dependency array | S |
| R-11 | UX A-1 | High | Clickable validation badges are `aria-hidden` interactive spans nested inside tab buttons at 9px — invisible to and unreachable by assistive tech | `src/ui/ModelTabBar.jsx:88-115, 273-300` | Make badges real buttons or fold the action into the tab's accessible name; drop `aria-hidden` | M |
| R-12 | F-2, F-3, F-4, F-5, C-15 | High | AGENTS.md (the binding agent contract) describes a codebase ~30 sprints old: 19 macros claimed (24 exist), ~V19 validation codes documented (73 exist), "UI and DB untested" (85 test files exist), three long-fixed defects listed as open; capability docs 21–34 sprints stale with phantom `WebSocketAdapter`; CLAUDE.md "current sprint" points at 79 (code is at 89); sprint-86 plan says "Not started" though shipped | `AGENTS.md` §3a/§5.1/§8/§10; `docs/capability-*.md`; `CLAUDE.md`; `docs/reviews/sprint-86-plan.md` | Refresh AGENTS.md against source (prefer pointers over counts); correct status metadata; update capability docs | M |

### Priority 2 — Hygiene and low-risk corrections

| # | Refs | Severity | Finding | Evidence | Action | Effort |
|---|---|---|---|---|---|---|
| R-13 | C-8 | Medium | `supabase/.temp/` committed (9 files) exposing live project ref and pooler URL | `supabase/.temp/project-ref`, `pooler-url` | `git rm --cached`, extend `.gitignore` | S |
| R-14 | C-17 | Medium | Deploy workflow covers only 1 of 5 edge functions | `.github/workflows/deploy-functions.yml` | Deploy all functions (llm-proxy, results-api, import-model, notify-*) | S |
| R-15 | UX CON-4 | Medium | Theme-blind components (AdminPanel, MarkdownContent); `errorLight` exists in `tokens.js` `C` but not in theme palettes | `src/ui/shared/ThemeContext.jsx` vs `tokens.js` | Align palettes; migrate the two components to theme context | S |
| R-16 | C-4 | Low | `"version": "0.9.0 - Beta"` is not valid semver and leaks verbatim into the UI via `VITE_APP_VERSION` | `package.json`; `vite.config.js`; `src/ui/FeedbackModal.jsx:7` | Use `"0.9.0"`; add a separate display label | S |
| R-17 | C-10 | Low | `Math.random`-based ID fallbacks in the db layer, including a guessable share-token fallback | `src/db/models.js`, `src/db/local.js` | `crypto.randomUUID()`; delete the share-token fallback | S |
| R-18 | C-14 | Low | Tracked junk: `null`, `tmp-probe*.txt`, `tmp-vitest-full.*`, `analaysis.py` (typo'd duplicate), `indexx.html` + two `simmodlr-landing*.html` variants (a second, competing design system), 6 `.bak` files, `.codex-temp/*`; `.gitignore` is 6 lines | repo root; commit `b500c78` | One sweep commit; extend `.gitignore` (`*.bak`, `tmp-*`, `supabase/.temp/`, `.codex-temp/`) | S |

---

## 3. Improvement Recommendations (consolidated)

Not defects — enhancements that consolidate a strong product. Grouped by theme; full detail in the companion documents.

### 3.1 Engineering foundations

| Refs | Recommendation | Effort |
|---|---|---|
| C-3 | Adopt ESLint (react-hooks, no-empty) + Prettier + a CI lint job — 72k LOC currently has zero automated style/complexity enforcement | M |
| C-2 | Extend typecheck beyond 3 files: enable `checkJs` with `@ts-check` opt-in, starting at `src/db` and `src/engine` | M |
| C-11, UX S-6 | Decompose the two god components: `src/ui/execute/index.jsx` (3,394 lines, ~100 `useState`) and `src/ui/ModelDetail.jsx` (2,013 lines, 53 `useState`) — extract by state cluster, reducers for invariant groups | L |
| C-12 | Add `src/db/auth.js` wrapper for the 15 direct `supabase.auth.*` UI call sites; fold stray hex/rgba colours into `tokens.js` | M |
| C-16 | Upgrade vitest 1.x → 3.x; add `engines`/`packageManager` fields | M |
| C-6, C-7 | Document the `fallow` clone-detection devDep (legitimate but unreferenced by any script); move `docx` to devDependencies | S |
| C-18 | Surface the 17 SimPy-export TODOs as NOT-SUPPORTED warnings in generated Python + UI | S/M |

### 3.2 UX polish (from the 7.5/10 review)

| Refs | Recommendation | Effort |
|---|---|---|
| UX S-1 | Institute an "is it wired?" verification pass for cross-cutting UI systems (the toast and shortcuts-modal findings were both built-but-not-wired) | S |
| UX-1 | Make the keyboard-shortcuts modal reachable; resolve the `?` binding conflict with Help Assistant | S |
| CON-1, CON-2, UX S-2 | One vocabulary and one modal system: retire the jargon duplicate run-setup form (`execute/index.jsx:192-261`) in favour of the plain-English `ExperimentControls`; replace the 10 native `confirm`/`alert` dialogs | M |
| M-1, UX-4, UX S-3 | Finish the plain-language programme: execute the deferred Arrivals/Activities rename (101 first-layer "B-Event/C-Event" occurrences); demote validation codes to secondary detail | S–L |
| M-2, M-3, F-8, UX S-4 | Scale the structured pickers: cap/search the combinatorial effect option lists (MATCH is O(|Q|³), COSEIZE O(|Q|·|S|²·skills)); free the quantised macro parameters (BATCH 2/5/10 etc.) with numeric entry | M |
| M-4, M-5 | Numeric + keyboard path for C-event priority (currently drag-only); make CI half-width/replication detail persistent rather than hover-only | S |
| A-2–A-5, R-1, R-2 | Accessibility/responsive polish: uniform modal focus management, live regions for run progress and save status, honour the 11px type floor, `prefers-reduced-motion`, mobile Define-tab prioritisation | S–M each |
| CON-3, CON-5 | Rename the "Model Data"/"Data Sources" tab-id drift; remove dead conditions (e.g. `ModelHealthPanel.jsx:23` `(true || …)`) | S |

### 3.3 Capability roadmap (from the functionality review)

| Refs | Recommendation | Effort |
|---|---|---|
| F-6 | Give live data a real front door: secrets UI (currently `{{env.VAR}}` via sessionStorage/devtools only), mapping assistant, test-connection for Rest/ScheduleFeed/ActualsStream adapters | M |
| F-7 | First-class conditional/probabilistic routing beyond `entityFilter` on ASSIGN/COSEIZE (Sprint 89 direction — continue) | L |
| F-9 | Named-scenario manager over the existing Arena-class statistics machinery (paired-t, ANOVA, Tukey HSD already implemented) | M |
| F-10 | Close the optimisation loop — ~80% of scaffolding exists (adaptive batch + sweeps + goals) | L |
| F-11 | Input-fitting transparency: ranked candidate fits with goodness-of-fit statistics instead of silent Empirical fallback | M |
| F-12 | Minimal transporter/conveyor primitive (the `Distance` distribution partially mitigates today) | L |

---

## 4. Suggested Sprint Grouping

- **Sprint 90 — "Trust the pipeline"**: R-01, R-02, R-03, R-05, R-13, R-18 (CI gate live and green; authoring feedback restored; hygiene sweep). Small efforts, outsized risk reduction.
- **Sprint 91 — "Data safety & accessibility"**: R-04, R-06, R-07, R-09, R-10, R-11, R-15.
- **Sprint 92 — "Provisioning & documentation truth"**: R-08, R-12, R-14, R-16, R-17.
- **Programme work (parallel/backlog)**: §3.1 foundations first (lint + checkJs raise the floor for everything else), then §3.2 UX polish and §3.3 capability roadmap per product priority.

---

## 5. Status — Sprint 90 implemented (2026-08-24, branch `claude/expert-reviews-remediation-xt3b20`)

| Item | Status | Notes |
|---|---|---|
| R-01 CI gate | ✅ Done | `ci.yml` test job now runs the suite (sharded 2×) plus a new typecheck job |
| R-02 Failing tests | ✅ Done | All 40+ failures repaired across 19 files. Verdicts: one **real regression** found and fixed (`ModelHealthPanel` was imported and computed but never rendered — now mounted on overview/run/results tabs); everything else was verified test drift, with git-history evidence for each engine/report case. Determinism parity, model immutability, and both analytical benchmarks re-verified green. |
| R-03 ToastProvider | ✅ Done | Moved to `main.jsx`; authoring-flow toasts now render everywhere |
| R-05 Save gate | ✅ Done | Blocking validation errors now require explicit confirmation; result toasts fire after the save resolves |
| R-13 supabase/.temp | ✅ Done | Untracked and gitignored |
| R-18 Hygiene sweep | ✅ Done | Junk removed, `.bak`/tmp files deleted, landing pages archived to `docs/archived/landing/`, `.gitignore` extended |
| Dev loop (user request) | ✅ Done | `test:quick` script (`vitest run --changed`), corrected README testing docs, CI sharded for wall-time |

Full-suite verification at completion: 0 failures (result recorded in the closing commit message).

## 6. Status — Sprints 91 + 92 + lint adoption implemented (2026-08-24, same branch)

| Item | Status | Notes |
|---|---|---|
| R-04 xlsx | ✅ Done | Replaced by `exceljs` behind `src/ui/shared/workbook.js` (dynamic import, code-split); round-trip test added |
| R-06 Focus rings | ✅ Done | All ~192 inline `outline:none` sites removed; `src/ui` now at zero |
| R-07 Undo | ✅ Done | `setWholeModel` dedupe guard; Ctrl+Z/Y skips editable elements (native text undo restored); new `undo-guard` tests |
| R-09 Silent catches | ✅ Done | Snapshot-fallback now warns in both report paths + ExportPopover; share-link and canvas-init failures toast; Copy JSON shows failure; legitimate storage guards annotated |
| R-10 beforeunload | ✅ Done | `visualPending` added to deps |
| R-11 aria-hidden badges | ✅ Done | Badges decorative; counts remain in parent `aria-label`s; a11y test added |
| R-15 Theme drift | ✅ Done | MarkdownContent themed; `errorLight` in all palettes; AdminPanel static import dropped |
| Canvas trust (new) | ✅ Done | RouteEdgeDialog probability commits on blur via `CommitInput` (VisualNodeInspector was already fixed) |
| Lint adoption | ✅ Done | ESLint flat config (react-hooks scoped to UI; engine is React-free by contract); `npm run lint`; CI Lint job; `exhaustive-deps` at warn (~285 warnings = visible debt) |
| R-08 Baseline migration | ✅ Done | `20260504000000_baseline_core_tables.sql` from live DDL; PR-001 renamed to `20260630090000`; migrations README documents repair commands + out-of-band GUCs |
| R-12 Docs truth-up | ✅ Done | AGENTS.md §3a/§5.1/§8/§10/§12 corrected (24 macros, authoritative validation pointer, C8/G1–G4 verified fixed); CLAUDE.md/README/capability docs updated |
| R-14 Edge deploys | ✅ Done | All 5 functions deployed; CLI pinned |
| R-16 Version | ✅ Done | `0.9.0` semver; "Beta" display-only via vite define |
| R-17 IDs | ✅ Done | `crypto.randomUUID()`; guessable share-token fallback deleted |

**Bugs found by the first lint run** (all fixed, validating the C-3 recommendation): `src/engine/phases.js` referenced an undefined `clock` (runtime crash when a suspended server reactivates on capacity increase); `ModelDetail.discard()` referenced undeclared `visualPendingRef` (runtime crash); duplicate `queues:` key in `renameEntityType` (dead first mapping); the ModelHealthPanel `(true || …)` dead condition; a conditionally-called `useMemo` in ResultsWorkspace's WaitHistogram; a `useTheme()` call in a non-component helper.

**Sprint 93 (2026-08-25, same branch) implemented six of §3.2's UX-polish items** — see `docs/reviews/sprint-93-plan.md`: UX-1 (shortcuts modal reachability), M-4 (C-event priority numeric entry), M-5 (persistent CI detail), CON-3 (unified tab labels), A-3 (live regions), A-5 (`prefers-reduced-motion`). Verified: full suite 3127/3127 real test cases, typecheck/lint/build clean.

Remaining from the register: §3.1 engineering foundations (typecheck coverage, god-component decomposition, `src/db/auth.js` wrapper, dependency currency), the rest of §3.2 (Arrivals/Activities Phase 2, picker scaling, scenario manager, one-modal-system), and §3.3 capability roadmap.

## 7. Draw/Run integration — ADR-020 (2026-08-25, same branch)

Following the reviews, the product owner raised a fundamental-experience gap the findings-list format under-weighted: building and executing a model are three separate rooms (Design → Run → Results), with no continuous feedback loop, despite the engine being fast and side-effect-free enough to support one. `docs/decisions/ADR-020-draw-run-live-preview.md` records the design, grounded in two deep-exploration passes over the Draw canvas and execution/worker architecture, and explains why a full dual-mode canvas merge is Phase 2+ (real, multi-sprint UI work) rather than a first move.

**Phase 1 shipped, flagged off by default**: a collapsible Live Preview strip on the Draw canvas that runs a small, capped, non-persisting simulation — debounced 800ms after the last edit to avoid rewind-flicker, looping on completion — rendered through the existing, unmodified `ExecuteCanvas` component. No engine changes, no changes to Draw's editing behaviour or Execute's canvas. New tests (`use-live-preview.test.jsx`, `live-preview-panel.test.jsx`) exercise the real debounce/rebuild/loop/error behaviour via fake timers, not mocks. Full suite verified green before push (3101/3101 real cases).

**Update (2026-08-25): on hold.** Phase 1 was dogfooded and reviewed (one real bug found and fixed — a freeze-instead-of-updating display bug during the debounce window; one known limitation, the schedule/live-data fidelity gap, documented but deliberately left unfixed). After trying it on a real model, the product owner decided to remove Phase 1 (`LivePreviewPanel.jsx`, `useLivePreview.js`, and their tests) and put the whole Draw/Run integration direction on hold rather than proceed to Phase 2. See ADR-020's "On Hold" section for the full reasoning and what to reuse if this is revisited.

**Update (2026-08-26): decided against.** The product owner has confirmed the final call — the Draw and Run canvases will not be integrated and remain separate surfaces. Phase 2+ is cancelled, not paused; ADR-020's status and closing section record the decision and the rationale (the authoring/execution separation proved to be a feature, not a gap).

## 8. Status — Sprint 94 implemented (2026-08-26, same branch): Phase 1 engineering foundations complete

§3.1's five remaining items (C-3/ESLint was already done; C-11/UX S-6 god-component decomposition deliberately deferred to Phase 2):

| Item | Status | Notes |
|---|---|---|
| C-6/C-7 Dependency housekeeping | ✅ Done | `docx` moved to `devDependencies`; `fallow` documented as ad hoc dev tooling |
| C-12 Auth wrapper + stray colours | ✅ Done | `src/db/auth.js` added (signIn/signUp/signOut/resetPassword/updateUserPassword/getSession/setSession/onAuthStateChange/getAccessToken), all direct `supabase.auth.*` UI call sites migrated; stray hex/rgba centralised into `tokens.js` (`SHADOW.*`, `DOMAIN_COLORS`, `SECTION_COLORS`) |
| C-18 SimPy export gaps | ✅ Done | Untranslatable routing conditions, missing service/delay distributions, and all 8 `TODO_MACRO_SET` macros (including the `RELEASE_COSEIZED` stub-dict bug) now surface as `NOT SUPPORTED` warnings instead of silently mistranslating; tests added for each gap class |
| C-2 Typecheck coverage | ✅ Done | `// @ts-check` on all 30 files across `src/db/` + `src/engine/`, `tsc --noEmit` clean repo-wide |
| C-16 Vitest upgrade | ✅ Done | 1.6.1 → 3.2.7 (4.x deferred — needs a vite 6/7/8 bump too; documented fast-follow). Surfaced and fixed four real pre-existing bugs the version bump exposed rather than caused: a hard, non-configurable ~60s vitest worker-RPC timeout that several long-but-previously-"passing" simulation tests now trip (fixed by yielding periodically instead of running fully synchronously); three cross-file test-pollution bugs from vitest 3's jsdom-environment reuse across files sharing a worker (`window.SpeechRecognition` mock never restored, a `navigator.clipboard` mock-descriptor conflict with `@testing-library/user-event`'s own clipboard stub, and a `localStorage`-persisted UI preference leaking between files); one flaky-by-construction test (unseeded RNG, now seeded); and an intermittent `vi.mock()` failure for the `@xyflow/react` dependency under CPU contention, fixed for 4 of 5 affected files via a local re-export wrapper module. **One known residual**: `tests/ui/execute/execute-canvas-f9c6.test.jsx` still hits that last failure mode in roughly 1 of 3 full-suite runs (never standalone) — root-caused to a likely gap in vitest's per-file module-isolation for a specific transitive-import pattern, not yet proven or fixed; documented in the landing commit as a bounded follow-up rather than chased further, per this item's own "acceptable to stop and log as fast-follow" contingency |

Verified: full suite (`npx vitest run`) 3136 passed / 2 skipped, matching the pre-upgrade baseline, repeatable across many consecutive runs; `npm run typecheck`, `npm run lint -- --quiet`, and `npm run build` all clean. The two `supabase/functions/*/index.test.ts` failures seen throughout this work are confirmed pre-existing and version-independent (identical under vitest 1.6.1 with this sprint's changes stashed away) — a Deno-style `https://` import Node's ESM loader can't handle, unrelated to any of the above.

**Phase 1 of the outstanding-backlog programme is now complete.** Phase 2 (god-component decomposition of `execute/index.jsx` and `ModelDetail.jsx`) is next, and needs its own plan given its size and risk.

---

## 9. Status — Phase 3 items 2-4 implemented (2026-08-26, same branch): picker scaling, scenario manager, one-modal-system foundation

Phase 2 (god-component decomposition) remains deliberately deferred; work continued into three independent §3.2 UX-polish items instead (item 1, the Arrivals/Activities plain-language rename, stays parked pending evidence, as originally decided).

| Item | Status | Notes |
|---|---|---|
| M-2/M-3/F-8/S-4 Picker scaling | ✅ Done | Removed hardcoded fixed-quantity enumeration for BATCH/SPLIT/DRAIN/FILL in `EffectPicker`, replaced with the same operand-select + validated numeric field composition pattern already used for SET/SET_ATTR/COST/ROUND_ROBIN/CANCEL/MATCH — no free-text escape hatch introduced (audit C1 preserved). Added a COSEIZE composer (previously had no scalable entry path). Capped the two genuinely combinatorial enumerations (MATCH, COSEIZE) at 50 options rather than letting them grow unbounded with model size. Added type-ahead search to `EffectPicker`'s option list |
| F-9 Named-scenario manager | ✅ Done | New `scenarios` table + CRUD (`src/db/scenarios.js`) for lightweight, named parameter-delta sets against a model — distinct from the heavier `parent_model_id`/`forkModel()` model-fork concept, which stays as-is. Runs in-memory on demand for comparison (same established pattern as `AdaptiveBatchPanel.jsx`'s Explore feature) rather than persisting to `simulation_runs`. First-ever UI surface for `oneWayANOVA`/`tukeyHSD` (`AnovaTukeyTable.jsx`) — both existed and were tested at the engine layer with no screen calling them |
| C-1 One-modal-system (foundation + ConfirmDialog + 13 confirm/2 alert sites) | ✅ Done (scoped) | Added `ModalShell`/`useFocusTrap` (extracted from `FeedbackModal.jsx`, generalising `HeaderAccountMenu.jsx`'s restore-focus-to-trigger into a shared hook) and `ConfirmDialog`/`useConfirm` as a themed, testable, async replacement for `window.confirm()`/`window.alert()`. Migrated all 13 destructive confirmations and 2 one-button alerts found across the app (App.jsx, VersionHistoryPanel.jsx, ModelDetail.jsx, ModelHistoryTab.jsx, BEventEditor.jsx, EntityTypeEditor.jsx, execute/index.jsx, DistPicker) plus 3 of the ~10 "batch 1" simple modal components while those files were already open for the confirm migration (App.jsx's fork-confirm dialog, VersionHistoryPanel's "Tag a version" dialog, `ChartDataChoiceDialog.jsx`). Real-scope research during planning found more surface area than the original review estimated (19 dialog-shaped components vs. "eleven", 15 confirm/alert sites vs. "ten"); user chose to land the foundation + ConfirmDialog + this batch now, explicitly deferring the remaining ~7 batch-1 modals, "batch 2" (`NewModelModal`, `RouteEdgeDialog`), the 3 structurally-different surfaces (`AdaptiveBatchPanel`'s explore panel, `HelpAssistant`'s docked panel, `PatternsGuidePanel`'s drawer), and CON-1 (unrelated field-group extraction) as explicit follow-ups |

Two real bugs were caught and fixed during this work, both before landing: an invalid JSX string literal (escaped quotes in an attribute position) in `ScenarioManagerPanel.jsx`, and a `useEffect` that fetched scenarios even for a signed-out user. A third was caught only by a full-suite run *after* the first three commits landed — `tests/setup.js`'s new `offsetParent` stub (needed so jsdom's hardcoded-null layout properties don't defeat `useFocusTrap`'s visibility filter in tests) referenced `HTMLElement` unconditionally, crashing every test file using the plain `node` environment (most engine/db tests); fixed in a follow-up commit once the full suite caught it, since none of the narrower per-file verification runs beforehand happened to combine a node-environment file with one needing the stub.

Verified: `npm run lint -- --quiet`, `npm run typecheck`, and `npm run build` all clean throughout. Full suite (`npx vitest run`) green at 213/215 files, 3188 passed / 2 skipped — the 2 failing files are the same pre-existing `supabase/functions/*` Deno-import ESM-loader issue documented in Sprint 94, unrelated. One full-suite run in between the `offsetParent` fix and this final green run showed a one-off `tests/ui/shared/workbook.test.js` failure (`global.attachEvent is not a function`, from the `setimmediate` package's postMessage-strategy feature detection) that did not reproduce on an immediate re-run or standalone — consistent with the same class of vitest-3 jsdom-environment-reuse-across-a-shared-worker flake already documented in Sprint 94's status entry, not a regression from this work.

Landed as 5 commits on this branch: picker scaling; the one-modal-system foundation; the scenario manager (which also carried `ModelDetail.jsx`'s confirm-dialog migration, since that file needed touching for both); the remaining confirm/alert call-site migration; and the `tests/setup.js` fix.

---

## 10. Status — Stakeholder View implemented (2026-08-26, same branch): a run-only surface for viewer-role business users

A new capability, prompted by a real need ("I want to share a model with a business user… let them explore a model of their business domain") rather than an existing register item — none of §3.3's items covered it, and a research pass confirmed every existing sharing door was wrong for the purpose: share links are frozen results snapshots of one past run (no Run, no parameters); public+fork lands the recipient in the full editor on a private copy; and granting `viewer` access dropped them into the **complete modelling environment**, because `isOwner`/`canEdit` were hardcoded `true` where `ModelDetail` is rendered (`App.jsx`) — the read-only gating machinery throughout `ModelDetail` was fully built but never wired, so viewers saw even the owner-only Access/Versions tabs and their edits failed only as opaque RLS errors at save time.

What shipped, as 5 commits:

| Piece | Notes |
|---|---|
| `exposedParams` model field + `src/engine/exposed-params.js` | Owner-curated list of parameters a viewer may vary, chosen from `enumerateSweepableParams()`' output, stored in model_json as identity + curation fields only (`{path, businessLabel?, min?, max?}`) — never `currentValue` (can be `Infinity`). `resolveExposedParams()` reconciles stored entries against a fresh enumeration each render (mandatory, since `applySweepValues()` silently no-ops on missing targets); `clampExposedValue()` applies bounds, flooring queue-capacity knobs at 1 (0 means unlimited). Round-trip test added per the schema contract |
| Allowlist carry-through | Export (`buildModelExportPayload`), import (`extractImportedModelPayload`), and AI-apply (`mergeGeneratedModel`) all preserve `exposedParams` — each was a whitelist rebuild that would otherwise silently drop it |
| Real `isOwner`/`canEdit` + `'none'`-role fixes | `App.jsx` now passes the computed values into `ModelDetail` (editors correctly lose the owner-only tabs; their RLS-level inability to write `des_models` remains a pre-existing known issue). The Remove-collaborator button deletes the access key instead of writing the truthy `"none"`, and the My Models filter checks roles strictly — a removed collaborator's model no longer lingers in their library |
| "Business view" curation section (Access tab, owner-only) | Pick a parameter from the sweepable list, give it a business-friendly name, optionally bound it; orphaned entries (deleted/renamed/reordered targets) are flagged with a warning and removable. Persists via the normal dirty→Save route |
| `src/ui/StakeholderView.jsx` + viewer routing | Viewer-role users now branch to a single clean page: model name/description, the exposed knobs (clamped, resettable), Run, progress + cancel, and KPI results via the exported `SummaryCardGrid`. Runs are N in-browser replications (`runReplications`, the ScenarioManagerPanel/AdaptiveBatchPanel headless pattern), N from the owner's `experimentDefaults` clamped to the viewer's admission tier, ADR-016 schedules resolved before any run (default schedule preferred, all rows when none is default, Run disabled while loading). Nothing persisted in v1. All strings follow the plain-English rule |

Deliberately deferred, noted for follow-up: the animated "watch it run" canvas (confirmed cleanly extractable from `ExecuteCanvas`); charts on the results page (needs `collectTimeSeries`); a shared results space (a viewer's saved runs would be invisible to the owner under the current `run_by`-scoped RLS); owner-plan-based admission (currently the *viewer's* tier gates run size); rewriting `exposedParams` paths inside `renameStateVariable` (state-variable knobs orphan on rename today, visibly flagged in the curation UI).

Also this session, unrelated housekeeping: the `scenarios` table migration from item F-9 (§9 above) had never been applied to the live Supabase project — applied now, fixing "Could not find the table 'public.scenarios' in the schema cache".

Verified: lint/typecheck clean per commit, build clean, targeted suites green per commit, and a final full-suite run at 217/220 files — the 2 pre-existing `supabase/functions/*` failures plus one occurrence of the known `@xyflow/react` mock-isolation flake (`sprint-9b-roundtrip.test.jsx`, the exact "zustand provider" signature documented in Sprint 94's entry; passes standalone 5/5).

---

## 11. Status — Run screen implemented (2026-08-27, same branch): canvas scale parity with Draw, one-line readiness, maximised canvas

Direct user feedback on the Execute (Run) screen, from screenshots of a real ED model: switching from Design to Run shrank the model to fit a fixed 480px canvas at as low as 15% zoom, even though Draw remembers a per-model pan/zoom; the RUN READINESS + advisory cards + WORKLOAD ESTIMATE stack cost ~90-250px of pre-flight information above the canvas every time, all-green case included; and the canvas itself should be maximised, with the Bottom Panel collapsed by default but expandable. This followed directly on ADR-020's decision that the Draw and Run canvases stay separate surfaces (§7 above) — the fix here is scale/layout parity between two still-independent canvases, not integration.

| Piece | Notes |
|---|---|
| Viewport parity (`ExecuteCanvas.jsx`) | Reads the same `des.vp.<modelId>` localStorage key Draw already writes (`VisualDesignerPanel.jsx`) and, when present, passes it as `defaultViewport` instead of `fitView` — both canvases share coordinates (`computeExecuteLayout` preserves saved Draw node positions), so Draw's last pan/zoom is directly meaningful on Run. Falls back to today's `fitView` on first visit or another device/browser (the key is per-browser); `minZoom` aligned to Draw's `0.1`. Run never writes the key — Draw stays the sole owner |
| One-line run readiness strip (`index.jsx`) | Collapses by default to a single row: status chip, advisory count (when any), a short workload digest (entities/scans/confidence), and a **Details ▸** control that reveals today's full panel unchanged. A genuine hard blocker (`hasAdmissionErrors`) always renders full detail automatically, with no collapse control — a blocked run is never a one-line mystery |
| Maximised, responsive canvas (`ExecuteCanvas.jsx`) | Replaced the fixed 480px default with a fill-the-viewport measurement (`computeCanvasFillHeight`, exported and unit-tested), recalculated on window resize and orientation change; a manual drag on the existing resize handle (now touch-enabled) overrides auto-fill and is persisted (`des.canvas.height`), matching how the Bottom Panel already persists its own height |
| Bottom Panel collapse persistence (`BottomPanel.jsx`) | `des.bottomPanel.collapsed` was write-only — every expand/collapse click wrote it, but nothing ever read it back, so the choice reset to collapsed on every remount. Now read on mount; default (key unset) stays collapsed, unchanged from before |

New tests: `tests/ui/execute/execute-canvas-viewport.test.jsx` (7 — stored-viewport vs. fitView fallback, minZoom, `computeCanvasFillHeight` clamp maths), `tests/ui/execute/run-readiness-strip.test.jsx` (3 — collapsed-by-default with Details/Collapse controls, advisory count shown without advisory text, a hard blocker forces full detail with no collapse control), plus two additions to `tests/ui/execute/bottom-panel.test.jsx` (persisted-expanded vs. default-collapsed).

Verified: lint/typecheck/build clean; full `tests/ui/execute/` directory green (20/20 files, 155 tests); full-suite run at 220/222 files, 3234 passed, 2 skipped — the same 2 pre-existing `supabase/functions/*` Deno-ESM-loader failures as every prior sprint this session, no new flakes.

---

## 12. Status — Canvas lossy-edit guards implemented (2026-08-27, same branch): advanced constructs survive canvas edits

An expressiveness audit of the Draw↔Define mapping (prompted by the user asking whether Draw's restrictions require the form editors) confirmed the intended split — the canvas projects only source/queue/activity/sink/container, and `docs/reviews/visual-designer-inspector-review.md` deliberately scopes the 12 invisible macros out of canvas parity — but found **six canvas code paths that silently destroyed advanced constructs** during ordinary structural edits. Layout edits were always safe (position-only writes). User-approved scope: guard or make surgical every silent-loss path; no parity work.

Shipped as 5 commits:

| Piece | Notes |
|---|---|
| `src/model/macroParser.js` surgical utilities | Bracket-aware tokeniser (RELEASE_COSEIZED's `[Type1, Type2]` list survives), `replaceMacroCall` (rewrite one call, preserve siblings and array-vs-string shape), `withReleaseTarget` (inverse of `stripReleaseTarget`, whose `^`-anchor bug — silent no-op when RELEASE wasn't the first macro — is also fixed), and `classifyActivityEffect` (assign/delay/advanced/empty — single source of truth replacing divergent regexes in graph-operations and the inspector) |
| Q→A connect refusal | Drawing a Queue→Activity edge onto a COSEIZE / skill-ASSIGN / BATCH / MATCH / multi-macro activity used to overwrite effect+condition wholesale with boilerplate `ASSIGN`. Now refused with a message (same contract as the existing `when`-schedules block); a plain ASSIGN rewires byte-identically as before; a DELAY rewires surgically (slot-capacity arg and the non-queue part of the condition survive — the old "preserve delay" branch dropped both). Condition-edge delete gets the same guard. The add-node auto-link no longer reports "linked" on a refused connect |
| Surgical rewrites | Sink COMPLETE↔RENEGE switch keeps co-located `COST`/`SET` macros; source customerType/queueName patch rewrites only the `ARRIVE` call; queue delete strips only the queue argument from `RELEASE`/`RELEASE_COSEIZED` (server still released — previously the whole effect was emptied, leaving the server claimed forever); routing-mode "none" restores the RELEASE destination from the removed routing instead of leaving the B-event with no destination |
| Inspector honesty | A no-ASSIGN activity (COSEIZE etc.) hides the Server-type dropdown (previously rendered empty and interacted as a silent no-op) and shows a read-only note pointing at the C-Events editor; a skill-gated ASSIGN now displays its server correctly. The underlying serverType patch is guarded at the operations layer too |
| Docs | help-reference.md: stale badge claim fixed (`conditional` was never emitted; the real badges are `feed` and `when`) + a new "Advanced effects and the canvas" note; User Guide §4.2 sentence on the refusal behaviour |

New tests: 18 macroParser unit tests, 12 graph-operations tests (four of the six lossy paths previously had zero coverage), 2 inspector tests, 1 panel auto-link-refusal test.

Verified: lint/typecheck clean per commit; visual-designer + editors + model suites green throughout (260+ tests); full suite before push.

---

## 13. Status — b7be68c user-testing batch implemented (2026-08-27, same branch): animation visible, box-drag deselect, alignment guides appear, header ••• sized

Four defects from the user testing deployed build `b7be68c`, shipped as four commits:

| Item | Root causes → fix |
|---|---|
| Entity animation showed nothing ("i am still not seeing any animation") | Three stacked bugs: (1) the engine snapshots once per A→B→C cycle *after* Phase C, so a routed entity is usually re-claimed in the same cycle and consecutive snapshots read serving→serving — no `detectRoutingEvents` case matched, losing every arrival and routing hop on non-saturated models. New case diffs `lastQueue`/`serviceStart` between two active snapshots and spawns both the routing-edge and seize-edge tokens (arrivals seized in their arrival cycle likewise). (2) SMIL `begin="0s"` is relative to the SVG *document* timeline, so late-inserted dots rendered already-finished; each dot now begins `indefinite` and calls `beginElement()` on mount (skipped under reduced motion). (3) The persisting animation-toggle handler was dead code, so a stored "off" could never be cleared — rewired. Plus one docs lie: the User Guide claimed ⚡ Batch Run animates; it cannot by construction (no per-step snapshots) — §4.4, help-reference, and the button tooltip now say Step/Auto Run animate, Batch Run doesn't |
| Box-drag selections couldn't be deselected | React Flow's default `selectionKeyCode='Shift'` turned Shift+click on a node into a zero-pixel rubber-band that wiped the selection before `onNodeClick`'s toggle ran (`selectionKeyCode={null}` now); and the post-box-drag nodes-selection overlay rect swallowed clicks in the gaps between selected nodes (a `SelectionRectSuppressor` flips `nodesSelectionActive` back off — the selection model is fully controlled and never needs it). `? Keys` panel and User Guide now document Shift/Ctrl-click toggling |
| Alignment guides never appeared | Nodes are fully controlled and `onNodesChange` discarded position changes — the dragged node never moved until drop, so guides drew next to a phantom position; and `snapToGrid={[24,24]}` steps could essentially never land inside the 6-screen-px guide window. Mid-drag positions are now echoed into the controlled nodes via a `dragPositions` override (cleared on drop; graph still written only on drop), and the grid props are gone — free placement, alignment snap-on-release as the only snap (deliberate change, docs updated). Dead `onNodeMove` fallback and `moveNode` deleted |
| Header ••• button oversized | `HeaderAccountMenu` trigger was hard-coded 40×40 radius-8 beside ~28px siblings; restyled to the settings gear's `navBtnStyle` recipe (height 28, padding 5/10, radius 5) |

New tests: 4 same-cycle re-seize cases in `execute-canvas-routing-events.test.js` (12 total), `animated-edge.test.jsx` (4 — beginElement per mount, indefinite begin, reduced-motion skip, empty render), an animation-toggle persistence case, and 11 additions to `flow-diagram-react-flow.test.jsx` (selection parity + live-drag positions + snap assertions; the suite's ReactFlow mock now captures rendered props and stubs the store API). Noted follow-up, not attempted: streaming snapshots so single-run Batch Run could animate; prune-cycle sink-token loss on 500-cycle boundaries.

---

## 14. Status — Run-tab ad-hoc parameter adjustment implemented (2026-08-27, same branch): the Business view's "change a value and run" pattern, now for modellers

Direct follow-on to §10's Stakeholder View: "we have made it easier for business users to change parameters and run a model without creating an experiment or scenario — let's allow the same capability on the run canvas." Before this, the *only* way a modeller could vary a parameter for a run was to save a named Experiment (Name required, immediate `saveExperiment()` DB write) or a named Scenario (same shape, immediate `createScenario()` insert) and then load it back — there was no path from "type a new value" to "run" without persisting something first, unlike the viewer-only Stakeholder View (`exposedParams` → `applySweepValues` → `runReplications`, nothing saved).

| Piece | Notes |
|---|---|
| **🎛 Adjust parameters** popover (`ExecutePanel`, `src/ui/execute/index.jsx`) | Next to the run settings summary on the Run tab. Opens the same searchable `ParamBrowserPanel` used everywhere else, over the *full* `enumerateSweepableParams()` universe (not an owner-curated subset — this is the modeller's own model). Add/edit/remove ad-hoc `{path, value}` overrides; the trigger button doubles as a live count badge ("🎛 2 params"). **Reset all** clears everything; **Save as Experiment…** seeds the existing New-Experiment form with the current overrides and run settings, landing on the Experiments tab — saving stays available, it's just no longer required |
| `effectiveModel` merge (same file) | The ad-hoc overrides resolve against `sweepParams` and merge with any loaded-experiment overrides (`activeExpOverrides`) — an ad-hoc edit for the same path wins. This feeds the *same* `effectiveModel` that Reset/Step/Auto Run/Batch Run already consumed for a loaded Experiment, so no new run-path code was needed; every run mode honours ad-hoc changes identically, exactly like it already did for saved Experiments |
| Model-switch hygiene (incidental fix) | Neither ad-hoc nor loaded-experiment overrides were previously cleared when `modelId` changed — a latent gap (masked by `applySweepValues` silently skipping unresolvable `targetId`s) that could leave a stale override from model A silently absent-but-not-obviously-so on model B. A new effect clears both on model switch |
| De-duplication | The "PARAMETER OVERRIDES" chip-list-plus-picker JSX existed identically in the New and Edit Experiment forms (~20 lines each). Extracted to `OverrideChipList`, now also the Adjust-parameters panel's editor — three call sites instead of two duplicates plus one near-miss |
| Docs | User Guide §4.4 and help-reference's Experiment Controls section both describe the button, that changes are ad-hoc/never persisted, that they reset on model switch, and the priority rule when an Experiment is also loaded |

New tests (`tests/ui/execute/quick-parameter-adjust.test.jsx`, 5): the trigger renders with no saved Experiment/Scenario in sight; picking a parameter and changing its value patches the model actually handed to `runReplications` (without mutating the model prop) and the base model prop is never mutated; **Reset all** clears the badge; overrides are dropped on a `modelId` change; **Save as Experiment…** pre-fills the New Experiment form with Name left blank. Existing `OverrideChipList` call sites (New/Edit Experiment forms) covered by the full `tests/ui/execute/` run (24 files, 184 tests, all green) since no dedicated coverage existed for that JSX before extraction.

Verified: lint/typecheck/build clean; full `tests/ui/execute/` + `param-browser-panel.test.jsx` green (24/24 files); full suite before push.

---

## 15. Status — B-/C-Event display terminology renamed (2026-08-27, same branch): "Bound Events" / "Conditional Events"

Closing a long-running language-complexity debate: the "B-Events"/"C-Events" jargon is now displayed as the three-phase method's actual full names — **Bound Events** and **Conditional Events** — with the classic abbreviations kept as a one-line gloss. User-scoped deliberately narrow: display text only. The data model (`bEvents`/`cEvents` in model_json, `bEventId` refs, exports, engine, macros, component names) is untouched — zero schema risk.

| Piece | Notes |
|---|---|
| UI | Define sub-tab labels (the `TABS` map, which also feeds Model Health issue-row prefixes via `tabLabel()`), the two editor page headings + subtitles (each subtitle now nods to "the 'B'/'C' in classic three-phase DES"), the "+ Add" buttons on those pages, and the Model Health count tiles. Deeper surfaces (tooltips, canvas guard messages, Execute Bottom Panel — which already reads "B-EVENTS (BOUND)" — AI prompt labels, HelpAssistant questions) deliberately keep the B-/C- shorthand for now; the new subtitles anchor the abbreviation |
| Docs | Living UI-describing docs renamed with a gloss at the natural anchor points (User Guide phase table keeps its "B —"/"C —" prefixes; glossary rows say "Also called a 'B-Event'…"; help-reference headings read "Bound Events (B-Events)"): User Guide, help-reference, Product Spec, quick-start, Template Models Guide, RealTime Integration Guide, simpy-export, engine-architecture-and-validation, patterns/*. Untouched by design: all dated/historical docs (ADRs, reviews/, analysis/, archived/, sprint guides), schema/interface docs (`engine-api-reference`, `Engineering_Spec`, `addition1_entity_model`, Build Plan changelog), and `model-schema-for-llm.md` (LLM grounding for the *unchanged* schema, incl. literal CSV header tokens) |
| Tests | 4 matcher updates (`model-health.test.jsx` tab-button regexes, `c-event-editor.test.jsx` Add-button) — no loosened matchers, no new tests needed |

---

*Companion documents: `expert-review-2026-08-ux.md`, `expert-review-2026-08-functionality.md`, `expert-review-2026-08-code.md`. Prior art: `docs/ui-ux-review.md` (2026-05-16), `docs/reviews/ui-improvement-programme.md`.*
