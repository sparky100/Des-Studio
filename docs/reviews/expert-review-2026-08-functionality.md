# simmodlr — Expert Functionality & Capability Review

> Reviewed: 2026-08-24
> Scope: Full application source — `src/engine/**`, `src/llm/**`, `src/reports/**`, `src/db/**`, `src/ui/**`, `src/simulation/**`, `supabase/functions/**`, `.github/workflows/**`, project documentation (`AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/**`)
> Reviewer: Senior simulation-software product reviewer (DES domain: Simul8, Arena, AnyLogic, FlexSim, Salabim/SimPy)
> Method: Every capability claim in this review was verified directly against source code. Line references are to the working tree at review date.

---

## 1. Executive Summary

simmodlr is a browser-based Three-Phase (A/B/C) discrete-event simulation workbench: React front end, pure-JavaScript engine, Supabase persistence, and an unusually deep AI-assist layer. Having audited the engine, statistics library, UI editors, persistence layer, exports, and documentation, my headline verdict is:

**The product's simulation capability is genuinely strong — comfortably beyond hobbyist tools and credibly into the territory of commercial process-simulation packages for queueing/service/light-manufacturing domains. The documentation, however, systematically undersells and misdescribes it, and the CI pipeline does not actually enforce the test suite it advertises.**

That inversion is rare. Most simulation products I review have the opposite problem — glossy capability matrices backed by shallow engines. Here the engine has 24 effect macros (the architecture contract documents 19), 73 distinct validation codes (the contract documents ~19), all six queue disciplines dispatched (the contract says LIFO/Priority are "never read"), a seeded substream RNG (the contract lists `Math.random()` as an open defect), and roughly 3,000 test cases across 202 test files (the contract says "UI and DB layers untested", "~120 engine tests"). Meanwhile the CI workflow's job named "Vitest test suite" checks out the repo, installs dependencies — and never runs a test.

### Capability maturity verdict

| Dimension | Rating | Notes |
|---|---|---|
| Core engine (event mechanics, resources, queues) | **Strong** | 24 macros incl. PREEMPT, FAIL/REPAIR, COSEIZE, MATCH, BATCH/UNBATCH, FILL/DRAIN containers; 6 queue disciplines |
| Randomness & reproducibility | **Strong** | Seeded mulberry32, per-purpose substreams (`mtbf:X`, `mttr:X`), CI grep-gate against `Math.random` in engine, bit-identical replay claim benchmarked |
| Input modelling | **Good** | 14 distributions incl. Empirical, Piecewise (time-varying), Categorical, Schedule, Distance; CSV distribution fitting (moments + KS ranking); weekly calendar patterns |
| Output analysis & statistics | **Strong** | Replications with CIs, Welch warmup detection, batch means, ANOVA + Tukey HSD, paired-t scenario comparison, Bonferroni, adaptive batch to target CI precision |
| Experimentation | **Good** | 1D/2D parameter sweeps (off-thread), saved experiments, scenario comparison, goal-driven adaptive batch; no metaheuristic optimiser |
| Validation & model checking | **Strong** | 73 distinct validation codes over 2,082 lines; separate runtime model checker surfaced in the Execute UI |
| Interoperability | **Strong for the class** | SimPy transpiler (1,013 lines), JSON schema (`simmodlr.results.v1`), CSV, multi-sheet XLSX, LLM bundle, HTML reports, PNG |
| Live data | **Good, thinly surfaced** | REST/OpenSky/ScheduleFeed/ActualsStream adapters with retry/TTL cache; secrets workflow is developer-grade, not user-grade |
| AI layer | **Distinctive** | 21 prompt builders, hallucination guardrails with numeric post-correction, model-builder chat, multi-provider edge proxy |
| Material handling / spatial / agent logic | **Absent** | No conveyors, transporters, AGVs, entity state machines, or continuous flow (containers are levels, not fluid dynamics) |
| Documentation truthfulness | **Poor** | 14 confirmed discrepancies tabulated in §4; the architecture contract (AGENTS.md) describes the codebase as it was ~30 sprints ago |
| CI enforcement | **Broken** | Test job runs no tests; downstream jobs `needs: test` gate on an empty job |

**Overall functional maturity: 8/10 for its stated domain (service/queueing/healthcare/operations simulation). Documentation-and-process maturity: 4/10.** The gap between those two numbers is the story of this review.

---

## 2. Capability Inventory (Verified)

Every item below was confirmed by reading the implementing source. This section is safe to lift into marketing or capability documentation — which currently understates most of it.

### 2.1 Simulation engine

**Effect macros — 24** (`src/engine/macros.js`, `MACROS` array from L295; names verified by extraction):

ARRIVE, ASSIGN, BATCH, CANCEL, COMPLETE, COSEIZE, COST, DELAY, DRAIN, FAIL, FILL, FINISH, MATCH, PREEMPT, RELEASE, RELEASE_COSEIZED, RENEGE, RENEGE_OLDEST, REPAIR, ROUND_ROBIN, SET, SET_ATTR, SPLIT, UNBATCH.

This vocabulary covers resource seizure (single and atomic multi-resource via COSEIZE/RELEASE_COSEIZED), preemption with resumable remaining-time, server failure/repair cycles with per-server MTBF/MTTR sampling streams, batching/unbatching/matching (assembly), entity cloning (SPLIT), reneging (timeout and oldest-of-type), container levels (FILL/DRAIN with clamping and time-integral stats), cost accumulation, state-variable and attribute mutation, round-robin dispatch, and in-flight service cancellation (CANCEL, FINISH). For comparison: this is broader than Simul8's standard action set and approaches Arena's Basic+Advanced Process template coverage, minus material handling.

**Distributions — 14** (`src/engine/distributions.js`, `DISTRIBUTIONS` registry from L118): Fixed, Uniform, Exponential, Normal, Triangular, Erlang, Lognormal, Empirical, Piecewise (time-varying rates), ServerAttr, EntityAttr, Distance, Categorical, Schedule. The registry pattern is honoured (no switch chains), and `sample()` throws if called without a seeded PRNG (L305) — a defensive contract most commercial tools lack.

**Queue disciplines — 6** (`src/engine/entities.js`, `queueDisciplineComparator` from L52): FIFO, LIFO, PRIORITY (default `priority` attr), PRIORITY(attrName) with case-insensitive attribute lookup, SPT (serviceTime/processingTime), EDD (dueDate) — all with FIFO tiebreakers. A `waitingByQueue` index gives O(1)-amortised queue membership for hot paths, with the maintenance chokepoints documented in-code (L114–128).

**Validation — 73 distinct codes** (`src/engine/validation.js`, 2,082 lines): V1–V70 plus sub-variants V38b–e (V7 retired), emitted from 218 call sites. Coverage extends to cross-references most tools skip — e.g. V70 validates Distance-distribution `from`/`to` against declared queues, `speedSource`, and whether `speedAttr` is declared on any entity type, with explicit fall-back-behaviour warnings.

**Randomness**: `mulberry32(seed)` PRNG with `createStreamRegistry(seed)` providing named substreams (e.g. `mtbf:ServerName`, `mttr:ServerName` in `src/engine/index.js` L387–432) so failure processes don't perturb the main sample sequence — the correct common-random-numbers design. `.github/workflows/benchmark-gate.yml` grep-fails the build if `Math.random` appears anywhere in `src/engine/` (verified: zero occurrences), and runs M/M/1 and M/M/c analytical benchmarks (also duplicated in `ci.yml`).

**Run infrastructure**: replication runner with browser Web Workers and inline fallback (`src/engine/replication-runner.js`, `src/engine/worker.js`); 1D and 2D parameter sweeps with off-thread execution (`src/engine/sweep-runner.js` — `runSweep`, `run2DSweep`, `runSweepOffthread`; `sweep-worker.js`); **adaptive batch** (`src/engine/adaptive-batch.js`, 201 lines) that steps up replications until the 95% CI relative half-width on the model's first goal metric drops below target, capped by tier; **run admission tiers** (`src/engine/run-admission.js`, `RUN_ADMISSION_TIERS` with DB-overridable per-tier policies and automatic time-series disablement above a size threshold); complexity estimator (`complexity-estimator.js`).

**Statistics library** (`src/engine/statistics.js`, 1,304 lines, all verified as exports): 95% CIs with t-critical lookup, paired-t scenario comparison (`pairedTConfidenceInterval`, `compareScenarios`), Bonferroni correction, **one-way ANOVA** and **Tukey HSD** for multi-scenario comparison, **Welch's graphical warmup detection** (`detectWarmupWelch`), **batch means** (`suggestBatchSize`, `batchMeansCI`) for steady-state single-run analysis, relative precision and sample-size guidance, Freedman–Diaconis histograms, outlier detection, percentiles. This is a more complete output-analysis toolkit than Simul8 ships and is in the same league as Arena's Output Analyzer.

**SimPy transpiler** (`src/engine/simpy-export.js`, 1,013 lines, with `SimPyExportModal.jsx`): generates runnable Python — a genuinely unusual escape hatch that addresses the "walled garden" criticism of commercial tools head-on.

**Templates — 26** (`src/engine/templates.js`, ids verified): mm1, er-triage, outpatient-clinic, ward-admission, surgical-suite, appointment-clinic, slot-booking-clinic, call-center, fast-food, airport, bank-branch, retail-checkout, rase-service-request, factory, construction, warehouse, order-fulfillment, bulk-order-split, port-berth, courier-ground-transport, data-center, machine-shop-failures, priority-ed-balking, cost-call-centre, tfl-station-plan, plane-arrivals-live.

**Live-data adapters** (`src/engine/adapters/`): AdapterRegistry plus RestAdapter (poll + TTL cache + retry), OpenSkyAdapter, ScheduleFeedAdapter, ActualsStreamAdapter, mockAdapter; `{{env.VAR}}` secret resolution. Any `distParams` field can be bound to a live source at sample time.

**Input fitting** (`src/engine/distribution-fitting.js`): CSV parsing, per-column type inference, entity-type generation from CSV, and `fitDistribution()` — method-of-moments fits across six families (Fixed, Exponential, Normal, Lognormal, Uniform, Triangular) ranked by KS statistic, falling back to Empirical above a KS threshold of 0.35.

**Calendar/scheduling** (`src/engine/schedule-pattern.js`, 307 lines): recurring weekly capacity patterns expanded to events against a model epoch (`expandWeeklyPatternToEvents`), with `WeeklyPatternEditor.jsx` and ADR-018 — shipped, despite the sprint plan saying otherwise (§4h).

### 2.2 AI layer (`src/llm/`, `supabase/functions/llm-proxy/`)

- **21 exported prompt builders** across `prompts.js` (17), `model-builder-prompts.js` (2), `help-assistant-prompt.js` (2) — covering narrative results explanation, KPI extraction, goal-gap analysis, sensitivity, batch/sweep analysis, scenario comparison, model description/query, plan refinement, report recommendations, apply-opportunity, and a help assistant.
- **Hallucination guardrails** including `correctUtilisationFigures` (`prompts.js`) — a post-generation numeric corrector that rewrites utilisation figures in LLM prose against ground-truth values, including reversed-phrasing cases (tested in `src/llm/__tests__/prompts.test.js`). This is a notably mature pattern; most AI-in-analytics products ship the raw prose.
- Model-builder chat with retry (`apiClient.js`), LLM bundle export (`bundleExport.js`), contract validation (`contracts.js`).
- **Multi-provider edge proxy** (`supabase/functions/llm-proxy/index.ts`): Anthropic (default), OpenAI, and a gateway routing across openai/anthropic/google formats — keys held server-side.

### 2.3 Reports & exports

- `src/reports/reportGenerator.js`: two audiences (`seniorMgmt` | `technical`) × two formats, with audience-conditional methodology and CI presentation (full CI tables for technical, summary sentences for management).
- `src/ui/shared/ExportPopover.jsx`: JSON (versioned `simmodlr.results.v1` schema with in-app schema reference dialog), CSV, multi-sheet XLSX (Summary / Replications / Entity Journeys), LLM bundle (markdown), generated report, SimPy export, PNG.

### 2.4 Persistence (`src/db/`, `supabase/functions/`)

`models.js` (1,451 lines) exports **71 functions**: model CRUD with visibility/access/tags, fork, run history (label/tag/archive), **share links** (create/get/revoke/list), **sweeps** (save/get/list/delete), **experiments** (fetch/save/update/clone/delete), **model versioning** (createVersion/listVersions/getVersion/deleteVersion with `getNextVersion`), **schedules** (ADR-016 separation: fetch/save/delete/setDefault/extractInline), platform config, tier policies, admin (user management, audit log, platform stats, plans), schema validation. `local.js` provides a full offline localStorage mode. Edge functions: `results-api`, `import-model`, `llm-proxy`, plus notification functions.

### 2.5 Model checking & tracing

`src/simulation/modelChecker.js` (531 lines, `checkModel`) — a runtime-oriented checker distinct from the schema validator — **is surfaced in the UI**: `src/ui/execute/index.jsx` L347–348 holds checker state and L2764+ renders a findings modal (including an explicit empty state). `traceCollector.js` supports step-level debugging.

---

## 3. UI–Capability Parity Assessment (AGENTS.md §3b)

AGENTS.md §3b (L127) mandates that every engine capability be reachable from the UI, a rule created after early sprints shipped engine-only features. Current state: **macro parity is effectively complete; the thin spots are in live-data configuration and option-list scalability, not macro coverage.**

### Verified parity (spot checks)

- **COST** — `src/ui/editors/helpers.jsx` L189–192 (assignOptions) and L358–361 (bEffectOptions): flat-rate and `COST(Entity.attr)` options, plus a free-form expression composer (L442+).
- **PREEMPT / FAIL / REPAIR** — L362–368: per-server-type options in bEffectOptions.
- **MATCH** — L202–218: full pairing options across queue pairs and target queues, plus a guided composer path (L464–469).
- **COSEIZE** — L220–247: queue × server-pair options including skill-tagged variants `COSEIZE(Q, S1[skill], S2)`.
- **FINISH, RELEASE_COSEIZED, CANCEL, ROUND_ROBIN, SET/SET_ATTR** — all present (L250–256, L294–300, L458–478), including context-sensitivity tooltips (SET_ATTR requires entity context, L509).
- **Queue disciplines** — `QueueEditor.jsx` L164–173 exposes all six: FIFO, LIFO, Priority (default attr), Priority (custom attribute) with attribute input, SPT, EDD. *Minor doc-lag inside the UI itself*: the inline help text at L88/L94 still says "FIFO (default), LIFO, or Priority" — the dropdown outgrew its own caption.
- **Model checker findings** — surfaced in Execute (see §2.5). Verified, not a gap.

### Thin spots (verified)

**T-1 — Live-data adapter configuration is developer-grade.** There *is* a `DataSourcesEditor` (`src/ui/ModelDetail.jsx` L258+, wired at L1334) with a type selector (rest / scheduleFeed / actualsStream / openSky), URL, and auth fields — so "no editor at all" would be unfair. But: `attrMap` is edited as a raw JSON textarea (L384); there is no field-mapping assistant, no test-connection button, and — critically — **no UI whatsoever for supplying `{{env.VAR}}` secrets**. `collectEnvSecrets()` (`src/ui/execute/index.jsx` L45–57) reads them from `sessionStorage`, which a user can only populate via the browser devtools console. For a product whose gap analysis trumpets real-time integration as a differentiator, the last mile is a console incantation.

**T-2 — Effect-picker option lists grow combinatorially.** `helpers.jsx` builds MATCH options as (queue pairs) × (target queues) — O(|Q|³) — and COSEIZE as queues × server pairs × (1 + skills per server) — O(|Q|·|S|²·k). A model with 12 queues generates ~800 MATCH entries in a flat `<select>`-style option list; add 8 servers with skills and COSEIZE contributes hundreds more. On the showcase-scale models this is workable; on large models it degrades both render performance and findability. A searchable/guided composer (which already exists for SET/COST/MATCH in the expression path, L442+) should become the *only* path above a threshold, with the enumerated cross-product suppressed.

**T-3 — Discipline help text lags the dropdown** (see above, `QueueEditor.jsx` L88/94) — trivial but on-theme: even the UI's own microcopy undersells the capability.

---

## 4. Documentation-vs-Code Discrepancy Register

All 14 items below were independently verified against source during this review. Direction column: **U** = documentation understates reality, **O** = documentation overstates reality, **W** = simply wrong/stale.

| # | Claim (location) | Reality (verified) | Dir |
|---|---|---|---|
| a | README L51: "CI \| GitHub Actions (test + benchmark + build)". `.github/workflows/ci.yml` job "Vitest test suite" | The `test` job contains only checkout, setup-node, `npm ci` — **no test step**. `benchmarks` and `build` both `needs: test`, gating on a job that tests nothing. (`benchmark-gate.yml` does run real benchmarks + the Math.random grep, but the ~3,000-case Vitest suite is enforced nowhere.) | **O** |
| b | AGENTS.md L157, L256: "All 19 macros" (§5.1 table lists 19) | **24 macros** exist in `src/engine/macros.js`. DELAY, FINISH, RELEASE_COSEIZED, CANCEL, ROUND_ROBIN are implemented, tested, UI-exposed — and undocumented in the contract | **U** |
| c | AGENTS.md documents validation codes ~V1–V19 | **73 distinct codes** (V1–V70 + V38b–e) across 218 emission sites in `validation.js` | **U** |
| d | AGENTS.md L163 (working-components table): `conditions.js` "new Function() call (replace with safe eval)" listed as open | Replaced long ago — ADR-003 (safe evaluator); `conditions.js` L244 states "Never calls eval, new Function"; zero dynamic-code sites in engine | **W** |
| e | AGENTS.md L164: `distributions.js` "Math.random() (add seeded RNG)" listed as open | Fixed: zero `Math.random` in `src/engine/` (grep-verified); mulberry32 + substreams; `benchmark-gate.yml` L30–39 CI-gates the grep | **W** |
| f | AGENTS.md L162: `entities.js` "LIFO/Priority never read (extend waitingOf)" | All **six** disciplines dispatched via `queueDisciplineComparator` (L52+), exposed in QueueEditor, benchmarked (capability register: priority queueing benchmarks 5–6) | **W** |
| g | AGENTS.md L170: "~120 engine tests passing / UI and DB layers untested" | **202 test files, ~3,000 test cases**; `tests/ui/` has 30 top-level files plus `editors/` and `execute/` subdirectories (~70 UI test files total), `tests/db/` has 15 | **U** |
| h | `docs/reviews/sprint-86-plan.md` L5: "Status: ⬜ Not started" | Shipped: `src/engine/schedule-pattern.js`, `src/ui/editors/WeeklyPatternEditor.jsx`, tests (`schedule-pattern.test.js`, `schedule-pattern-runtime.test.js`, `weekly-pattern-editor.test.jsx`), ADR-018 | **W** |
| i | `docs/capability-gap-analysis.md` L26, L177, L232, L269: names "WebSocketAdapter" as a shipped component | No such file; streaming lives inside `ActualsStreamAdapter.js`. `src/engine/adapters/` = Rest, OpenSky, ScheduleFeed, ActualsStream, mock | **W** |
| j | Template count: README L33 says 22; gap analysis L154 says 20; README L123 says the guide covers 18 | **26** templates in `templates.js` (ids verified) | **U** |
| k | `docx` is a runtime dependency (package.json L21) | Used only by `scripts/generate-docs.cjs` — belongs in devDependencies; it ships weight into the dependency audit surface for no runtime purpose | **W** |
| l | AGENTS.md L1124 (§13 Commands): "`npm test` # Watch mode — all tests" | package.json L10: `"test": "vitest run"` — single pass. Watch is `npm run test:watch` | **W** |
| m | `docs/capability-register.md` baseline "Sprint 55a" (2026-05-20); `capability-gap-analysis.md` "updated post Sprint 68" (2026-05-21) | Code is at **Sprint 89** (`sprint-89-probabilistic-routing-canvas-edit-plan.md`; sprint-88 closure report exists). The two capability documents — the ones an evaluator would read first — are 21–34 sprints stale | **U** |
| n | CLAUDE.md points at Sprint 79 plans as "current structured sprint plan" | Current work is Sprint 89; Sprints 80–88 have plans/closures in `docs/reviews/` | **W** |

**Pattern**: 5 of 14 items are the *contract document* (AGENTS.md) describing defects fixed dozens of sprints ago as open, and capabilities at a third of their real size. Since AGENTS.md instructs agents/developers on what "must not be replaced" and what is broken, stale defect rows actively invite regression-risk work: an agent reading L162–164 today would set out to "fix" LIFO dispatch, the evaluator, and the RNG — all long fixed. This is the most consequential documentation failure, ahead of even the CI gap.

---

## 5. Genuine Capability Gaps vs Professional DES Tools

These are gaps where documentation and code agree — real absences, assessed against Arena, Simul8, AnyLogic, FlexSim, and Salabim/SimPy, and weighted for simmodlr's evident target user (operations/service/healthcare modellers, not factory-layout engineers).

### 5.1 Confirmed structural gaps

- **Material handling — conveyors, transporters, AGVs, vehicles.** Zero hits for conveyor/transporter/AGV concepts in `src/`. Arena's Transfer template, FlexSim's entire raison d'être, Simul8's conveyor object — absent. The `Distance` distribution (registry L224, validated by V70: from/to queues, speed from entity or server attribute) is a creditable partial mitigation for *travel time*, but it models duration, not capacity-constrained movement: no accumulation, no blocking on a full conveyor, no vehicle contention or empty-travel repositioning. **Weight for target user: moderate** — hospital porters and warehouse pick-paths would want transporters; pure service models won't miss them.
- **Entity state machines / agent logic.** Entities carry attributes and can be filtered/routed, but have no statecharts, no autonomous behaviour, no inter-entity messaging (AnyLogic's core differentiator). The gap analysis itself concedes (L269) that "coroutine-style multi-step waiting within a single entity's lifetime" is impossible under the declarative three-phase model. This is an honest architectural trade — safety and AI-legibility over expressiveness — but it caps the tool below AnyLogic for agent-based hybrid models. **Weight: low-moderate** for the service-simulation audience.
- **Continuous / fluid flow.** FILL/DRAIN containers give discrete-step levels with time-integral statistics — tank *bookkeeping*, not tank *dynamics*. No rates, no differential flow, no hybrid discrete-continuous stepping (Arena's Flow Process, AnyLogic system dynamics). **Weight: low** for the target user.
- **Attribute-based routing predicates are narrow.** Conditional entity selection is limited to `entityFilter` on ASSIGN/COSEIZE (macros.js L372, L502, via `evaluatePredicate`), plus C-event conditions on state. There is no general per-arc routing predicate ("if attr X → path A else path B" as a first-class routing rule); probabilistic/attribute routing is being addressed only now (Sprint 89 plan). Arena's DECIDE-by-condition and Simul8's routing-out labels are more direct. **Weight: high** — this is the gap the target user hits first.
- **Network arc travel times.** No first-class network/path model; Distance distribution mitigates per-move duration but there is no route graph with per-arc times/capacities. **Weight: moderate.**

### 5.2 Expert view — gaps that matter, checked against code before claiming absence

To be explicit about what is *not* missing (the stale docs would mislead a reviewer here): experiments exist (`fetchExperiments/saveExperiment/cloneExperiment` + UI), 1D/2D sweeps exist with off-thread execution, scenario comparison with paired-t/ANOVA/Tukey exists, adaptive precision-targeted replication exists, and distribution fitting from CSV exists. With that established:

- **Optimisation.** There is goal-driven sweeping and adaptive batch, but no metaheuristic optimiser (OptQuest-class: scatter search/GA over a constrained decision space with budget management). For a tool whose AI layer already builds "apply opportunity" prompts, a simple constrained search over sweep space (even coordinate descent with the existing adaptive-batch precision control) would leapfrog Simul8's OptQuest add-on pricing story. **The scaffolding is 80% built; the last 20% is absent.**
- **Input-modelling workflow depth.** `fitDistribution()` is method-of-moments with KS *ranking* — no MLE, no goodness-of-fit p-values or Anderson–Darling, no fit-comparison report (Arena's Input Analyzer and Stat::Fit both show ranked fits with test statistics for user judgement). The Empirical fallback at KS > 0.35 is sensible engineering but invisible to the user. Also: fitting appears bound to the CSV-import entity path rather than being a general "fit this column to this distParam" utility.
- **Experiment/scenario management UX vs engine.** The statistical machinery outclasses the management layer: there is no named-scenario matrix ("Baseline vs +1 nurse vs new roster" as first-class objects with locked seeds, run status, and a comparison dashboard). Experiments and sweeps exist as records; a Simul8-style trial manager would make the existing ANOVA/Tukey capability *findable*.
- **Animation fidelity.** 2D token animation on the ReactFlow canvas (`AnimatedEdge.jsx`, SVG `animateMotion`) with step-log playback — adequate for verification, well short of FlexSim/Simul8 presentation-grade animation (no clock-proportional playback speed control tied to sim time, no entity-state colouring on the canvas, no 3D). For a stakeholder-communication tool this matters more than most engine gaps; the report generator partially compensates.
- **Collaboration.** Share links, visibility tiers, community gallery, forking, and model versioning exist — genuinely better than desktop DES tools. Missing: commenting/annotation on models or runs, real-time co-editing, and change review between versions beyond `detectStructuralChanges`. Given the browser-native positioning, this is the most winnable differentiation left on the table.
- **Model-scale ergonomics.** Related to T-2: no evidence of hierarchical model composition (sub-models as reusable blocks). Sections exist for canvas organisation; a 200-activity hospital model would strain both the editors and the effect pickers.

---

## 6. Findings — Remediation Required vs Improvement Recommendations

### Summary table

| ID | Type | Severity | Title | Effort |
|---|---|---|---|---|
| F-1 | Remediation | Critical | CI "test suite" job runs no tests | S |
| F-2 | Remediation | High | AGENTS.md lists fixed defects as open; understates macros/validation/tests | M |
| F-3 | Remediation | Medium | Capability docs stale by 21–34 sprints; wrong component names and counts | M |
| F-4 | Remediation | Medium | CLAUDE.md and sprint-86 status wrong | S |
| F-5 | Remediation | Low | `npm test` documented as watch mode; `docx` misfiled as runtime dep | S |
| F-6 | Improvement | High | Live-data secrets and mapping have no real UI | M |
| F-7 | Improvement | High | First-class conditional/probabilistic routing (in flight, Sprint 89) | L |
| F-8 | Improvement | Medium | Effect-picker combinatorial explosion on large models | M |
| F-9 | Improvement | Medium | Named-scenario manager over existing stats machinery | M |
| F-10 | Improvement | Medium | Optimiser loop over existing sweep + adaptive batch | L |
| F-11 | Improvement | Low | Input-fitting transparency (ranked fits, GoF statistics) | M |
| F-12 | Improvement | Low | Transporter/conveyor primitive | L |

---

### Remediation required

### F-1 — CI advertises a test suite it never runs

**Severity:** Critical
**Evidence:** `.github/workflows/ci.yml` — job `test` ("Vitest test suite") steps are checkout, setup-node, `npm ci` only. `benchmarks` and `build` declare `needs: test`. README L51 claims "GitHub Actions (test + benchmark + build)".
**Impact:** ~3,000 Vitest cases (including the Schema Contract round-trip assertions that CLAUDE.md declares mandatory for PRs) are enforced on no branch and no PR. Every green check mark on this repo's history overstates what was verified. The benchmark gate catches analytical regressions only.
**Remediation:** Add `- run: npm test` (already `vitest run`, CI-safe) to the `test` job. Consider splitting engine (node env) and UI (jsdom) into parallel jobs for speed.
**Effort:** S — one line, plus whatever failures it surfaces (which is the point).

### F-2 — AGENTS.md, the binding architecture contract, describes a codebase ~30 sprints gone

**Severity:** High
**Evidence:** §4 items b–g, l: "All 19 macros" (24 exist); validation documented to ~V19 (73 codes exist); L162 "LIFO/Priority never read" (six disciplines dispatched); L163 "new Function()" open (ADR-003 closed it); L164 "Math.random()" open (grep-gated fixed); L170 "UI and DB layers untested" (~70 UI + 15 DB test files); L1124 `npm test` watch-mode claim.
**Impact:** This is not cosmetic. AGENTS.md is the routing document for agents and developers ("must not be replaced — only extended", open-defect table). A reader today is instructed to fix three defects that no longer exist and told that five macros, ~54 validation codes, and the entire UI/DB test estate don't exist. That invites duplicate work, misdirected "fixes" of healthy code, and undersells the product to any technical evaluator doing diligence from docs.
**Remediation:** Single doc-truth pass: regenerate §5.1 macro table from `MACROS` (consider a script — the array is regular enough to extract name/pattern/comment), update the working-components/defect tables to current state, correct test counts and command docs, and add a "last verified against code" date line. Add lightweight drift checks to CI (e.g. assert documented macro count === `MACROS.length`).
**Effort:** M

### F-3 — Public capability documents are 21–34 sprints stale and name non-existent components

**Severity:** Medium
**Evidence:** `capability-register.md` baseline Sprint 55a; `capability-gap-analysis.md` updated post Sprint 68; code at Sprint 89. Gap analysis names "WebSocketAdapter" (no such file — `ActualsStreamAdapter.js`), counts 20 templates (26 exist); README says 22 templates and cites an 18-template guide.
**Impact:** These are the documents an external evaluator or new team member reads first. They understate a materially improved product (everything from Sprint 69–89 — SimPy export, dedup, calendar scheduling, visual designer work — is invisible) and cite components that grep cannot find, which reads as untrustworthy.
**Remediation:** Re-baseline both documents to Sprint 89; fix the adapter naming; make the template count a single sourced number (or generate it). Reconcile README's three conflicting counts.
**Effort:** M

### F-4 — Status metadata actively wrong: CLAUDE.md "current sprint" and sprint-86 plan

**Severity:** Medium
**Evidence:** CLAUDE.md names Sprint 79 plans as current; `sprint-89-probabilistic-routing-canvas-edit-plan.md` exists and sprint-88 has a closure report. `sprint-86-plan.md` L5 "Status: ⬜ Not started" while its deliverables (`schedule-pattern.js`, `WeeklyPatternEditor.jsx`, ADR-018, 3 test files) are shipped.
**Impact:** Tooling and agents keyed off CLAUDE.md load the wrong sprint context; a shipped feature marked "not started" risks being re-planned or re-implemented.
**Remediation:** Point CLAUDE.md at the Sprint 89 plan; mark sprint-86 complete with a pointer to the shipped files/ADR-018.
**Effort:** S

### F-5 — Command docs and dependency hygiene

**Severity:** Low
**Evidence:** AGENTS.md L1124 documents `npm test` as watch mode; package.json defines it as `vitest run` (watch is `test:watch`). `docx@^9.6.1` sits in `dependencies` but is imported only by `scripts/generate-docs.cjs`.
**Impact:** Minor friction and audit noise; the watch-mode error propagates into every derived how-to.
**Remediation:** Correct §13 command table; move `docx` to devDependencies.
**Effort:** S

---

### Improvement recommendations

### F-6 — Give live data a real front door: secrets UI and mapping assistant

**Severity:** High (relative to how hard the capability is marketed)
**Evidence:** `collectEnvSecrets()` reads `{{env.VAR}}` values from `sessionStorage` (`src/ui/execute/index.jsx` L45–57) with no UI to set them; `DataSourcesEditor` (`ModelDetail.jsx` L258+) edits `attrMap` as a raw JSON textarea; no test-connection affordance.
**Impact:** The adapter layer (retry, TTL cache, calibrated/rolling modes) is production-grade engineering that a non-developer cannot actually configure. The gap between engine and UI here is the single largest §3b parity violation remaining.
**Remediation:** Session-scoped secrets panel (prompt for each `{{env.VAR}}` referenced by the model's dataSources at run time, store in sessionStorage exactly as now); "Test connection" button per source; key/value grid for attrMap with a raw-JSON escape hatch.
**Effort:** M

### F-7 — First-class conditional and probabilistic routing

**Severity:** High
**Evidence:** Routing conditions limited to `entityFilter` on ASSIGN/COSEIZE (macros.js L372, L502) and C-event conditions; Sprint 89 plan targets probabilistic routing on the canvas.
**Impact:** "70% to X-ray, 30% discharged" and "if triage=red → resus" are the first things every Arena/Simul8 modeller tries. Today they require condition-macro gymnastics.
**Remediation:** Complete Sprint 89; extend to attribute-predicate arcs (DECIDE-equivalent) with validation codes and UI parity per §3b, and a template showcasing it.
**Effort:** L (in flight)

### F-8 — Cap the effect-picker cross-products

**Severity:** Medium
**Evidence:** `helpers.jsx` L202–218 (MATCH: O(|Q|³) options), L220–247 (COSEIZE: O(|Q|·|S|²·k)).
**Impact:** Hundreds-to-thousands of options in flat pickers on large models; render cost and findability collapse together.
**Remediation:** Above a small threshold (e.g. 50 generated options per family), replace enumeration with the existing guided composer path (L442+) plus type-ahead search.
**Effort:** M

### F-9 — Named-scenario manager over the existing statistics

**Severity:** Medium
**Evidence:** `compareScenarios`, `oneWayANOVA`, `tukeyHSD`, paired-t all shipped in `statistics.js`; experiments/sweeps persisted in `models.js`; no first-class named-scenario matrix UI.
**Impact:** The tool has Arena-Output-Analyzer-class statistics that users will never discover; scenario work happens as ad-hoc run-history archaeology.
**Remediation:** Scenario objects (name, parameter deltas, locked seed set, replication policy) with a comparison dashboard that fronts the existing ANOVA/Tukey/paired-t outputs.
**Effort:** M

### F-10 — Close the optimisation loop

**Severity:** Medium
**Evidence:** `adaptive-batch.js` already targets CI precision on the model's first goal metric; `sweep-runner.js` runs 1D/2D spaces off-thread; goals are first-class in the schema.
**Impact:** Competitors monetise this as an add-on (OptQuest). simmodlr has every ingredient except the search driver.
**Remediation:** Start with constrained coordinate descent or a small GA over sweep-param space, using adaptive batch as the inner evaluation with ranking-and-selection style budget allocation; surface as "Optimise toward goal".
**Effort:** L

### F-11 — Input-fitting transparency

**Severity:** Low
**Evidence:** `fitDistribution()` (distribution-fitting.js L290+) ranks six moment-fitted families by KS and silently falls back to Empirical at KS > 0.35; no ranked-fit report, no GoF test statistics shown to the user.
**Impact:** Practitioners trained on Input Analyzer/Stat::Fit expect to *see* the ranked candidates and decide; silent selection undermines trust in downstream results.
**Remediation:** Fit-report modal (ranked table: family, params, KS, histogram overlay); consider Anderson–Darling; expose fitting as a general utility on any distParam, not only CSV entity import.
**Effort:** M

### F-12 — A minimal transporter/conveyor primitive

**Severity:** Low (for the current target user)
**Evidence:** §5.1 — no material-handling constructs; Distance distribution covers duration only.
**Impact:** Blocks warehouse/intra-hospital-logistics segments; harms tool-comparison checklists.
**Remediation:** A capacity-constrained "mover" resource (fleet size, speed attr, request/travel/release semantics) built on existing COSEIZE + Distance machinery would cover 80% of transporter use cases without a spatial engine. Defer full conveyors.
**Effort:** L

---

## Closing note

The fair one-line summary for stakeholders: **simmodlr's engine, statistics, validation, and interoperability are at or above mid-tier commercial DES standard for service-domain modelling; its documentation describes a much weaker product than the one in the repository, and its CI does not run the tests that would prove it.** The highest-value week of work available right now is not a feature: it is F-1 (one line of YAML) plus F-2/F-3/F-4 (making the documents tell the truth), after which the genuinely strong capability story in §2 can be told with receipts.
