# Expert Code Review — simmodlr ("flow") — August 2026

**Reviewer:** Principal-engineer level external review
**Date:** 2026-08-24
**Scope:** Full codebase — `src/` (~72,300 LOC JS/JSX/TS), `supabase/` (migrations + 5 edge functions), CI workflows, dependency manifest, repository hygiene. 203 test files across `tests/` and `src/**/__tests__/`.
**Method:** Every finding below was verified by direct reading of source at the cited `file:line` before publication. Candidate findings that could not be confirmed were corrected or dropped (notably: an RLS-coverage claim was refuted on inspection — see C-9 — and the QR `innerHTML` sink was verified injection-safe — see Strengths).
**Note on test execution:** Per review protocol, this document does not re-run the test/benchmark suites; suite results are recorded separately in the remediation register.

---

## Executive Summary

This is a substantially healthier codebase than its size and sprint velocity would suggest. The engine layer is genuinely strong: a pure-JS DES core with a seeded Mulberry32 PRNG, a CI grep-gate that hard-fails on any `Math.random` in `src/engine/`, determinism parity and trace snapshot tests, analytical M/M/1 and M/M/c correctness benchmarks, and a safe recursive-descent expression evaluator that (verified) never calls `eval` or `new Function`. The data layer throws consistently to callers, LLM keys live server-side behind a rate-limited edge proxy, and runtime `console.log` usage is effectively zero.

The single most serious problem is not in the code — it is that **the CI pipeline never runs the tests**. The job named "Vitest test suite" performs checkout, Node setup, and `npm ci`, then ends (`.github/workflows/ci.yml:10-24`). The `benchmarks` and `build` jobs gate on it via `needs: test`, but the gate proves nothing. 203 test files, including the determinism suite the project rightly prides itself on, are enforced only by developer discipline. `npm run typecheck` is likewise never run in CI — and would cover only the 3 files in `src/contracts/` anyway (`tsconfig.json:21` with `checkJs: false`).

The second tier of risk is dependency and provisioning hygiene: `xlsx@0.18.5` (the last public-npm SheetJS release, with known prototype-pollution and ReDoS advisories) sits on four user-upload parse paths; the migration history starts mid-life at `20260505073000` so a fresh environment cannot be provisioned from `supabase/migrations/` alone; and `supabase/.temp/` (project ref + pooler URL) is committed.

The third tier is structural: `src/ui/execute/index.jsx` (3,394 lines, ~100 `useState`, 15 `useEffect`) and `src/ui/ModelDetail.jsx` (2,013 lines, ~53 `useState`) are god components with a measurably different character from the healthy large files (e.g. `ResultsWorkspace.jsx`: 2,290 lines but 10 state hooks and 0 effects). ~40 silent `catch`-and-discard sites include at least one save-failure swallow on a user-data path (`ModelDetail.jsx:1133`).

Nothing here is architecturally rotten. The remediation list is dominated by one-day fixes with outsized payoff — chief among them a three-line CI change.

---

## Findings by Area

### Area 1 — CI & Tooling (highest-severity area)

### C-1 — CI "test" job runs no tests; typecheck never runs in CI

- **Severity:** Critical
- **Evidence:** `.github/workflows/ci.yml:10-24` — the job `test` ("Vitest test suite") contains exactly three steps: `actions/checkout@v4`, `actions/setup-node@v4`, and `npm ci`. There is no `npm test` (or `npx vitest run`) step. `benchmarks` (line 29) and `build` (line 52) both declare `needs: test`, gating on a job that only proves the lockfile installs. `npm run typecheck` (`package.json:12`) appears in no workflow. The repository contains 203 test files (174 under `tests/`, the rest in `src/**/__tests__/`).
- **Impact:** Any regression — engine determinism, schema round-trip contract (the CLAUDE.md "Schema Contract" is enforced only by Vitest assertions in `tests/db/`), UI behaviour — merges green. The extensive test investment currently buys zero merge-time protection. The job name actively misleads: a reader of a green check reasonably believes the suite passed.
- **Remediation:** Add `- run: npm test` (and `- run: npm run typecheck`) to the `test` job after `npm ci`. Consider renaming the job honestly until then. Optionally split typecheck into its own job for signal clarity.
- **Effort:** S (minutes; the fix is three lines)

### C-2 — Typecheck covers ~3 files out of the codebase

- **Severity:** Medium
- **Evidence:** `tsconfig.json:21` — `"include": ["src/**/*.ts", "src/**/*.tsx"]` matches exactly three files (`src/contracts/model.ts`, `run.ts`, `user-settings.ts`); `tsconfig.json:7` — `"checkJs": false`. The remaining ~72k LOC of `.js`/`.jsx` is unchecked.
- **Impact:** `npm run typecheck` gives a false sense of coverage (~0.5% of source). The contracts directory is a good seed, but nothing verifies that JS call sites actually conform to those contracts.
- **Remediation:** Incremental: enable `checkJs: true` with `// @ts-check` opt-in per file, starting with `src/db/` and `src/engine/` (both already have disciplined JSDoc). Do not attempt a big-bang conversion. Wire the result into CI (see C-1).
- **Effort:** M (incremental, per-directory)

### C-3 — No linter, formatter, editorconfig, or pre-commit hooks

- **Severity:** Medium
- **Evidence:** No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `.editorconfig`, or `.husky/` anywhere in the repository; `package.json:6-16` has no `lint` script.
- **Impact:** Style consistency currently depends entirely on agent/author discipline. More materially, an ESLint pass with `no-empty` and `react-hooks/exhaustive-deps` would have mechanically caught the silent-catch population (C-13) and hook-dependency risks in the god components (C-11). For a codebase largely written by coding agents, a lint gate is the cheapest available "second reviewer".
- **Remediation:** Add ESLint (flat config) with `eslint-plugin-react-hooks` and `no-empty: ["error", { "allowEmptyCatch": false }]`, Prettier or ESLint stylistic, an `.editorconfig`, and a CI lint job. Baseline existing violations with targeted disables rather than blanket ignores.
- **Effort:** M

### C-4 — `package.json` version is not valid semver and leaks verbatim into the UI

- **Severity:** Low
- **Evidence:** `package.json:4` — `"version": "0.9.0 - Beta"`. `vite.config.js:23-25` injects `process.env.npm_package_version` verbatim as `VITE_APP_VERSION`, which surfaces in the About modal and FeedbackModal.
- **Impact:** Any tooling that parses semver (npm itself is lenient here only because the package is `private`, release tooling, `npm version`, dependency scanners) will choke or misbehave; the UI shows a malformed version string.
- **Remediation:** Use `"0.9.0"` and express pre-release status the semver way (`0.9.0-beta`) or as a separate display label.
- **Effort:** S

---

### Area 2 — Dependencies & Security

### C-5 — `xlsx@0.18.5` with known advisories on user-upload parse paths

- **Severity:** High
- **Evidence:** `package.json:25` — `"xlsx": "^0.18.5"`; `package-lock.json` resolves 0.18.5 from public npm. 0.18.5 is the final public-npm SheetJS release and is affected by the published prototype-pollution (CVE-2023-30533, fixed in 0.19.3) and ReDoS (CVE-2024-22363, fixed in 0.20.2) advisories — neither fix is obtainable from the npm registry. The library parses user-supplied files in `src/ui/shared/xlsxParser.js:20` (`XLSX.read(new Uint8Array(buffer), …)` on an uploaded ArrayBuffer), `src/ui/execute/executeHelpers.js`, `src/ui/results/ResultsWorkspace.jsx`, and `src/ui/ModelHistoryTab.jsx`.
- **Impact:** A crafted spreadsheet uploaded by a user (or shared to a user) can pollute `Object.prototype` in the client session or lock the tab via catastrophic regex backtracking. In a client-side SPA this is bounded to the victim's session, but prototype pollution is a classic gadget-chain enabler and the app renders shared, cross-user content.
- **Remediation:** Either (a) switch the dependency to the SheetJS CDN distribution (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`) at ≥0.20.2, or (b) migrate to an actively-published alternative (e.g. `exceljs` for the export paths; keep a minimal hardened reader for import). Pin exactly, and add the parse entry points to any future dependency-audit gate.
- **Effort:** M

### C-6 — `fallow` devDependency: legitimate, but undocumented and behind

- **Severity:** Low (verified NOT a typosquat)
- **Evidence:** `package.json:32` — `"fallow": "^2.85.0"`. No imports anywhere in source — correct, because it is a static-analysis CLI, not a library: `docs/reviews/sprint-81-deduplication-plan.md:15,154,158` drives an entire sprint off `npx fallow dupes` / `fallow health` output (460 clone groups, 11.7% duplication). npm metadata confirms it is "Codebase intelligence for TypeScript and JavaScript" (current 3.17.0).
- **Impact:** None malicious. Two lesser issues: it is a major version behind (2.85 vs 3.x), so sprint plans citing its scores may not reproduce; and its purpose is invisible to anyone reading `package.json` — the initial review pass itself flagged it as possible typosquat risk, which is the symptom.
- **Remediation:** Add a one-line comment/README note (or a `fallow`-invoking npm script such as `"dupes": "fallow dupes"`) so its role is self-evident; evaluate the 3.x upgrade before the next duplication sprint.
- **Effort:** S

### C-7 — `docx` in production dependencies but only used by a build script

- **Severity:** Low
- **Evidence:** `package.json:21` — `"docx": "^9.6.1"` under `dependencies`; the only import site in the repository is `scripts/generate-docs.cjs`. (Report generation in `src/reports/` does not import it.)
- **Impact:** Misclassification only — Vite tree-shakes it out of the bundle, but dependency audits and installers treat it as production surface.
- **Remediation:** Move to `devDependencies`.
- **Effort:** S

### C-8 — `supabase/.temp/` committed, exposing project ref and pooler URL

- **Severity:** Medium
- **Evidence:** `git ls-files supabase/.temp/` returns 9 files, including `supabase/.temp/project-ref` (contents: `znkknldzdfajcrpabtmg`) and `supabase/.temp/pooler-url` (`postgresql://postgres.znkknldzdfajcrpabtmg@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`). `.gitignore` is 6 lines (`node_modules/`, `dist/`, `.env.local`, `.env`, `.aider*`, `.claude/worktrees/`) and does not cover it.
- **Impact:** No credential is exposed (the pooler URL has no password), but the project ref plus a direct database endpoint is exactly the reconnaissance a targeted attack wants, and `.temp` is Supabase CLI machine-local state that has no business in history. If this repo is ever made public the exposure is permanent.
- **Remediation:** `git rm -r --cached supabase/.temp/`; add `supabase/.temp/` to `.gitignore` (bundle with the C-14 hygiene sweep). If the repo may go public, treat the project ref as burned for threat-modelling purposes.
- **Effort:** S

### C-9 — No baseline migration: fresh environments cannot be provisioned; (RLS coverage itself is fine)

- **Severity:** High
- **Evidence:** `supabase/migrations/` begins at `20260505073000_platform_roles_user_settings.sql`, which already `ALTER`s pre-existing tables. No migration anywhere contains `CREATE TABLE` for the three core tables `des_models`, `simulation_runs`, or `profiles` — every `CREATE TABLE` in the directory is for later satellite tables (`feedback`, `experiments`, `share_links`, `sweeps`, `user_settings`, `platform_config`, `model_versions`, `model_schedules`, `admin_audit_log`). A stray non-timestamped file `PR-001_run_record_integrity.sql` also sits in the migrations directory outside CLI naming convention.
- **Correction to the candidate claim:** the suggestion that `experiments`, `admin_audit_log`, `sweeps`, and `user_settings` lack RLS is **false** — all four enable it (`20260514000000_create_experiments.sql:30`, `20260515000000_sprint38_user_management.sql:25`, `20260510090000_share_links_sweeps.sql:55`, `20260505073000_platform_roles_user_settings.sql:44`); `platform_config` gets RLS one migration late but gets it (`20260523000000_platform_config_rls.sql:5`). Both `SECURITY DEFINER` functions were reviewed: `increment_share_view` (`20260602000001:25`) and `notify_feedback_insert` (`20260524053043:23`) both pin `search_path` and are narrowly scoped — acceptable. One caveat: the feedback trigger reads the **service-role key from a database-level GUC** (`app.settings.service_role_key`, `20260524053043_feedback_notify_trigger.sql:11,33`); database-scope settings are readable by `current_setting()` from any SQL execution context in that database, so any future `SECURITY DEFINER`/RPC that evaluates caller-influenced SQL becomes a key-disclosure gadget. Prefer Vault or a `pg_net`-reachable function secret.
- **Impact:** Disaster recovery, local `supabase db reset`, preview branches, and any second environment are impossible from the repo alone; the schema's source of truth is the live project, unversioned. The missing baseline also means the RLS policies on `des_models`/`simulation_runs`/`profiles` — the tables that matter most — are not in version control at all.
- **Remediation:** Run `supabase db dump` against the linked project to generate a `00000000000000_baseline.sql` (schema + policies + functions), verify `db reset` builds a working stack, and fold `PR-001_run_record_integrity.sql` into a properly timestamped migration. Migrate the service-role-key GUC to Supabase Vault.
- **Effort:** M

### C-10 — ID generation via `Math.random` (fallback paths only — softer than reported)

- **Severity:** Low
- **Evidence:** `src/db/local.js:20` — `"local_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)` for local run IDs. `src/db/models.js:619-621` — share-link tokens correctly prefer `globalThis.crypto.randomUUID()` and fall back to `share-${Date.now()}-${Math.random()…}` only when `crypto.randomUUID` is absent.
- **Impact:** The security-sensitive path (share tokens) is already crypto-random in every browser this app supports (`crypto.randomUUID` has been universal since 2021); the fallback is effectively dead code but, if ever hit, produces a guessable ~31-bit token protecting a publicly readable share row. `local.js` IDs are collision-relevant only within one browser profile — low risk, but `Date.now()` + 6 base-36 chars can collide under loops.
- **Remediation:** Delete the `models.js` fallback (throw instead — a guessable token is worse than a failed share) and use `crypto.randomUUID()` in `local.js`.
- **Effort:** S

---

### Area 3 — Architecture & Structure

### C-11 — God components: `execute/index.jsx` and `ModelDetail.jsx`

- **Severity:** High
- **Evidence:** `src/ui/execute/index.jsx` — 3,394 lines, ~100 `useState` calls, 15 `useEffect`, in one component tree (the header comment "slimmed, imports from sibling modules" shows extraction has begun — helpers, `SweepViews`, `BottomPanel` etc. are already siblings — but the state itself remains monolithic). `src/ui/ModelDetail.jsx` — 2,013 lines, ~53 `useState`, 13 `useEffect`. Contrast the healthy pattern already in the codebase: `src/ui/results/ResultsWorkspace.jsx` is 2,290 lines but holds 10 state hooks and 0 effects — long but flat and derivable.
- **Impact:** Every feature touching execution (sweeps, experiments, share links, AI narrative, animation, admission control — all visible in the import block at `index.jsx:1-40`) contends on one re-render domain and one merge-conflict hotspot. 100 co-located `useState` calls make invariants between them unenforceable; the silent-catch and effect-dependency risks elsewhere in this review concentrate in exactly these two files.
- **Remediation:** Do not rewrite. Extract by state cluster, one per PR, behind the existing prop seams: (1) share-link/QR state + UI (already isolated around `index.jsx:1633`), (2) experiment CRUD state, (3) run-history/persistence state, (4) animation/speed state into a reducer. For `ModelDetail.jsx`, the undo stack and tab-shell are the natural first extractions. Adopt `useReducer` for clusters with cross-field invariants.
- **Effort:** L (but decomposable into S/M slices)

### C-12 — AGENTS.md §3 layering-rule violations: `supabase.auth.*` in UI; hardcoded colours outside tokens

- **Severity:** Medium
- **Evidence:** Direct `supabase.auth.*` calls outside `src/db/`: `src/ui/AuthShell.jsx:23,26,39,50`, `src/ui/AdminPanel.jsx:338`, `src/ui/execute/DiagnosticsTab.jsx:17`, plus (beyond the candidate list) `src/App.jsx:161,175,179,288` and `src/llm/apiClient.js:46,172,288,339` — 15 sites total. All are auth-session calls, not data access, so the letter of "all Supabase access goes through src/db" is arguably about data — but the rule as written is being violated 15 times, which trains agents to ignore it. Hardcoded colours outside `src/ui/shared/tokens.js`/`ThemeContext.jsx`: 19 six-digit hex literals (e.g. a full private 8-colour palette at `src/ui/editors/SectionEditor.jsx:8-9`, 7 in `src/ui/ModelLibrary.jsx`, `src/ui/visual-designer/graph.js:478,532`, `FlowDiagramReactFlow.jsx:230,355`) plus shorthand (`SweepViews.jsx:184,452,460`) and 28 raw `rgba()` calls.
- **Impact:** Rule/reality drift is the real cost (see C-15): an agent reading AGENTS.md cannot tell which rules are load-bearing. The SectionEditor palette is a genuine theming bug in waiting — it will not respond to theme changes.
- **Remediation:** Create `src/db/auth.js` wrapping the session/sign-in/out surface (a mechanical 15-site refactor), and amend AGENTS.md §3 to say what is actually intended. Move the SectionEditor palette into `tokens.js`; sweep the remaining literals opportunistically or via a lint rule (C-3).
- **Effort:** M

### C-13 — ~40 silent catch sites, including a swallowed model-save failure

- **Severity:** High (for the save path); Medium for the population
- **Evidence:** 21 exact `catch {}` occurrences and ~40 total silent-discard patterns (`catch {}`, `catch (_) {}`, `.catch(() => {})`) in `src/`. The worst confirmed: `src/ui/ModelDetail.jsx:1133` — `onModelInit={async (nextModel) => { setModel(nextModel); try { await overrides.onSave?.(nextModel); } catch {} }}` swallows a **failed model save** after visual-designer initialisation: local state advances, persistence silently fails, the user believes the model is saved. Similar user-facing swallows: `src/ui/ModelHistoryTab.jsx:660` (share-link creation fails → menu just closes, no link, no message), `src/ui/ModelDetail.jsx:872` and `:1696` (schedule fetch for reports → report silently generated without schedule data), `src/ui/shared/ExportPopover.jsx:348` (model snapshot fetch → export silently uses stale model), `src/ui/execute/index.jsx:1257` (settings persistence). Benign members of the population, for calibration: `src/ui/results/ResultsWorkspace.jsx:1620` (localStorage JSON parse with default) and `src/ui/ImportPreview.jsx:41` (clipboard write) are fine. Meanwhile the db layer throws consistently (78 `throw` sites in `src/db/models.js` alone) and a toast system exists (`src/ui/shared/ToastContext.jsx`, ~39 usage references) — the plumbing for correct behaviour is already built; these sites just decline to use it.
- **Impact:** Silent data loss (the save path), silently wrong exports/reports, and undiagnosable "nothing happened" support tickets.
- **Remediation:** Triage all ~40 sites into (a) must-surface — toast + `console.error`, starting with `ModelDetail.jsx:1133` and `ModelHistoryTab.jsx:660`; (b) degrade-with-log; (c) legitimately-silent — annotate with a comment so `no-empty` lint (C-3) can be satisfied explicitly.
- **Effort:** M

### C-14 — Repository hygiene: junk files tracked, 6-line .gitignore

- **Severity:** Low
- **Evidence:** Git-tracked (most introduced in commit `b500c78`): `null` (0 bytes), `tmp-probe.txt`, `tmp-probe-exit.txt`, `tmp-vitest-full.err`, `tmp-vitest-full.out`, `analaysis.py` (typo-named, superseded), `indexx.html`, plus three competing landing pages (`simmodlr-landing.html`, `simmodlr-landing-live-updated.html` — a second design system living alongside the app), `AGENTS.md.bak`, `CLAUDE.md.bak`, 6 files under `.codex-temp/`, and `supabase/.temp/` (C-8). `.gitignore` is 6 lines.
- **Impact:** Noise for humans and — worse here — for agents: `analaysis.py` and stale `.bak` contracts are exactly the files a code agent will read and act on. The stray `null` file breaks some tooling on case-insensitive/Windows checkouts.
- **Remediation:** One sweep commit: delete the junk, keep one canonical landing page (move to `docs/` or its own directory), and extend `.gitignore` with `*.bak`, `tmp-*`, `null`, `.codex-temp/`, `supabase/.temp/`.
- **Effort:** S

### C-15 — AGENTS.md (the agent contract) is stale in ways that misdirect agents

- **Severity:** Medium
- **Evidence:** `AGENTS.md:3` claims "Reflects: Sprint 84 complete" (last updated 2026-06-09; the repo is now at Sprint 88+). Concrete drift: `AGENTS.md:62,157,256` assert "All **19** macros" as an invariant to preserve — `src/engine/macros.js` actually implements **24** (`ARRIVE … SET_ATTR COST`, verified by counting `name:` entries in the `MACROS` array at `macros.js:295`). `AGENTS.md:332` documents the Back-button discard defect as open. This is a code-level risk, not a docs nit, because this file is the operative instruction set for the coding agents that produce most changes: an agent told "there are 19 macros — preserve entirely" will mis-scope any macro-touching task.
- **Impact:** Agents act on false invariants; the functionality review's register covers the full drift list — this finding intentionally does not duplicate it (see `docs/reviews/` register).
- **Remediation:** Replace hardcoded counts with "see `MACROS` in `src/engine/macros.js`"-style pointers (counts in prose always rot); add a sprint-close checklist item to re-verify AGENTS.md §5; fix the sprint-status header.
- **Effort:** S (for the counted-facts fix) / M (full refresh, tracked in the functionality register)

### C-16 — Dependency currency and missing engine constraints

- **Severity:** Medium
- **Evidence:** `package.json:37` — `vitest ^1.6.0` (current major is 3.x; two majors behind, and pre-1.6.1-security-fix line); paired with `jsdom ^28.1.0` and `@testing-library/react ^16.3.2`, both from the current era — a skew that works today but pins the test stack to an EOL runner. No `engines` or `packageManager` field despite CI pinning Node 20 (`ci.yml:20`) while this review environment runs Node 22 — nothing stops a contributor on Node 18 or 25.
- **Impact:** Vitest 1.x no longer receives fixes; the eventual forced upgrade grows more expensive per sprint. Unpinned engines invite "works on my machine" drift, which is amplified when agents run the suite in heterogeneous sandboxes.
- **Remediation:** Upgrade vitest to 3.x (mostly config-compatible from 1.x; budget for `mockReset` semantics and snapshot format churn across 203 files), and add `"engines": { "node": ">=20 <23" }` plus a `packageManager` pin.
- **Effort:** M

### C-17 — Edge-function deploy workflow covers only 1 of 5 functions

- **Severity:** Medium (original finding)
- **Evidence:** `.github/workflows/deploy-functions.yml:22` deploys only `llm-proxy`. `supabase/functions/` contains five functions (`import-model`, `llm-proxy`, `notify-feedback`, `notify-new-signup`, `results-api`); the other four have no CI deploy path, so their deployed versions drift from the repo silently. Related, same file family: the llm-proxy rate limiter (`llm-proxy/index.ts:29-38`) is an in-memory `Map` keyed on the raw `Authorization` header (`index.ts:25-27`) — per-isolate, so it resets on every cold start and multiplies across concurrent isolates, and the key rotates with the JWT (~hourly). It is a useful soft brake, not an enforcement boundary; per-user config via `rateLimitPerHour` (`index.ts:531`) is good design on top of a weak substrate.
- **Impact:** A reviewed fix to `results-api` or `import-model` (both of which handle auth and service-role keys — `results-api/index.ts:21`, `import-model/index.ts:338-352`) can sit undeployed indefinitely; conversely the deployed code may predate the reviewed source. Rate limiting can be substantially exceeded under isolate churn.
- **Remediation:** Extend the workflow to deploy all functions (a matrix or `supabase functions deploy` without a name); if hard limits matter, back the limiter with a Postgres counter or Upstash-style store keyed on verified user ID.
- **Effort:** S (workflow) / M (durable rate limiting)

### C-18 — 17 TODOs concentrated in `simpy-export.js`

- **Severity:** Low
- **Evidence:** 18 `TODO` markers in `src/`, 17 of them in `src/engine/simpy-export.js` — the SimPy code-generation feature ships with its known gaps annotated inline but not surfaced to users.
- **Impact:** Users exporting models that use the unimplemented constructs get Python that silently diverges from the JS engine's semantics — a determinism-adjacent trust issue for a feature whose whole point is fidelity.
- **Remediation:** Convert each TODO into either an explicit `# NOT SUPPORTED: <construct>` comment emitted into the generated Python plus a UI warning, or a tracked issue. Do not leave the gap knowledge only in source comments.
- **Effort:** S/M

---

## Strengths (verified, credit where due)

1. **No dynamic code execution — verified.** `grep` for `eval(`/`new Function` across `src/` finds zero call sites; the only hits are the comments asserting the guarantee (`src/engine/macros.js:51,131`, `src/engine/conditions.js:244`) above a genuine recursive-descent parser. The AGENTS.md prohibition is real, not aspirational.
2. **Determinism engineering.** Seeded Mulberry32 PRNG (`src/engine/distributions.js:13`) with `sample()` refusing to run unseeded (`distributions.js:305`); determinism parity + trace snapshot tests (`tests/engine/determinism-parity.test.js`, `trace-determinism.test.js`, committed snapshots); analytical M/M/1 and M/M/c benchmarks with ±5% gates; and a CI grep-gate that fails the build on any `Math.random` in `src/engine/` (`.github/workflows/benchmark-gate.yml:28-39`). This is a model discipline for a DES engine — it just needs the main suite gate (C-1) to match.
3. **Server-side LLM key handling.** No provider keys in the client; `supabase/functions/llm-proxy/index.ts` proxies with per-user config, per-hour rate limiting (see C-17 caveat), and a unit-testable pure mapper separated from network calls.
4. **Consistent throw-to-caller db layer.** `src/db/models.js` (78 throw sites) uniformly surfaces Supabase errors and normalises rows; the failure-handling gap is in a minority of UI call sites (C-13), not the layer design.
5. **RLS coverage is real.** Every table created in `supabase/migrations/` enables RLS (verified per file — the candidate claim to the contrary was wrong), and both `SECURITY DEFINER` functions pin `search_path`.
6. **The QR `innerHTML` sink is injection-safe — verified.** `src/ui/execute/index.jsx:1633` assigns `qrSvg(...)` into `innerHTML`, but `src/ui/share/qr.js:352-367` never interpolates the input text into markup: the string is encoded to a module matrix and rendered purely as numeric `<rect>` coordinates. No escaping needed; no XSS.
7. **Clean console.** Exactly one `console.log` in `src/` — and it is inside a JSDoc example (`src/engine/public-api.js:16`); runtime logging goes through `console.warn`/`error` (22 sites).
8. **Share tokens are crypto-random** on the primary path (`src/db/models.js:619`), and `.env.example` documents required environment.

---

## Remediation Required vs Improvement Recommendations

### Remediation required (correctness, security, provisioning)

| # | Finding | Severity | Effort | One-line action |
|---|---------|----------|--------|-----------------|
| C-1 | CI never runs tests or typecheck | Critical | S | Add `npm test` + `npm run typecheck` steps to the `test` job |
| C-5 | Vulnerable `xlsx@0.18.5` on upload paths | High | M | Move to SheetJS CDN ≥0.20.2 or migrate library |
| C-9 | No baseline migration; core-table schema unversioned; service key in DB GUC | High | M | `supabase db dump` baseline; Vault for the key; fold in `PR-001` file |
| C-13 | Silent catch on save/share paths (`ModelDetail.jsx:1133` first) | High | M | Surface via existing toast system; annotate legitimate silences |
| C-8 | `supabase/.temp/` committed (project ref, pooler URL) | Medium | S | `git rm --cached`, gitignore |
| C-17 | 4 of 5 edge functions have no CI deploy path | Medium | S | Deploy all functions in workflow |
| C-15 | AGENTS.md false invariants (19 vs 24 macros) misdirect agents | Medium | S | Replace counts with source pointers; refresh header |
| C-4 | Non-semver version string surfaces in UI | Low | S | `"0.9.0"` (+ display label) |
| C-10 | `Math.random` ID fallbacks | Low | S | `crypto.randomUUID()`; delete guessable share-token fallback |

### Improvement recommendations (structure, tooling, hygiene)

| # | Finding | Severity | Effort | One-line action |
|---|---------|----------|--------|-----------------|
| C-11 | God components (`execute/index.jsx` 3,394 ln/~100 state; `ModelDetail.jsx`) | High | L | Extract by state cluster, one PR each; reducers for invariant groups |
| C-3 | No lint/format/pre-commit tooling | Medium | M | ESLint (react-hooks, no-empty) + Prettier + CI job |
| C-2 | Typecheck covers ~3 files | Medium | M | `checkJs` + `@ts-check` opt-in, start with `src/db`, `src/engine` |
| C-12 | Layering violations: 15 UI `supabase.auth.*` sites; colours outside tokens | Medium | M | `src/db/auth.js` wrapper; fold SectionEditor palette into tokens.js |
| C-16 | vitest 1.x EOL; no engines/packageManager pin | Medium | M | Upgrade to vitest 3.x; pin Node range |
| C-14 | Tracked junk files; 6-line .gitignore | Low | S | Sweep commit + gitignore extension |
| C-6 | `fallow` purpose undocumented; a major behind | Low | S | Add npm script/note; evaluate 3.x |
| C-7 | `docx` misfiled in dependencies | Low | S | Move to devDependencies |
| C-18 | 17 TODOs in simpy-export = silent fidelity gaps | Low | S/M | Emit NOT-SUPPORTED warnings into generated Python + UI |

---

*Suite/benchmark execution results for the remediation baseline are recorded in the remediation register (separate process); this document intentionally records only statically verified findings.*
