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

*Companion documents: `expert-review-2026-08-ux.md`, `expert-review-2026-08-functionality.md`, `expert-review-2026-08-code.md`. Prior art: `docs/ui-ux-review.md` (2026-05-16), `docs/reviews/ui-improvement-programme.md`.*
