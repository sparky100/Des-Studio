# DES Studio — Full Codebase Audit

**Date:** 2026-04-30  
**Scope:** All 15 source files across `src/engine/`, `src/ui/`, `src/db/`  
**Branch audited:** `claude/audit-part-1-orientation-lhK9K`

---

## 1. Overall Summary

DES Studio is a browser-only single-page React application for building and running Pidd Three-Phase discrete-event simulation models. There is no backend: the simulation engine runs synchronously on the browser's main thread, and persistence is handled entirely by the Supabase JS client. The core Three-Phase engine (`src/engine/`) is the strongest part of the codebase — Phases A, B, and C are explicitly implemented, all five macros (ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE) are correct, and ~120 unit tests cover the engine layer well. The data model is sensible and the form-based editors cover the primary workflow.

The principal weaknesses are additive gaps rather than architectural failures. The most serious is a security issue: effect strings entered via the "Custom..." escape hatch in B-event and C-event editors are executed verbatim through `new Function()` (equivalent to `eval`), and because models can be made public and shared with other users, a crafted model could execute arbitrary JavaScript in another user's browser. Beyond security, the engine has two correctness issues: the C-scan restart rule operates at pass granularity rather than strict per-event granularity (deviation from Pidd), and LIFO/Priority queue disciplines are selectable in the UI but never read by the engine — all queues silently behave as FIFO regardless of configuration. The UI layer has no error boundaries, no undo/redo, no model validation before run, and no inline feedback when the model is misconfigured.

The database schema implies a more capable backend — fields for `replications`, `seed`, and `max_simulation_time` are written with hardcoded defaults and never consumed by the engine. The project has no CLAUDE.md, no linter, no TypeScript, no `.env.example`, and the test environment is configured for `node` only, leaving the entire UI layer untested. These infrastructure gaps make AI-assisted development sessions unreliable and onboarding slow.

---

## 2. Tech Stack — Expected vs Actual

| Layer | Expected (from audit brief) | Actual |
|---|---|---|
| Language | Python + JavaScript | **JavaScript only** — no Python anywhere |
| Backend framework | FastAPI | **Absent** — no backend server |
| Worker orchestration | ProcessPoolExecutor / ThreadPool | **Absent** |
| Simulation engine | Python / SimPy | **Custom JavaScript** (`src/engine/`) |
| Frontend framework | React | React 18.3.1 ✓ |
| Build tool | — | Vite 5.4.0 |
| Database | Supabase | Supabase JS client 2.45.0 ✓ |
| Real-time | Supabase real-time | **Absent** — no channel subscriptions |
| Type system | TypeScript | **Plain JavaScript (JSX)** |
| CSS framework | — | **None** — inline styles throughout |
| Linter / formatter | — | **None** |
| Test runner | — | Vitest 1.6.0 (engine only, node env) |
| Seeded RNG | — | **Absent** — `Math.random()` only |
| Visual canvas / DAG | — | **Absent** — form-based editors only |

---

## 3. Findings Tables by Area

### 3.1 Project Infrastructure

| Item | Status | Notes |
|---|---|---|
| CLAUDE.md present | ✗ | `CLAUDE_WORKFLOW.md` is a generic template, not project-specific |
| `.env.example` present | ✗ | Required vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) undocumented |
| Linter configured | ✗ | No ESLint, no Prettier in `devDependencies` |
| TypeScript | ✗ | Plain `.js` / `.jsx` throughout |
| Test environment covers UI | ✗ | `environment: 'node'` in `vite.config.js` — DOM tests would fail |
| Test coverage: engine layer | ✓ | 5 files, ~120 tests |
| Test coverage: UI layer | ✗ | Zero tests |
| Test coverage: DB layer | ✗ | Zero tests |
| Schema versioning on model data | ✗ | No `schemaVersion` field; column additions are ad-hoc |
| Model JSON export / import | ✗ | Supabase-only — no download / upload |

### 3.2 Model Editor (DAG Designer)

| Item | Status | Notes |
|---|---|---|
| Visual canvas / node graph | ✗ | Form-based editors only |
| Entity type editor | ✓ | `EntityTypeEditor` + `AttrEditor` with distribution-sampled attrs |
| State variable editor | ✓ | `StateVarEditor` |
| B-Event editor | ✓ | `BEventEditor` with schedule rows |
| C-Event editor | ✓ | `CEventEditor` with `ConditionBuilder` + `cSchedules` |
| Queue editor | ✓ | `QueueEditor` — FIFO/LIFO/Priority options |
| Node CRUD (add/update/delete) | ✓ | All editors implement create, patch, delete |
| Undo / redo | ✗ | No history stack anywhere |
| Drag-to-reorder C-events | ✗ | No affordance; order = priority, but undiscoverable |
| Inline validation on save | ✗ | Empty names, effects, and conditions accepted silently |
| Stale event-ID reference detection | ✗ | Deleting a B-event leaves dangling references in schedules |
| Cycle detection (B→B loops) | ✗ | Silently truncated at 800-cycle hard cap |
| Auto-save | ✗ | Manual Save only; Back button discards unsaved changes without warning |

### 3.3 Predicate Builder (Condition Input)

| Item | Status | Notes |
|---|---|---|
| Structured condition builder | ✓ | `ConditionBuilder` — token + operator + numeric value rows |
| AND / OR compound clauses | ~ | Flat chains only; no nested grouping; mixed precedence undefined to user |
| Operator filtering by token type | ~ | Value is `type="number"`; operators not filtered (all tokens are numeric today) |
| `valueType` metadata consumed by UI | ✗ | Defined on tokens but never read |
| Per-C-event priority field | ✗ | Implicit array order; no drag-to-reorder |
| Attribute-based entity filter | ✗ | Type-level only; no "select customer where attr > N" |
| Free-text effect escape hatch | ~ | `DropField` "Custom..." mode exists and feeds `new Function()` |
| Free-text auto-activates on unknown stored value | ✗ | `DropField:131` — crafted DB row opens as free-text automatically |

### 3.4 Simulation Engine (Three-Phase)

| Item | Status | Notes |
|---|---|---|
| Phase A — clock advance | ✓ | `engine/index.js:98` |
| Phase B — fire all B-events at T_now | ✓ | `engine/index.js:103–116`; FP tolerance `< 1e-9` |
| Phase C — conditional scan until stable | ✓ | `engine/index.js:120–143`; outer `while (cFired)` loop |
| C-scan restart from position 0 on any fire | ~ | Pass-granularity restart only; no `break` on individual fire (`index.js:121–142`) |
| Phase C silent truncation at 100 passes | ✗ | No log entry, no UI warning when cap hit |
| IDLE/BUSY tracking | ✓ | ASSIGN/COMPLETE/RELEASE macros correct; `idleOf`/`busyOf` helpers correct |
| FIFO queue discipline | ✓ | `entities.js:86–88` — `waitingOf` sorts by `arrivalTime` ascending |
| LIFO queue discipline | ✗ | UI option exists; engine ignores `q.discipline` entirely |
| Priority queue discipline | ✗ | UI option exists; engine ignores `q.discipline` entirely |
| Seeded RNG | ✗ | `Math.random()` only; `test.todo` acknowledges gap |
| M/D/1 integration test (labelled M/M/1) | ~ | Fixture exists but service dist is `Fixed` not `Exponential`; tests qualitative only |
| Analytical benchmark vs theory | ✗ | No comparison against Little's Law or utilisation formulas |

### 3.5 Replication & Experiment Controls

| Item | Status | Notes |
|---|---|---|
| Multi-replication runner | ✗ | Single run only; `replications` DB field always written as `1` |
| Independent seeds per replication | ✗ | No seeded RNG |
| Web Workers / parallel execution | ✗ | Engine blocks main thread |
| Warm-up period parameter | ✗ | Neither in UI nor engine |
| Time-based termination | ✗ | `max_simulation_time` in DB schema; engine never reads it |
| Condition-based termination | ✗ | Not implemented |
| Running mean + 95% CI | ✗ | Only single-run point estimates |
| Supabase real-time subscription | ✗ | No channel subscriptions anywhere |

### 3.6 UI Quality (Result Display, Error Handling, Export)

| Item | Status | Notes |
|---|---|---|
| React error boundary | ✗ | No `ErrorBoundary` class component anywhere |
| Run history table | ✓ | `ModelDetail` history tab with last-20 runs |
| Visual execution view | ✓ | `VisualView` — server bays, queue lanes, customer tokens |
| Step log view | ✓ | Phase-tagged event log with clock timestamps |
| Entity table view | ✓ | Entity status table in execute panel |
| Stats panel (overview tab) | ~ | Runs count always 0 (`model.stats` never populated); Queues count omitted |
| Save status feedback | ✓ | `saveStatus` banner for saving/saved/error states |
| Unsaved-change warning | ✗ | Back button discards silently |
| Model export (JSON / CSV) | ✗ | Absent |
| Results export | ✗ | Absent |
| `DistPicker` crash in `components.jsx` | ✗ | References `DISTRIBUTIONS` which is never imported — latent `ReferenceError` |
| Owner display in `ModelCard` | ✗ | `const owner = null` hardcoded — avatar always blank |
| Version tag in `ModelDetail` | ✗ | Hardcoded `"v6"` tag; package is `v7.0.0` |

---

## 4. Critical Findings Register (Simulation Correctness)

Issues that can produce **incorrect or misleading simulation results** without user notification.

| # | Severity | Finding | Location |
|---|---|---|---|
| C1 | **HIGH** | `new Function()` eval on shared effect strings — crafted public model executes arbitrary JS in any viewer's browser | `conditions.js:76`, `macros.js:220`, `editors/index.jsx:144–149` |
| C2 | **HIGH** | LIFO and Priority queue disciplines are UI fiction — engine always uses FIFO regardless of `q.discipline` setting | `entities.js:84–88`; `q.discipline` never read in engine |
| C3 | **MEDIUM** | C-scan restart is pass-granularity not event-granularity — deviates from strict Three-Phase; priority inversion possible in multi-C-event models | `engine/index.js:121–142` |
| C4 | **MEDIUM** | Phase C 100-pass truncation is silent — model defects (unstable C-scan) produce no log entry or UI warning | `engine/index.js:121` |
| C5 | **MEDIUM** | No model validation before run — empty entity names, missing effects, dangling B-event references all silently produce wrong results | `execute/index.jsx:141–147` |
| C6 | **MEDIUM** | Stale `eventId` references after B-event deletion — schedules silently become no-ops; downstream model behaviour changes without user awareness | `phases.js:91`, `phases.js:125` |
| C7 | **MEDIUM** | No seeded RNG — simulations are non-reproducible; results cannot be compared across runs; tests are non-deterministic | `distributions.js:84`, `phases.js:93,136` |
| C8 | **LOW** | `ConditionBuilder` token list stale after prop change — adding entity types while C-event editor is open does not update available condition tokens | `editors/index.jsx:495` |
| C9 | **LOW** | `avg_service_time` DB column is written with `avgSojourn` value — column name misleads any downstream query or analytics | `db/models.js:127` |
| C10 | **LOW** | Distribution parameter inputs lack `type="number"` — non-numeric input silently produces `NaN → 0` delays in sampler | `editors/index.jsx:171,241,731` |

---

## 5. Overall Recommendation

### Build On

The Three-Phase engine is the core intellectual property of this project and it is **sound**. Phases A, B, and C are correctly structured, all five macros are implemented and well-tested, and the engine architecture (FEL + entity pool + helper layer + macro registry) is extensible and clean. The data model (five element types, Supabase JSONB persistence, form-based editors) is coherent and functional for single-run exploration.

A full rebuild would discard working, tested engine code in exchange for nothing. A selective rebuild of the security layer, the C-scan loop, and the missing validation/undo infrastructure — combined with adding the absent features in prioritised sprints — is the correct path.

**The three things that must be addressed before any production use:**
1. Replace `new Function()` with a safe expression evaluator (C1)
2. Implement queue discipline in the engine or remove the LIFO/Priority UI options (C2)
3. Add a pre-run model validation pass (C5)

---

## 6. Recommended Sprint 1 Scope

**Goal:** Make the engine safe and honest — fix every issue that produces wrong results silently.

### Deliverables

1. **Replace `new Function()` eval** (`conditions.js`, `macros.js`)
   - Introduce a small safe expression evaluator (e.g., a recursive descent parser for `TOKEN OP VALUE [AND|OR …]`) or a well-maintained sandboxed library
   - Restrict scalar effect `VAR = expr` to literals and other state variable names only
   - Fallback: remove "Custom..." escape hatch from `DropField` for effects; force users to use structured editors only

2. **Implement or disable queue discipline**
   - Quickest fix: remove LIFO and Priority from the `QueueEditor` dropdown until they are implemented
   - Proper fix: pass `q.discipline` into `waitingOf()` and implement reverse-sort (LIFO) and attribute-sort (Priority)

3. **Add pre-run model validation**
   - Validate before `buildEngine()` is called: no empty entity names, no empty C-event conditions, no dangling schedule `eventId` references
   - Surface errors inline in the editor tabs and block Run until resolved

4. **Surface Phase C truncation**
   - Add a log entry and a visible warning banner when the 100-pass cap is hit during Phase C
   - Consider raising the cap to 500 and making it configurable

5. **Add seeded RNG**
   - Replace `Math.random()` with a seedable PRNG (e.g., `mulberry32` or `xorshift`)
   - Pass seed through `buildEngine(model, maxCycles, seed)`
   - Surface seed field in Execute panel; persist with run history record

### Out of scope for Sprint 1
- Undo/redo, drag-to-reorder, visual canvas, multi-replication, warm-up, CI calculation — these are additive features. Correctness first.

---

## 7. CLAUDE.md Update Requirements

`CLAUDE.md` is **missing**. A `CLAUDE_WORKFLOW.md` exists but is a generic methodology guide with no project-specific content. Create `CLAUDE.md` in the project root with at minimum:

```markdown
# DES Studio

## Project Purpose
Browser-based discrete-event simulation (DES) studio using Pidd's Three-Phase method.
Users define entity types, B-events, C-events, and queues; run single simulations; and
view results. Backed by Supabase for auth, model storage, and run history.

## Tech Stack
- Frontend: React 18.3.1 + Vite 5.4.0 (JSX, ESM, inline styles — no CSS framework)
- Database / auth: Supabase JS client 2.45.0
- Testing: Vitest 1.6.0 (engine layer only; node environment)
- Language: JavaScript — no TypeScript, no linter

## Architecture
- `src/engine/`   — Pure JS Three-Phase DES engine. No React, no DOM. Fully unit-tested.
- `src/ui/`       — React components. ModelDetail (tabs), editors/, execute/, shared/.
- `src/db/`       — Supabase CRUD wrappers (models.js) and client singleton (supabase.js).
- `src/App.jsx`   — Auth listener + model library shell only. No simulation logic.

## Key Engine Facts
- FEL stored as a sorted array; clock advances to `fel[0].scheduledTime` (Phase A)
- B-events fire via `fireBEvent()` in phases.js; C-events via `fireCEvent()`
- Phase C restarts at pass granularity (outer while loop), NOT per-event granularity
- Engine terminates on FEL empty OR 800-cycle hard cap (`maxCycles`)
- No seeded RNG — uses Math.random() throughout
- Queue discipline: FIFO only (LIFO/Priority are stored but never read)

## Known Issues (must fix before production)
- new Function() eval in conditions.js:76 and macros.js:220 — XSS risk on public models
- LIFO/Priority queue disciplines are UI-only; engine always uses FIFO
- No pre-run model validation — invalid models produce silent wrong results
- Phase C truncation (100 passes) is silent — no warning surfaced to user

## Commands
- Dev server:   npm run dev
- Tests:        npm test
- Build:        npm run build

## Environment Variables (required in .env.local)
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

## Coding Conventions
- No TypeScript — plain JSX
- No CSS classes — inline style objects using tokens from ui/shared/tokens.js
- No comments unless WHY is non-obvious
- Component names: PascalCase; files: kebab-case folders, index.jsx entry points
- Engine functions are pure (no React imports); UI components never import engine internals
  except through buildEngine() in execute/index.jsx

## Current Sprint
Sprint 1: Engine safety and correctness
- Replace new Function() eval with safe evaluator
- Implement or remove LIFO/Priority queue disciplines
- Add pre-run model validation pass
- Surface Phase C truncation as a visible warning
- Add seeded RNG to buildEngine()
```
