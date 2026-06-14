# simmodlr — Build Plan
*Living document. Update after each sprint completion.*
*Version: 1.84 | Created: 2026-04-30 | Updated: 2026-06-04 | Grounded in: Full Codebase Audit 2026-04-30*
*Branch audited: `claude/audit-part-1-orientation-lhK9K`*

---

## Important: What This Plan Is

This plan **builds on the existing application**. It does not rebuild from scratch.
Every feature is classified against its actual audit status before a prompt is written.
Claude Code must read the relevant existing files before touching anything.

### Audit Status Key Used Throughout

| Symbol | Meaning | Action |
|---|---|---|
| ✓ | Exists and works correctly | Preserve — do not rewrite |
| ~ | Exists but incomplete or incorrect | Extend or fix the existing code |
| ✗ | Absent entirely | Build new |

### Sprint Status Key

| Symbol | Meaning     |
| ------ | ----------- |
| ⬜      | Not started |
| 🔄     | In progress |
| ✅      | Complete    |
| ⏭      | Deferred    |
| ❌      | Cancelled   |

---

## Direction of Travel

simmodlr is moving from a working Forms/Tabs DES modeller into a richer modelling platform with three authoring modes over one canonical `model_json`: manual Forms/Tabs, AI Generated Model, and Visual Designer. The modelling expressiveness sprints (10–12) now extend the engine vocabulary to cover the critical real-world problem classes not yet supported.

```mermaid
flowchart LR
  PS["Pre-Sprint<br/>Audit + setup"] --> S1["Sprint 1<br/>Engine safety"]
  S1 --> S2["Sprint 2<br/>Editor completeness"]
  S2 --> S3["Sprint 3<br/>Experiment controls"]
  S3 --> S4["Sprint 4<br/>Replication + results"]
  S4 --> S5["Sprint 5<br/>Production polish"]
  S5 --> S6["Sprint 6<br/>AI results insights"]
  S6 --> S7A["Sprint 7A<br/>Architecture decisions"]
  S7A --> S7B["Sprint 7B<br/>Platform implementation"]
  S7B --> S7["Sprint 7<br/>Dynamic DES"]
  S7 --> S8A["Sprint 8A<br/>LLM provider preflight"]
  S8A --> S8["Sprint 8<br/>AI model authoring"]
  S8 --> S8B["Sprint 8B<br/>Model coherence"]
  S8B --> S8C["Sprint 8C<br/>AI quality &<br/>outcome presentation"]
  S8C --> S9A["Sprint 9A<br/>Visual preflight"]
  S9A --> S9["Sprint 9<br/>Visual Designer"]
  S9 --> S9B["Sprint 9B<br/>Visual UX hardening"]
  S9B --> S9C["Sprint 9C<br/>Execute canvas<br/>Live flow view"]
  S9C --> S10["Sprint 10<br/>Routing & Pooling"]
  S10 --> S11["Sprint 11<br/>Capacity & Output"]
  S11 --> S12["Sprint 12<br/>Assembly & Recirculation"]
  S12 --> S13["Sprint 13<br/>AI Building"]
  S13 --> PST["Post-Sprint 13<br/>Templates &<br/>Anonymous Mode"]
  PST --> S14["Sprint 14<br/>AI Natural Language<br/>Results Queries"]
  S14 --> S15["Sprint 15<br/>Shareable Results<br/>Dashboard"]
  S15 --> S16["Sprint 16<br/>Parametric Sweep &<br/>Scenario Comparison"]
  S16 --> S17["Sprint 17<br/>Statistical Output<br/>Analyzer"]
  S17 --> S18["Sprint 18<br/>2D Parametric<br/>Sweeps"]
  S18 --> S19["Sprint 19<br/>Model Import/Export &<br/>Community Gallery"]
  S19 --> S20["Sprint 20<br/>CSV Import Bridge"]
  S20 --> S21["Sprint 21<br/>SaaS Admin<br/>Platform"]
  S21 --> S22["Sprint 22<br/>Results Workspace"]
  S22 --> S23["Sprint 23<br/>UI Interface Polish<br/>& Workflow Shell"]
  S23 --> S24["Sprint 24<br/>Simulation Correctness<br/>& SimPy-Informed Remediation"]
  S24 --> S25["Sprint 25<br/>Simulation Contract<br/>Consolidation"]
  S25 --> S26["Sprint 26<br/>Resource Semantics<br/>& Waiting Behaviour"]
  S26 --> S27["Sprint 27<br/>Simulation Debugging<br/>& Explainability"]
  S27 --> S28["Sprint 28<br/>Experiments &<br/>Statistical Workbench"]
  S28 --> S29["Sprint 29<br/>Test Infrastructure,<br/>Benchmarks & CI"]
  S29 --> S30["Sprint 30<br/>Reusable Modelling<br/>Library & Templates"]
  S30 --> S31["Sprint 31<br/>Expressiveness &<br/>Observability"]
  S31 --> S32["Sprint 32<br/>Resource Reliability<br/>& Preemption"]
  S32 --> S33["Sprint 33<br/>Advanced Scheduling<br/>& Analytics"]

  classDef done fill:#143d2a,stroke:#31a24c,color:#f2fff7;
  classDef future fill:#2a2438,stroke:#a78bfa,color:#f5f3ff;
  class PS,S1,S2,S3,S4,S5,S6,S7A,S7B,S7,S8A,S8,S8B,S9A,S9,S9B,S9C,S10,S11,S12,S13,PST,S14,S15,S16,S17,S18,S19,S20,S21,S22,S23,S24,S25,S26,S27,S28,S29,S30,S31,S32,S33 done;
  class S24,S25 future;
```

### Roadmap Snapshot

| Stage | Status | Summary |
|---|---|---|
| Foundations and core DES engine | ✅ Complete | Engine safety, reproducibility, validation, editors, experiment controls, replication, CI, exports, and accessibility in place. |
| AI results analysis | ✅ Complete | Results → Explain provides read-only AI explanation and follow-up Q&A via the Supabase Edge Function proxy; saved-run comparison now lives in Results → History. |
| Platform foundation | ✅ Complete | Sprint 7B: role/settings persistence and TypeScript tooling/contracts. |
| Dynamic modelling | ✅ Complete | Sprint 7: time-varying arrival rates and resource capacity schedules. |
| AI model creation | ✅ Complete | Sprint 8A: provider-neutral LLM routing. Sprint 8: natural-language model authoring. Sprint 13: enhanced prompts, validation feedback, results-informed refinement, Suggest Model Changes. |
| Model definition coherence | ✅ Complete | Sprint 8B: queue/customer/server/service semantics aligned. |
| AI conversational quality & outcome presentation | ✅ Complete | Sprint 8C: three-phase Discover/Confirm/Generate discipline, confirmation bubble, plain-English simulation summary card, proactive refinement chips, collapsible technical diff. |
| Visual authoring | ✅ Complete | Sprint 9: graph-first authoring model. Sprint 9B: UX hardening complete. |
| Execute canvas | ✅ Complete | Sprint 9C: topology-derived live canvas, four live node components, entity token animation, configurable KPI bar, BottomPanel with Stage KPIs. |
| Modelling expressiveness | ✅ Complete | Sprints 10–12: routing, pooling, time-series, finite queues, balking, entity batching, recirculation. Complete DES vocabulary for healthcare, logistics, and manufacturing. |
| Template models and anonymous mode | ✅ Complete | Post-Sprint 13: 10 pre-built template models covering healthcare, logistics, manufacturing, and service industries. Anonymous/local storage mode for non-signed-in users. Template auto-run in Execute tab. |
| AI natural language results queries | ✅ Complete | Sprint 14: free-form natural language queries against simulation results via the AI Assistant. Query input, context-aware answers with KPI citations, follow-up question support. |
| Shareable results dashboard | ✅ Complete | Sprint 15: QR code generator, share modal with widget picker, hash-route public DashboardView. |
| Parametric sweep & scenario comparison | ✅ Complete | Sprint 16: sweep-params, sweep-runner, SweepChart with CI polygon ribbon, paired t-test scenario comparison. |
| Statistical output analyzer | ✅ Complete | Sprint 17: Welch's warm-up detection, batch-means CI, Bonferroni scenario comparison, diagnostics, analysis UI tab. |
| 2D parametric sweeps | ✅ Complete | Sprint 18: extend sweep to two dimensions — cartesian product grid, HTML table with KPI color legend, 2D scenario comparison. |
| Model import/export & community gallery | ✅ Complete | Sprint 19: graph-preserving import/export, validation-gated import, Community Gallery tab with fork-to-run, `tags` DB column. |
| CSV import bridge | ✅ Complete | Sprint 20: parse CSV, infer column types, fit distributions, generate entity type with attrDefs, CsvImportModal in Entity Types tab. |
| SaaS admin platform | ✅ Complete | Sprint 21: platform_config table, admin panel (LLM config, users, limits), multi-provider edge function (Anthropic/OpenAI/OpenCode Go), user role management. |
| Results workspace | ✅ Complete | Sprint 22: queue-specific time-series data, tested results view model, reusable ResultsWorkspace, top-level Results tab with saved-run selector and chart provenance labels. |
| UI interface polish | ✅ Complete | Sprint 23: workflow-mode navigation, persistent Model Health, Validate workspace, shared authoring shell, Results/History polish, chart upgrades, tablet refinements, mobile read/run/results view, and UI warning cleanup. |
| Simulation correctness remediation | ✅ Complete | Sprint 24 closed the urgent engine correctness defects, propagated Phase C warnings, hardened lifecycle/event context behavior, aligned persistence, and added regression coverage. |
| Simulation contract consolidation | ✅ Complete | Sprint 25 finalized the V8 policy, warm-up truncation semantics for in-flight entities, one queue/entity arbitration path, and contract-level regression coverage. |
| Resource semantics and waiting behaviour | ✅ Complete | Sprint 26 hardened waiting ownership, mirrored resource claims, deterministic idle-server arbitration, lifecycle cleanup across routing/recirculation, and the associated ADR/test/doc set. |
| Simulation debugging and explainability | ✅ Complete | Sprint 27: structured TraceEntry schema, event provenance, arbitration trace, Phase C truncation warning, Execute explainability surfaces (event log, entity inspector, canvas overlays). |
| Experiments and statistical workbench | ✅ Complete | Sprint 28: saved experiment configs, CI precision display, warm-up transient diagnostics, anomalous replication flagging, run archiving/tagging/filtering. 947/947 tests passing. |
| Test infrastructure, benchmarks and reproducibility | ✅ Complete | Sprint 29: 18 test failures fixed, M/M/c benchmark, reproducibility contract, performance envelope, golden fixtures, GitHub Actions CI, RNG independence tests. 1000/1000 tests. |
| Reusable modelling library and scenario packs | ✅ Complete | Sprint 30: 14 templates across 6 domains, ARRIVE/ASSIGN macro bugs fixed, domain+templateMeta fields, gallery redesign, in-app Patterns Guide, docs/patterns/ (6 files). |
| Expressiveness and observability | ✅ Complete | Sprint 31: clock token in Condition Builder, WIP time-average metric (Little's Law), live queue-depth time-plot in Execute canvas Charts tab. |
| Resource reliability and preemption | ✅ Complete | Sprint 32: PREEMPT macro, FAIL/REPAIR macros, MTBF/MTTR scheduling, remaining service time preservation, trace entries for preemption/failure events. |
| Advanced scheduling and analytics | ✅ Complete | Sprint 33: SPLIT/COSEIZE/MATCH macros, dynamic BATCH sizing, SPT/EDD/PRIORITY(attrName) queue disciplines, histogram collector, one-way ANOVA with Tukey HSD, resource failure UI. |
| Model versioning | ✅ Complete | Sprint 68: explicit milestone versioning, `model_versions` table, version history panel, create version dialog, structural change detection, run records reference version. |
| Plain-English UX and Results clarity | ✅ Complete | Sprint 67 baseline plus later refinements: Results sub-tabs now group Summary, Log, Entities, History, and Explain; compare lives in Results → History; Describe/Results wording is standardized. |
| Timetable schedule data separation | ✅ Complete | Sprint 73: ADR-016 — `model_schedules` Supabase table, `resolveInlineSchedules` engine function, `ScheduleManager` UI, Execute panel schedule selector, model export re-inline, `includeModelSnapshot` explicit flag. Glasgow Central `model_json` reduced from ~290 KB to ~14 KB. |
| Report presentation improvements | ✅ Complete | Sprint 76: entity name substitution, integer counts, per-stage service breakdown, angled/wrapped chart labels, Scope & Methodology section, goal status in executive summary, model diagram wired. |
| Persistent AI sidebar | ✅ Complete | Sprint 75: `✦ AI` toggle, flex-row sidebar layout, context-aware view (results vs design), model Q&A via `buildModelQueryPrompt`, overlay pattern retired. |
| Visual Designer layout engine | ✅ Complete | Sprint 77: replaced BFS grid layout with `@dagrejs/dagre` (Sugiyama framework, network-simplex ranker). Eliminates edge crossings on parallel branches; adapts spacing to graph density; loop edges excluded from traversal. 12/12 tests. |
| Visual Designer canvas visibility | ✅ Complete | Sprint 78: collapsible Node Palette (44 px icon strip, localStorage persistence), auto-hide + dismissible Inspector (slide animation, re-open handle), canvas height uncapped (clamp 400–900 px). No new dependencies. |
| Consistent panel visibility UX | ✅ Complete | Sprint 79: BottomPanel state persisted (collapsed/height/tab via localStorage); S/M/L preset height pills; Results Workspace gains 5 collapsible sections (summary, bottlenecks, cost, analysis, runtime) with chevron animation and localStorage persistence. |
| Performance optimisation | 🔄 Planned | Sprint 72 will remove legacy runtime condition evaluation, migrate old models to predicate JSON, and optimise the Phase C hot path with benchmarks and correctness gates. |
| Results API & LLM export bundle | ⬜ Planned | Sprint 82: read-only `results-api` Edge Function (JWT + share-token auth, 3 routes); `buildLLMBundle()` Markdown serialiser; "LLM Bundle (.md)" in Export… popover. No schema changes. |
| Wait time accuracy & transparency | ✅ Complete | Sprint 83: RENEGE captures wait via `buildStageRecord()`, in-progress partial waits at 0.5 weight, per-queue `waitSamplesBreakdown`, Little's Law validation gate (`avgWaitByLittle` + `waitDiscrepancy`), live metrics align with engine formula. |
| Engine fidelity — PRNG streams, shifts, purge, starvation | ✅ Complete | Sprint 84: PRNG stream isolation per process (`deriveSubSeed` + `StreamRegistry`), shift-change behavior toggle (delay/preempt/suspend), opt-in purge/run-down period, per-resource starvation duration tracking. 15 new tests. |
| Sign-in welcome dialog & AI Prompt Pack | ✅ Complete | Sprint 85: sign-in welcome dialog with four option cards (Create a Model, Access the Model Library, Build with AI Tools, Get Help); `signedInThisSession` trigger in App.jsx with `didShowWelcome` ref guard in ModelLibrary; race-condition fix (`setLoading(true)` on SIGNED_IN before `setSession()`); `buildLLMSchemaPromptPack()` bundling `docs/model-schema-for-llm.md` verbatim; ↓ AI Prompt Pack button in Model Library header. |

### Key Issues and Watchpoints

| Area | Status | Direction |
|---|---|---|
| Shift capacity mapping | ✅ Resolved | Sprint 7 uses server instance scaling. |
| TypeScript adoption | ✅ Decided | ADR-009: incremental at schema/domain boundaries; no broad rewrite. |
| Roles and settings | ✅ Implemented foundation | ADR-008: `profiles.role` + `user_settings` table. Remote migration still needs applying. |
| Dependency audit | 🔄 Watch | 4 moderate findings via Vite/Vitest/esbuild; fix requires breaking Vite 8 upgrade — deferred. |
| Time-varying arrivals refinement | ⚠️ Track | Piecewise sampling is clock-aware. Resampling pending arrivals at rate boundary is a future refinement. |
| LLM provider coupling | ✅ Preflight complete | Sprint 8A: provider-neutral contract; provider/model selection server-side. |
| SaaS tenancy/workspaces | ⏭ Deferred | Needs separate schema/RLS planning. |
| Visual Designer canvas decision | ✅ Resolved | ADR-010: `@xyflow/react`; optional layout-only `model_json.graph`. |
| Conditional routing gap | ⚠️ Tracked | RELEASE has fixed nextQueueId. Attribute-based routing achievable via C-Event pattern but not guided. Probabilistic routing absent. Both addressed in Sprint 10. |
| Multi-server resource pooling | ⚠️ Tracked | Resources are single-server only; manual C-Event duplication workaround. Addressed in Sprint 10. |
| UI workflow shell | ✅ Complete | Sprint 23 grouped ModelDetail into workflow modes, added shared authoring shells, tablet/mobile refinements, richer charts, and Results-owned statistical analysis. |
| SimPy architecture review | ✅ Applied as guidance | Sprint 24 adopted the review recommendation: partial migration only. Use SimPy idioms as design guidance; do not migrate the browser engine to Python/SimPy. Sprint 25 continues this approach for validation/warm-up/arbitration contracts. |

---

## Document History

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-30 | Initial plan from audit findings |
| 1.1 | 2026-05-01 | Post-Sprint 1 update |
| 1.2 | 2026-05-03 | Added Sprints 6, 7, 8 |
| 1.3 | 2026-05-03 | Sprint 2 complete |
| 1.4 | 2026-05-03 | Added F5.9 model delete |
| 1.5 | 2026-05-04 | Sprint 3 complete |
| 1.6 | 2026-05-04 | Resolved Vitest heap issue |
| 1.7 | 2026-05-04 | Added ADR-006 replication architecture |
| 1.8 | 2026-05-04 | Sprint 4 implementation prompts added |
| 1.9 | 2026-05-04 | Sprint 5 implementation prompts added |
| 1.10 | 2026-05-04 | Reviewed Sprints 6–8 prompts; aligned with Supabase proxy |
| 1.11 | 2026-05-04 | Sprint 4 complete — 294 tests |
| 1.12–1.21 | 2026-05-04 | Sprint 5 features F5.1–F5.9 complete; 334 tests |
| 1.22 | 2026-05-04 | ADR-007 accepted; three authoring modes established |
| 1.23 | 2026-05-04 | Sprint 6 complete — 343 tests |
| 1.24–1.25 | 2026-05-05 | Sprint 7A planning and completion; ADR-008, ADR-009 accepted |
| 1.26–1.29 | 2026-05-05 | Post-7A sequencing; Sprint 7B complete |
| 1.30 | 2026-05-05 | Sprint 7 complete — 369 tests |
| 1.31 | 2026-05-05 | Sprint 8A complete |
| 1.32–1.33 | 2026-05-05 | Sprint 8 complete — 385 tests |
| 1.34–1.35 | 2026-05-05 | Sprint 8B added and completed |
| 1.36 | 2026-05-05 | Sprint 9A complete; ADR-010 accepted |
| 1.37–1.42 | 2026-05-05/06 | Sprint 9 implementation across six increments |
| 1.43 | 2026-05-06 | Sprint 9 closed; Sprint 9B added |
| 1.44 | 2026-05-07 | Added Sprints 10, 11, 12 — Modelling Expressiveness backlog. Added Modelling Capability Coverage table. Updated roadmap flowchart, Roadmap Snapshot, Key Issues and Watchpoints, Forward Product Roadmap, Sprint History, Deferred Features Register, and Open Architectural Decisions. Added ADR-011 (conditional routing schema) and ADR-012 (recirculation/batching design). Added Sprint 9B documentation update prompt. |
| 1.45 | 2026-05-07 | Added Sprint 9C — Execute Canvas Live Flow View. Sprint 9B marked complete. Updated flowchart, Roadmap Snapshot, Key Issues, Forward Product Roadmap, Sprint History, and Deferred Features Register. Removed Execute UX from deferred list. |
| 1.46 | 2026-05-08 | Sprint 12 complete — BATCH/UNBATCH macros, loop guard, Entity.loopCount, Visual Designer back-edges. 541 tests across 60 files. Updated flowchart, Roadmap Snapshot, Sprint History, Modelling Capability Coverage, Open Architectural Decisions (ADR-012 accepted). |
| 1.47 | 2026-05-08 | Sprint 13 complete — AI Model Building Enhancement. 7-macro prompts, validation feedback loop, results-informed refinement, Suggest Model Changes button. 543 tests. |
| 1.48 | 2026-05-09 | Post-Sprint 13 features: template gallery (10 pre-built models), anonymous/local storage mode, template auto-run in Execute tab. Updated user guide to reflect all sprints. |
| 1.49 | 2026-05-09 | Sprint 14 — AI Natural Language Results Queries: `buildResultsQueryPrompt()` for free-form KPI questions, query input + conversation history in AI Assistant panel, follow-up question support, updated forward roadmap flowchart through Sprint 18. |
| 1.50 | 2026-05-10 | Sprint 15 — Shareable Results Dashboard, Sprint 16 — Parametric Sweep & Scenario Comparison complete. Sprint 17 plan defined: Welch's warm-up detection, batch-means CI, Bonferroni scenario comparison, analysis UI tab. |
| 1.51 | 2026-05-10 | Sprint 17 — Statistical Output Analyzer complete. Welch's warm-up detection, batch-means CI, Bonferroni comparison, diagnostics, Analysis tab in BottomPanel. 37 engine + 14 UI tests. |
| 1.52 | 2026-05-10 | Sprint 18 — 2D Parametric Sweeps complete. `applySweepValues()`, `generate2DSweepValues()`, `run2DSweep()`, mode toggle, HTML grid with KPI color legend, cell-click stats sidebar, 2D scenario comparison. 35 engine + 6 UI tests. |
| 1.53 | 2026-05-10 | Sprint 19 — Model Import/Export & Community Gallery complete. graph-preserving import/export, validation-gated import, Community Gallery tab, `tags` DB column, ER Triage template fix, integer formatting (0 d.p.). 21 new tests. |
| 1.56 | 2026-05-11 | Sprint 22 — Results Workspace & Chart Data Trust complete. Added queue-specific time-series data, results view model, reusable ResultsWorkspace, top-level Results tab, saved-run selector, and chart provenance labels. 44 focused tests passed; production build passed. |
| 1.57 | 2026-05-11 | Sprint 23 — UI Interface Polish & Workflow Shell defined. Labelled remaining UI roadmap as clear features/refinements with statuses, guardrails, and exit gates before further implementation. |
| 1.58 | 2026-05-11 | Sprint 23 complete. Added workflow modes, shared authoring shell, Validate workspace, Results-owned statistical analysis, upgraded charts, tablet/mobile layouts, and UI warning cleanup. 60 focused tests passed; production build passed. |
| 1.59 | 2026-05-12 | Sprint 24 defined as Simulation Correctness & SimPy-Informed Remediation. Added urgent engine correctness tracks and SimPy-informed guidance without adopting Python/SimPy as the primary runtime. |
| 1.60 | 2026-05-12 | Sprint 24 marked complete. Added Sprint 25 as Simulation Contract Consolidation, focused on V8 validation policy, warm-up semantics, and centralized queue/entity arbitration. |
| 1.62 | 2026-05-12 | Added post-Sprint-25 roadmap shaping for Sprints 26-30 and modelling scenario coverage analysis. See `docs/reviews/open-source-tool-gap-analysis.md` and `docs/reviews/sprint-26-30-roadmap-and-scenario-coverage.md`. |
| 1.63 | 2026-05-12 | Added a structured Sprint 26 plan and closure report template. Updated AGENTS.md / CLAUDE.md references and made Sprint 26 the active tracked sprint. |
| 1.64 | 2026-05-13 | Sprint 26 completed. Added explicit waiting/resource ownership contracts, ADR-013/014, capability guidance, sample models, and focused regression coverage for contention, routing, and lifecycle cleanup. |
| 1.65 | 2026-05-13 | Sprint 27 completed. Structured TraceEntry schema, event provenance, arbitration trace, Phase C truncation warning, Execute explainability surfaces (event log, entity inspector, canvas overlays). |
| 1.66 | 2026-05-14 | Sprint 28 completed. Saved experiment configs, CI precision display, warm-up transient diagnostics, anomalous replication flagging, run archiving/tagging. 947/947 tests passing. |
| 1.67 | 2026-05-14 | Sprint 29 completed. F29.0–F29.6: 18 test failures fixed, M/M/c benchmark (exits 0, 2.66% error), reproducibility contract in AGENTS.md, performance envelope doc, golden fixtures, GitHub Actions CI, RNG independence tests. |
| 1.68 | 2026-05-14 | Sprint 30 completed. 14 templates across 6 domains (4 new). ARRIVE/ASSIGN macro bugs fixed in 9+6 templates. domain/templateMeta fields added. Gallery redesign: domain filter, search, richer cards. In-app Patterns Guide (6 patterns). docs/patterns/ reference files. 1000/1000 tests. |
| 1.69 | 2026-05-14 | Sprint 31 completed. Clock token in Condition Builder, WIP time-average metric (Little's Law), live queue-depth time-plot in Execute canvas Charts tab. |
| 1.70 | 2026-05-14 | Sprint 32 completed. PREEMPT macro, FAIL/REPAIR macros, MTBF/MTTR scheduling, remaining service time preservation, trace entries for preemption/failure events. |
| 1.71 | 2026-05-15 | Sprint 33 completed. SPLIT/COSEIZE/MATCH macros, dynamic BATCH sizing, SPT/EDD/PRIORITY(attrName) queue disciplines, histogram collector, one-way ANOVA with Tukey HSD, resource failure UI. Documentation cleanup: archived 17 superseded/scratch files. |
| 1.77 | 2026-05-19 | Sprint 67 planned. Added plain-English UX and Results clarity sprint plan, closure template, capability guide, AGENTS tracking, and product-spec presentation requirements. |
| 1.78 | 2026-05-20 | Sprint 68 completed. Model versioning as explicit milestones: `model_versions` table, version history panel, create version dialog, structural change detection, run records reference version. ADR-015 created. 30 new tests. |
| 1.79 | 2026-05-22 | Sprint 8C complete — AI Generator conversational quality redesign. Three-phase elicitation (Discovery/Confirmation/Build), no fixed question cap, 7-question ordered sequence, Phase B "Here is my understanding" format enforced. Confirmation bubble with one-click sign-off. Simulation summary card (WHO ARRIVES / HOW THEY FLOW / RESOURCES / GOALS) replacing schema diff as primary view. Proactive refinement chips. 11 new tests added (6 prompt, 3 ModelDiffPreview, 2 AiGeneratedModelPanel). User Guide §2.X and Engineering Spec §6.10 updated. |
| 1.80 | 2026-05-25 | Sprint 72 planned. Added Performance Optimisation sprint plan and closure scaffold, updated AGENTS sprint tracking, and added roadmap/build-plan entries for predicate-only condition execution and Phase C optimisation. |
| 1.84 | 2026-06-04 | Sprint 82 planned. Pre-sprint assessment completed for Results API (Option 2) and LLM Export Bundle (Option 3). Sprint plan, API design spec, and AGENTS.md tracking updated. |
| 1.85 | 2026-06-09 | Sprint 83 completed. Wait time accuracy: RENEGE captures wait via `buildStageRecord()`, in-progress partial waits at 0.5 weight, `waitSamplesBreakdown` with served/reneged/inProgress counts, Little's Law validation gate (`avgWaitByLittle` + `waitDiscrepancy`), BottomPanel live metrics align with engine formula. 10 new tests. User Guide, Engineering Spec, and Product Spec updated. |
| 1.86 | 2026-06-14 | Sprint 85 completed. Sign-in welcome dialog (four option cards, `signedInThisSession` trigger, race-condition fix) and AI Prompt Pack export (`buildLLMSchemaPromptPack()`, ↓ AI Prompt Pack button in library header). User Guide, Product Spec, and Build Plan updated. |

---

## Sprint 67 — Plain-English UX & Results Clarity

**Goal:** Improve clarity, trust, and presentation across the Run, Results, Model Data, and Run History surfaces without removing advanced modelling capability.

**Status:** 🔄 Planned | **Started:** 2026-05-19

**Source documents:**
- `docs/reviews/sprint-67-plan.md`
- `docs/sprint-67-plain-language-ux-guide.md`

**Scope guardrails:**
- Build on the existing working UI. Do not rewrite `ModelDetail`, `ExperimentControls`, `ResultsWorkspace`, or `ModelHistoryTab` from scratch.
- Keep all advanced modelling and analysis capability accessible; move jargon and raw formats into helper text or progressive disclosure rather than removing them.
- Change wording, hierarchy, grouping, and disclosure patterns first. Do not introduce new engine features or schema changes in this sprint.
- Results presentation must lead with outcome and confidence before method detail.
- No new dependencies unless explicitly reviewed first.

| ID | Feature / refinement | Status | Deliverable |
|---|---|---|---|
| F67.1 | Navigation terminology standardization | 🔄 Planned | `Run`, `Results`, and `Run History` used consistently across shell navigation and action buttons. |
| F67.2 | Model Health plain-English rewrite | 🔄 Planned | Health states and issue chips lead with consequence and next action before technical codes. |
| F67.3 | Run setup copy and helper-text refresh | 🔄 Planned | Run settings are understandable without prior DES/statistics knowledge. |
| F67.4 | Results workspace layout re-order | 🔄 Planned | Summary → reliability → bottlenecks → detailed charts → raw data flow. |
| F67.5 | Results terminology and provenance rewrite | 🔄 Planned | Reliability and provenance language is plain-English-first while preserving technical detail. |
| F67.6 | Model Data / Data Sources wording simplification | 🔄 Planned | Intent-led field names and advanced disclosure for raw mapping formats. |
| F67.7 | Run History wording and summary refresh | 🔄 Planned | Outcome-focused labels and summaries. |
| F67.8 | Editor empty-state and helper-text polish | 🔄 Planned | Targeted copy updates that teach the next action. |
| F67.9 | Focused UI regression coverage | 🔄 Planned | Tests confirm new labels, headings, and layout structure. |

**Exit gate:**
- Focused UI tests pass for the touched surfaces.
- Browser smoke checks confirm consistent wording across desktop and tablet layouts.
- No advanced capability is removed while simplifying the first-layer explanation.
- Product-spec and sprint guide documents reflect the new presentation standard.

**Current checkpoint:**
- Sprint 67 planning documents are in place.
- Full regression passed on the pre-implementation baseline for this planning branch.
- Sprint 67 remains planned until the UI and copy changes are implemented and re-verified.

---

## Sprint History

| Sprint | Status | Completed | Description | Tests Passed (Total) | M/M/1 Error | Build | Notes |
|---|---|---|---|---|---|---|---|
| Pre-Sprint | ✅ Complete | 2026-04-30 | Project setup, initial audit & plan. | ~120 (120) | N/A | Success | Initial setup of CLAUDE.md, .env.example, etc. |
| Sprint 1 | ✅ Complete | 2026-05-03 | Engine safety and correctness hardening. | 182 (182) | 1.48% | Success | Fixes for XSS, C-scan restart, queue discipline, seeded RNG, validation, DistPicker. |
| Sprint 2 | ✅ Complete | 2026-05-03 | UI Editor Completeness. | 215 (215) | N/A | Success | Configured JSDOM, enhanced ConditionBuilder, etc. |
| Sprint 3 | ✅ Complete | 2026-05-04 | Experiment Controls (Warm-up, Termination, Fork Model). | 272 (272) | 1.48% | Success | ADR-002 implemented. Vitest heap issue resolved; full suite passes. |
| Sprint 4 | ✅ Complete | 2026-05-04 | Replication & Results (Workers, Batches, CI Dashboard). | 294 (294) | CI contains 9.0 | Success | Bounded worker pool implemented. |
| Sprint 5 | ✅ Complete | 2026-05-04 | Polish, Export & Production. | 334 (334) | CI contains 9.0 | Success | Error boundaries, import/export, accessibility, onboarding, owner-only delete. |
| Sprint 6 | ✅ Complete | 2026-05-04 | LLM Integration & Results Analysis. | 343 (343) | N/A | Success | AI insights panel and hosted Supabase `llm-proxy` deployed. |
| Sprint 7A | ✅ Complete | 2026-05-05 | Platform Foundation: Roles, Settings & TypeScript (planning). | Docs only | N/A | N/A | ADR-008 and ADR-009 accepted. |
| Sprint 7B | ✅ Complete | 2026-05-05 | Platform Foundation Implementation. | 33 focused | N/A | Success | Role/settings persistence, DB wrappers, `isAdmin`, TypeScript tooling/contracts complete. |
| Sprint 7 | ✅ Complete | 2026-05-05 | Dynamic Distributions & Time-Varying Resources. | 369 (369) | N/A | Success | Piecewise distributions, shift schedules, RATE_CHANGE/SHIFT_CHANGE B-events. |
| Sprint 8A | ✅ Complete | 2026-05-05 | LLM Provider Architecture Preflight. | 22 focused | N/A | Success | Provider-neutral request contract; server-side provider/model routing. |
| Sprint 8 | ✅ Complete | 2026-05-05 | AI Generated Model Authoring. | 385 (385) | N/A | Success | AI Generated Model tab, model-builder prompts, diff preview, partial apply. |
| Sprint 8B | ✅ Complete | 2026-05-05 | Model Definition Coherence. | Focused | N/A | Success | Stabilised queue/service semantics before visual designer work. |
| Sprint 8C | ✅ Complete | 2026-05-22 | AI Model Generator — Conversational Quality & Outcome Presentation. | 48 (48) | N/A | Success | Phase A/B/C elicitation discipline (no cap, 7-question sequence, Phase B format); confirm bubble; simulation summary card (WHO ARRIVES / HOW THEY FLOW / RESOURCES / GOALS); proactive refinement chips; User Guide §2.X and Engineering Spec §6.10 updated. |
| Sprint 9A | ✅ Complete | 2026-05-05 | Visual Designer Architecture Preflight. | Docs | N/A | Success | ADR-010 accepted. |
| Sprint 9 | ✅ Complete | 2026-05-06 | Visual Designer Authoring. | 38 focused | N/A | Success | Graph-first authoring, round-trip parity, drag-to-place palette, visual validation summary. |
| Sprint 9B | ✅ Complete | 2026-05-07 | Visual Designer UX Hardening. | Focused | N/A | Success | Resource editing, safe delete, richer validation, connection editing, palette affordances, entity attribute logic fixes complete. |
| Sprint 9C | ✅ Complete | 2026-05-07 | Execute Canvas — Live Flow View. | 464 (464) | N/A | Success | ExecuteCanvas (lazy), four execute-mode node components, AnimatedEdge token animation, BottomPanel with Stage KPIs, configurable KPI bar, speed slider, node-filtered log. |
| Sprint 10 | ✅ Complete | 2026-05-08 | Modelling Expressiveness — Routing & Pooling. | 508 (508) | N/A | Success | Conditional routing (routing table + probabilistic), multi-server pooling, time-series collection + SVG Charts tab, wait-time histogram, Visual Designer multi-edge labels. |
| Sprint 11 | ✅ Complete | 2026-05-08 | Modelling Expressiveness — Capacity & Output. | 523 (523) | N/A | Success | Finite queue capacity, balking (probability + condition), overflow routing, per-queue blockingCount/balkCount, Visual Designer overflow edges. |
| Sprint 12 | ✅ Complete | 2026-05-08 | Modelling Expressiveness — Assembly & Recirculation. | 541 (541) | 1.48% | Success | BATCH/UNBATCH macros, loop guard, Entity.loopCount, Visual Designer back-edges, ADR-012 accepted. |
| Sprint 13 | ✅ Complete | 2026-05-08 | AI Model Building Enhancement. | 543 (543) | N/A | Success | 7-macro prompts update, validation feedback loop, results-informed refinement, Suggest Model Changes button. |
| Post-13 | ✅ Complete | 2026-05-09 | Templates, Anonymous Mode & Template Gallery. | 543 (543) | N/A | Success | 10 pre-built template models, localStorage backend, template gallery tab, templates guide. |
| Sprint 14 | ✅ Complete | 2026-05-09 | AI Natural Language Results Queries. | 58 Sprint 14 tests | N/A | Success | F14.1–F14.6 all complete. Voice input, results query prompt, AI Assistant query input/answer rendering, follow-ups, and 58 Sprint 14 tests. |
| Sprint 15 | ✅ Complete | 2026-05-09 | Shareable Results Dashboard. | 22 Sprint 15 tests | N/A | Success | QR code generator, share modal with widget picker, hash-route DashboardView, copy/revoke per link. |
| Sprint 16 | ✅ Complete | 2026-05-09 | Parametric Sweep & Scenario Comparison. | 26 sweep tests | N/A | Success | sweep-params, sweep-runner, SweepChart, CI polygon ribbon, paired t-test, sweep CRUD wrappers. |
| Sprint 17 | ✅ Complete | 2026-05-10 | Statistical Output Analyzer. | 37 engine + 14 UI tests | 1.48% | Success | Welch's warm-up detection, batch-means CI, Bonferroni scenario comparison, analysis UI tab. |
| Sprint 18 | ✅ Complete | 2026-05-10 | 2D Parametric Sweeps. | 35 engine + 6 UI tests | 1.48% | Success | applySweepValues() multi-param, generate2DSweepValues() cartesian product + 50-point cap, run2DSweep() nested iteration, HTML table with KPI color legend, cell-click stats sidebar, 2D scenario comparison. |
| Sprint 19 | ✅ Complete | 2026-05-10 | Model Import/Export & Community Gallery. | 21 new tests | N/A | Success | graph-preserving import/export, validation-gated import with inline errors, Community Gallery tab with fork-to-run, tags DB column migration. |
| Sprint 20 | ✅ Complete | 2026-05-10 | CSV Import Bridge. | 30 focused | N/A | Success | CSV parsing, inferred entity types, distribution fitting, CsvImportModal in Entity Types. |
| Sprint 21 | ✅ Complete | 2026-05-11 | SaaS Admin Platform. | Focused | N/A | Success | platform_config, admin panel, role management, multi-provider LLM routing. |
| Sprint 22 | ✅ Complete | 2026-05-11 | Results Workspace & Chart Data Trust. | 44 focused | N/A | Success | queue-specific chart data, results view model, reusable ResultsWorkspace, top-level Results tab with saved-run selector and provenance labels. |
| Sprint 23 | ✅ Complete | 2026-05-11 | UI Interface Polish & Workflow Shell. | 60 focused | N/A | Success | Workflow-mode navigation, persistent Model Health, Validate workspace, shared authoring shell, Results-owned statistical analysis, upgraded charts, tablet/mobile layouts, and UI warning cleanup. |
| Sprint 24 | ✅ Complete | 2026-05-12 | Simulation Correctness & SimPy-Informed Remediation. | Focused + full-suite verification | N/A | Success | Fixed Phase C warning propagation, lifecycle/context integrity, initial FEL scheduling, persistence contract, shift capacity reconciliation, and added SimPy-informed JS regression coverage. |
| Sprint 25 | ✅ Complete | 2026-05-12 | Simulation Contract Consolidation. | 235 focused tests | N/A | Success | Finalized the V8 policy, warm-up truncation semantics, centralized queue/entity arbitration, contract regression coverage, and SimPy-informed documentation follow-through. |
| Sprint 26 | ✅ Complete | 2026-05-12 | Resource Semantics & Waiting Behaviour. | Focused | N/A | Success | Explicit waiting/resource ownership contracts, mirrored active claims, stale-claim protection, ADR-013/014, capability guide, sample models, regression coverage for contention/routing/recirculation. |
| Sprint 72 | 🔄 Planned | TBD | Performance Optimisation. | TBD | N/A | TBD | Remove legacy runtime condition execution, migrate models to predicate JSON, and optimise the Phase C hot path with benchmarked checkpoints. |
| Sprint 27 | ✅ Complete | 2026-05-13 | Simulation Debugging & Explainability. | Focused | N/A | Success | Structured TraceEntry schema, event provenance, arbitration trace, Phase C truncation warning, Execute explainability surfaces (event log, entity inspector, canvas overlays). |
| Sprint 28 | ✅ Complete | 2026-05-14 | Experiments & Statistical Workbench. | 947 (947) | 1.48% | Success | Saved experiment configs, CI precision display, warm-up transient diagnostics, anomalous replication flagging, run archiving/tagging/filtering. |
| Sprint 29 | ✅ Complete | 2026-05-14 | Test Infrastructure, Benchmarks & Reproducibility. | 1000 (1000) | 1.48%/2.66% | Success | F29.0–F29.6: 18 test failures fixed, M/M/c benchmark, reproducibility contract, performance envelope, golden fixtures, GitHub Actions CI, RNG independence tests. |
| Sprint 30 | ✅ Complete | 2026-05-14 | Reusable Modelling Library & Scenario Packs. | 1000 (1000) | 1.48% | Success | 14 templates (4 new), ARRIVE/ASSIGN bugs fixed, domain+templateMeta fields, gallery redesign, in-app Patterns Guide, docs/patterns/ (6 files). |
| Sprint 31 | ✅ Complete | 2026-05-14 | Expressiveness & Observability. | Focused | N/A | Success | Clock token in Condition Builder, WIP time-average metric (Little's Law), live queue-depth time-plot in Execute canvas Charts tab. |
| Sprint 32 | ✅ Complete | 2026-05-14 | Resource Reliability & Preemption. | Focused | N/A | Success | PREEMPT macro, FAIL/REPAIR macros, MTBF/MTTR scheduling, remaining service time preservation, trace entries for preemption/failure. |
| Sprint 33 | ✅ Complete | 2026-05-14 | Advanced Scheduling & Analytics. | 695 (695) | N/A | Success | SPLIT/COSEIZE/MATCH macros, dynamic BATCH sizing, SPT/EDD/PRIORITY(attrName) queue disciplines, histogram collector, one-way ANOVA with Tukey HSD, resource failure UI. |
| Sprint 69 | ✅ Complete | 2026-05-21 | AI Model Debugging: trace emission, structural checker, AI diagnosis panel, conversational debugger. | 23 passing (new) | N/A | N/A |
| Sprint 73 | ✅ Complete | 2026-05-27 | ADR-016: Separate timetable schedule data from core model JSON — `model_schedules` Supabase table, `resolveInlineSchedules(model, schedulesMap)` engine function, ScheduleManager UI (list/detail/CSV export), Execute panel schedule selector dropdown, model export re-inlines rows, `includeModelSnapshot` explicit flag, save-timeout feedback banners. | 45 new tests (14+22+9) | N/A | N/A |
| Sprint 75 | ✅ Complete | 2026-05-29 | Persistent AI Sidebar: `✦ AI` toggle button in tab bar, flex-row sidebar layout, `AiAssistantPanel` sidebar/overlay modes, context-aware view (results analysis vs model Q&A), `buildModelQueryPrompt` for design-context questions, Explain overlay retired. | 26/26 pass | N/A | N/A |
| Sprint 76 | ✅ Complete | 2026-05-29 | Report Amendments: entity name substitution, integer counts, per-stage service breakdown, angled chart labels, wrapped resource labels, Scope & Methodology section, results intro paragraph, goal status in executive summary, model image wired. | 13/13 pass | N/A | N/A |

---

## Sprint 29 — Test Infrastructure, Benchmarks and Reproducibility

**Goal:** Harden the test infrastructure by fixing pre-existing test drift, adding M/M/c analytical validation, documenting the reproducibility contract, establishing a performance envelope, and wiring benchmarks into CI.

**Status:** 🔄 In Progress | **Started:** 2026-05-14

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F29.0 | Fix 18 pre-existing test failures | ✅ | All 947 tests passing |
| F29.1 | M/M/c benchmark + CI gate | ✅ | `tests/engine/mmc_benchmark.js`, `replication-ci.test.js` extended |
| F29.2 | Reproducibility contract documentation | ✅ | AGENTS.md §9.4 Reproducibility Contract |
| F29.3 | Performance timing script + envelope doc | ✅ | `tests/engine/perf_timing.js`, `docs/performance-envelope.md` |
| F29.4 | Golden regression fixtures | ✅ | `tests/benchmarks/golden.test.js` (4 tests) |
| F29.5 | GitHub Actions CI workflow | ✅ | `.github/workflows/ci.yml` |
| F29.6 | RNG cross-replication independence test | ✅ | 3 tests added to `tests/engine/distributions.test.js` |

---

## Sprint 25 — Simulation Contract Consolidation

**Goal:** Consolidate the simulation contract after Sprint 24 by making validation policy explicit, defining warm-up semantics for in-flight entities, and centralizing queue/entity arbitration behind one engine selection service.

**Status:** ✅ Complete | **Started:** 2026-05-12 | **Completed:** 2026-05-12

**Source documents:**
- `docs/reviews/simulation-architecture-review.md`
- `docs/reviews/simpy-architecture-review.md`
- `docs/reviews/sprint-24-completion-report.md`
- Detailed sprint plan: `docs/reviews/sprint-25-simulation-contract-consolidation-plan.md`

**Scope guardrails:**
- Build on the existing `buildEngine()`, Phase A/B/C loop, macro registry, queue helpers, Execute panel, and DB wrappers.
- Do not rewrite the engine or migrate the browser runtime to Python/SimPy in this sprint.
- Preserve Pidd's Three-Phase restart rule.
- Use SimPy concepts such as `Resource`, `PriorityResource`, `Store`, process-local waiting, and explicit timeout/request races as design references for JavaScript fixes.
- Add focused regression tests before or alongside each fix.
- No new dependencies unless explicitly reviewed first.

| ID | Priority | Feature / remediation | Status | Deliverable |
|---|---:|---|---|---|
| F25.1 | P0 | V8 validation contract | ✅ | Source/sink policy is explicit and consistent across docs, validation, and Execute UI. |
| F25.2 | P0 | Warm-up semantics for in-flight entities | ✅ | Waiting, serving, scheduled-completion, and post-warm-up counting behavior is documented and tested. |
| F25.3 | P1 | Queue/entity arbitration service | ✅ | FIFO/LIFO/PRIORITY arbitration is routed through one helper/service for `ASSIGN`, `BATCH`, and `RENEGE_OLDEST`. |
| F25.4 | P1 | Contract-level regression coverage | ✅ | Tests prove the V8 policy, warm-up semantics, and arbitration equivalence. |
| F25.5 | P2 | SimPy-style documentation follow-through | ✅ | Docs explain the JavaScript equivalents of SimPy-style validation, waiting, and arbitration patterns. |

**Resolved SimPy-informed mappings:**
- Validation remains a simmodlr authoring concern rather than a SimPy runtime primitive; the V8 rule is now explicit in engine validation and Execute UX.
- Warm-up handling remains a JavaScript engine concern; instead of process suspension semantics, the engine truncates metric intervals at the warm-up boundary while preserving live entity/event context.
- Queue/resource arbitration remains custom to support Three-Phase semantics, but now follows one shared helper-led path analogous to a lightweight `Resource` / `PriorityResource` service.

**Exit gate:**
- F25.1-F25.4 complete with regression tests.
- Warm-up behavior is documented, not implied.
- Arbitration logic has one authoritative selection path.
- Focused tests pass for validation, warm-up, queue disciplines, batching, and Execute validation.
- Architecture review docs are updated with final contract decisions.

---

## Sprint 23 — UI Interface Polish & Workflow Shell

**Goal:** Make simmodlr easier to navigate for simulation modellers by grouping ModelDetail into workflow modes, keeping validation/health visible, separating build/run/results concerns, and preparing tablet/mobile-specific layouts.

**Status:** ✅ Complete | **Started:** 2026-05-11 | **Completed:** 2026-05-11

**Scope guardrails:**
- Extend the existing working UI. Do not rewrite `ModelDetail`, editors, Execute, or Results from scratch.
- Keep all DES logic entry inside structured pickers and Predicate Builder workflows.
- Keep Model Health actionable and visible across the workflow.
- Treat desktop/tablet as authoring surfaces; treat mobile as read/run/results unless a later sprint expands it.
- No new dependencies unless explicitly reviewed first.

| ID | Feature / refinement | Status | Deliverable |
|---|---|---|---|
| F23.1 | Results workspace and chart data trust follow-through | ✅ Complete | Sprint 22 Results/Charts work remains the baseline: top-level Results tab, saved-run selector, queue-specific chart data, chart provenance labels, and reusable ResultsWorkspace. |
| F23.2 | Persistent Model Health and validation routing | ✅ Complete | Health state remains visible while moving through the model workflow; issue actions route modellers to the right authoring area. |
| F23.3 | ModelDetail workflow modes | ✅ Complete | Clear modes: Visual Design, Entity Model, Event Logic, Validate, Execute, Results, and owner/admin access. |
| F23.4 | Shared 2/3-panel authoring shell | ✅ Complete | Reusable shell for Visual Design, Entity Model, and Event Logic with left mode sections, central editor/canvas workspace, and right workflow context/health panel. |
| F23.5 | Analysis migration from Execute to Results | ✅ Complete | Statistical analysis, batch-means confidence intervals, warm-up context, and distribution diagnostics now live in ResultsWorkspace; Execute stays focused on run control/live feedback. |
| F23.6 | Chart visual upgrade | ✅ Complete | Result charts now include clearer axes, accessible chart roles, peak/latest markers, endpoint legends, provenance, and data previews. |
| F23.7 | Tablet layout refinements | ✅ Complete | Authoring shells, chart grids, Model Health, Results, and run-history summary use flexible wrapping layouts for tablet widths. |
| F23.8 | Mobile read/run/results view | ✅ Complete | Phone-width ModelDetail switches to Summary, Validate, Run, Results, and History instead of the full authoring workflow. |
| F23.9 | UI warning cleanup | ✅ Complete | ExecutePanel async warnings are controlled in tests; focused table/Execute/Results tests run clean. |
| F23.10 | Sprint documentation and regression coverage | ✅ Complete | `AGENTS.md` and this build plan updated; focused UI tests and production build passed. |

**Current checkpoint:**
- Committed/pushed baseline: Sprint 22 Results workspace, chart data trust, Model Health navigation cues.
- Completed: F23.3-F23.10, including workflow modes, shared authoring shell, Results analysis migration, upgraded chart visuals, tablet/mobile refinements, run-history summary, warning cleanup, focused tests, and build verification.

**Exit gate:**
- `npm test -- model-health accessibility run-history model-results-tab results-workspace bottom-panel execute-panel` passes.
- `npm run build` passes.
- Browser smoke checks cover desktop/tablet navigation, validation routing, Execute, Results, and history.
- Any unfinished mobile/chart/tablet work is explicitly carried forward with a new sprint label.

---

## Forward Product Roadmap

ADR-007 establishes simmodlr's model-authoring architecture: one canonical `model_json`, three authoring modes.

| Sprint    | Product focus                                       | Authoring mode / capability impact                                                            |
| --------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Sprint 6  | LLM Integration & Results Analysis                  | Read-only AI interpretation; does not modify models                                           |
| Sprint 7A | Platform Foundation: Roles, Settings & TypeScript   | Architecture decisions                                                                        |
| Sprint 7B | Platform Foundation Implementation                  | Role/settings/TypeScript foundation                                                           |
| Sprint 7  | Dynamic Distributions & Time-Varying Resources      | Extends canonical model schema                                                                |
| Sprint 8A | LLM Provider Architecture Preflight                 | Provider-neutral server-side LLM routing                                                      |
| Sprint 8  | AI Generated Model Authoring                        | Second authoring mode                                                                         |
| Sprint 8B | Model Definition Coherence                          | Semantic alignment across all authoring modes                                                 |
| Sprint 9  | Visual Designer Authoring                           | Third authoring mode                                                                          |
| Sprint 9B | Visual Designer UX Hardening                        | Polish of third authoring mode — complete                                                     |
| Sprint 9C | Execute Canvas — Live Flow View                     | Topology-derived execute canvas; replaces flat server/queue lists                             |
| Sprint 10 | Modelling Expressiveness — Routing & Pooling        | Conditional routing; probabilistic routing; multi-server pooling; time-series output          |
| Sprint 11 | Modelling Expressiveness — Capacity & Output        | Finite queues; balking; waiting time distributions                                            |
| Sprint 12 | Modelling Expressiveness — Assembly & Recirculation | Entity batching; rework loops via controlled back-edges                                       |
| Sprint 13 | AI Model Building Enhancement                       | 7-macro prompts, validation feedback loop, results-informed refinement, Suggest Model Changes |
| Post-13   | Templates & Anonymous Mode                          | 10 pre-built templates; localStorage backend for non-signed-in users; template gallery tab    |
| Sprint 14 | AI Natural Language Results Queries                 | Free-form natural language queries against simulation results via the AI Assistant            |
| Sprint 15 | Shareable Results Dashboard                         | Public share links for run results with live KPI widgets                                      |
| Sprint 16 | Parametric Sweep & Scenario Comparison              | Multi-parameter exploration with side-by-side scenario comparison                             |
| Sprint 17 | Statistical Output Analyzer                         | Welch's warm-up detection, batch-means CI, Bonferroni scenario comparison, analysis UI tab    |
| Sprint 18 | 2D Parametric Sweeps                                | Cartesian product exploration of two sweepable parameters; HTML grid with KPI color legend    |
| Sprint 19 | Model Import/Export & Community Gallery             | Share and discover models in a community gallery                                              |
| Sprint 20 | CSV Import Bridge                                   | Import CSV data to infer entity types and distributions via modal in Entity Types tab           |
| Sprint 21 | SaaS Admin Platform                                 | platform_config, admin panel (LLM config/users/limits), multi-provider edge function           |
| Sprint 22 | Results Workspace & Chart Data Trust                | standalone Results tab, saved-run selector, queue-specific chart data, chart provenance labels  |
| Sprint 23 | UI Interface Polish & Workflow Shell                | complete: workflow modes, persistent Model Health, Validate workspace, shared authoring shells, responsive Results/Execute experience |
| Sprint 24 | Simulation Correctness & SimPy-Informed Remediation | complete: urgent engine correctness fixes, SimPy-style JS lifecycle/resource guidance, persistence contract alignment, regression coverage |
| Sprint 25 | Simulation Contract Consolidation | complete: V8 validation policy, warm-up semantics, centralized queue/entity arbitration, contract regression coverage |
| Sprint 26 | Resource Semantics & Waiting Behaviour | complete: explicit waiting ownership, mirrored resource claims, deterministic contention helpers, lifecycle cleanup across routing/recirculation, ADRs, sample models, and focused regression coverage |
| Sprint 27 | Simulation Debugging & Explainability | complete: structured TraceEntry schema, event provenance, arbitration trace, Phase C truncation warning, Execute explainability surfaces |
| Sprint 28 | Experiments & Statistical Workbench | complete: saved experiment configs, CI precision display, warm-up transient diagnostics, anomalous replication flagging, run archiving/tagging |
| Sprint 29 | Test Infrastructure, Benchmarks & Reproducibility | complete: 18 test failures fixed, M/M/c benchmark, reproducibility contract, performance envelope, golden fixtures, GitHub Actions CI |
| Sprint 30 | Reusable Modelling Library & Scenario Packs | complete: 14 templates across 6 domains, ARRIVE/ASSIGN bugs fixed, domain+templateMeta fields, gallery redesign, Patterns Guide |
| Sprint 31 | Expressiveness & Observability | complete: clock token in Condition Builder, WIP time-average metric, live queue-depth time-plot |
| Sprint 32 | Resource Reliability & Preemption | complete: PREEMPT, FAIL/REPAIR macros, MTBF/MTTR scheduling, remaining service time preservation |
| Sprint 33 | Advanced Scheduling & Analytics | complete: SPLIT/COSEIZE/MATCH macros, dynamic BATCH, SPT/EDD/PRIORITY queues, histograms, ANOVA with Tukey HSD |
| Sprint 66 | Visual Designer Badges + Execute Panel UX | complete: node badges, Execute toolbar consolidation, Results chart formatting improvements |
| Sprint 67 | Plain-English UX & Results Clarity | planned: wording simplification, Results information hierarchy, progressive disclosure of advanced detail |
| Sprint 69 | AI Model Debugging | complete: F69.1 structured trace emission from engine, F69.2 pre-run structural model checker (CHK-001–CHK-008), F69.3 post-run AI diagnosis panel (Diagnostics tab, FindingCard list), F69.4 conversational debugging chat with full model+trace context |
| Sprint 8C | AI Generator conversational quality | complete: improves elicitation depth and outcome clarity in the AI Generated Model authoring mode |

The existing Forms/Tabs editor remains the stable manual authoring mode throughout. The retired split-pane SVG hybrid designer is not part of the forward roadmap.

**Future roadmap items (added Sprint 69):**
- Future: Trace replay/step-through visualiser — playback of recorded trace records in the Execute canvas
- Future: AI-suggested model fixes — auto-apply from diagnosis findings (one-click patch generation from CRITICAL findings)

### Modelling Capability Coverage

| Capability | Status | Sprint |
|---|---|---|---|
| Single/multi-stage sequential pathways | ✅ Supported via RELEASE chain | — |
| FIFO / LIFO / Priority queue disciplines | ✅ Supported | — |
| Reneging / abandonment | ✅ RENEGE macro | — |
| Stochastic service and inter-arrival times | ✅ 8 distribution types + empirical CSV | — |
| Time-varying arrival rates and shift schedules | ✅ Piecewise distributions + RATE_CHANGE/SHIFT_CHANGE | — |
| Warm-up period and termination controls | ✅ Manual warm-up, time/event/condition-based termination | Sprint 3 |
| Multi-replication with 95% CI | ✅ Worker pool, aggregate stats, CI table | Sprint 4 |
| AI-generated model authoring | ✅ Chat-based model builder with validation feedback and refinement | Sprint 8 |
| Visual graph authoring | ✅ @xyflow/react graph-first designer with round-trip parity | Sprint 9 |
| Conditional routing (entity-attribute branching) | ✅ RELEASE routing table; Visual Designer shows labelled condition edges | Sprint 10 |
| Probabilistic routing (stochastic branch probability) | ✅ RELEASE probabilisticRouting; seeded RNG sampling | Sprint 10 |
| Multi-server resource pooling (capacity > 1) | ✅ Entity-per-instance model; pool size field in UI; V19 validation | Sprint 10 |
| Time-series output (queue length / utilisation over time) | ✅ Opt-in collectTimeSeries flag; SVG Charts tab in BottomPanel | Sprint 10 |
| Finite queues and capacity-limited buffers | ✅ Capacity field on Queue; ARRIVE enforces limit; overflow routing | Sprint 11 |
| Balking (probabilistic queue joining) | ✅ balkProbability + balkCondition on arrival B-events | Sprint 11 |
| Waiting time distribution and percentiles | ✅ waitDist p50/p90/p95/p99 + 12-bin histogram in Charts tab | Sprint 10 |
| Entity batching / assembly | ✅ BATCH (C-Event) + UNBATCH (B-Event) macros; queue-accumulation model | Sprint 12 |
| Recirculation / rework loops | ✅ Controlled back-edges with loop:true flag; maxLoopCount guard | Sprint 12 |
| Full staff rostering (resource shift schedules) | ~ Partial — piecewise NHPP implemented; full rostering incomplete | Sprint 13+ |
| AI natural language results queries | ✅ Free-form questions + answers with KPI citations and conversation history | Sprint 14 |
| Shareable results dashboard | ✅ QR code generator; hash-route public DashboardView; share modal with widget picker and copy/revoke per link | Sprint 15 |
| Parametric sweep and parameter exploration | ✅ Sweepable param discovery; range+step config; multi-point orchestration; SweepChart with CI polygon ribbon and results table | Sprint 16 |
| Scenario comparison with statistical confidence | ✅ Paired-t confidence interval on differences; side-by-side KPI comparison for sweep points | Sprint 16 |
| Clock token in conditions | ✅ `clock` variable available in Condition Builder for time-based logic | Sprint 31 |
| WIP time-average metric | ✅ `avgWIP` exposed in summary; Little's Law validation (avgWIP ≈ λ × avgSojourn) | Sprint 31 |
| Live queue-depth time-plot | ✅ QueueDepthTimePlot component in Execute canvas Charts tab; one line per queue, colour-coded | Sprint 31 |
| Resource preemption | ✅ PREEMPT(ServerType) macro; interrupted entities re-queued with `_remainingService` preserved | Sprint 32 |
| Resource breakdowns and repair | ✅ FAIL/REPAIR macros; `failed` server status; MTBF/MTTR scheduling via server entity type distributions | Sprint 32 |
| Remaining service time preservation | ✅ `_scheduledDuration` stored on server; remaining service calculated and used on re-seize after preemption/failure | Sprint 32 |
| SPLIT macro | ✅ Creates N-1 clones of context entity; tracks parent-child relationships via `_splitParent`/`_splitChildren`/`_splitFrom`/`_splitIndex` | Sprint 33 |
| COSEIZE macro | ✅ Atomically seizes multiple server types simultaneously; all-or-nothing claim | Sprint 33 |
| MATCH macro | ✅ Pairs entities from two queues into batch entity; validates entity types against typeA/typeB parameters | Sprint 33 |
| Dynamic BATCH sizing | ✅ Batch size from entity attribute: `BATCH(Queue, Entity.attrName)` | Sprint 33 |
| SPT/EDD/PRIORITY queue disciplines | ✅ SPT (shortest processing time), EDD (earliest due date), PRIORITY(attrName) — attribute-based sorting | Sprint 33 |
| Histogram collection | ✅ Equal-width and Freedman-Diaconis automatic bin selection; pure statistical utility | Sprint 33 |
| One-way ANOVA with Tukey HSD | ✅ ANOVA F-test with Tukey HSD post-hoc for pairwise comparisons; pure statistical utility | Sprint 33 |
| Resource failure visualization | ✅ Failed server dots (red) and warning badge on Execute canvas Activity nodes | Sprint 33 |

---

## What Already Exists — Audit Summary

Before reading the sprint plan, understand what the existing app provides.
Claude Code must never rewrite a working component — only extend or fix it.

### Working and Must Be Preserved (✓)

| Component | File(s) | Notes |
|---|---|---|
| Three-Phase engine — Phase A, B, C | `src/engine/index.js` | Structurally correct |
| All five macros | `src/engine/macros.js` | ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE correct |
| ~369 engine unit tests | `tests/` | Node environment, Vitest |
| FIFO/LIFO/Priority queue discipline | `src/engine/entities.js` | All disciplines correct |
| IDLE/BUSY resource tracking | `src/engine/macros.js` | idleOf/busyOf helpers correct |
| EntityTypeEditor + AttrEditor | `src/ui/editors/index.jsx` | Create, patch, delete working |
| BEventEditor with schedule rows | `src/ui/editors/index.jsx` | Working |
| CEventEditor + ConditionBuilder | `src/ui/editors/index.jsx` | Working structure |
| QueueEditor | `src/ui/editors/index.jsx` | Working |
| AI Generated Model tab | `src/ui/editors/index.jsx` | Working |
| Visual Designer tab | `src/ui/editors/index.jsx` | Working (Sprint 9B hardening in progress) |
| Run history table | `src/ui/execute/index.jsx` | Last 20 runs displayed |
| VisualView + StepLog + EntityTable | `src/ui/execute/index.jsx` | Working |
| CI dashboard | `src/ui/execute/index.jsx` | Multi-replication results working |
| Supabase auth + session | `src/App.jsx`, `src/db/supabase.js` | Auth listener working |
| Model CRUD wrappers | `src/db/models.js` | Working |

---

## Pre-Sprint through Sprint 9

*(Full prompt text for Pre-Sprint through Sprint 9 is preserved from the live document. All tasks are ✅ Complete. Refer to previous versions or the git history for individual feature prompts.)*

---

## Sprint 9B — Visual Designer UX Hardening *(complete)*

**Goal:** Harden and polish the Visual Designer now that the core graph-first authoring model and Forms/Tabs round-trip are working.

**Status:** ✅ Complete | **Started:** 2026-05-06 | **Completed:** 2026-05-07
**Prerequisite:** Sprint 9 complete.

**Architectural constraint:** Sprint 9B is refinement over the proven Sprint 9 model. Visual edits still update canonical model data first; `model_json.graph` remains layout metadata only.

| Feature | Status | Description |
|---|---|---|
| F9B.1 — Activity resource/server editing in inspector | ✅ | Server/resource picker in Activity inspector |
| F9B.2 — Safe node deletion with dependency warnings | ✅ | Dependency warnings before mutation |
| F9B.3 — Connection edge delete/re-route workflow | ✅ | Remove or redirect existing edges from canvas |
| F9B.4 — Richer validation panel with canvas highlighting | ✅ | Validation errors link to and highlight affected node |
| F9B.5 — Palette drag/drop affordances, fit/reset layout | ✅ | Drag directly onto canvas; fit-to-view and reset-layout controls |
| F9B.6 — Browser review and round-trip regression hardening | ✅ | Full regression pass across all three authoring modes |
| F9B.7 — Bundle/code-splitting review | ✅ | Visual Designer lazy-loaded |
| F9B.8 — Review Observations 0605 coherence pass | ✅ | Complete |
| F9B.9 — Entity Attribute Logic Fixes | ✅ | EntityFilterBuilder restored; AttrEditor unified to DistPicker |

### Sprint 9B Completion Gate

```bash
npm test -- visual-designer c-event-editor accessibility model-export
npm test -- ai-generated-model-panel b-event-editor c-event-editor model-export model-import accessibility execute-panel
npm run build
# Manual: create, connect, edit resource/timing, save, reload, and execute a visual model
# Manual: delete each node type and confirm dependencies are explained before mutation
# Manual: invalid connections and validation warnings highlight the affected node
# Manual: generate a simple queue with AI and confirm ARRIVE, ASSIGN, COMPLETE scheduling populated
```

### Sprint 9B Documentation Update *(run at completion, before commit)*

```
Sprint 9B of simmodlr is complete. Before committing, update ALL of:

1. docs/addition1_entity_model.md
   - If any macro behaviour changed or was clarified during 9B, update
     the relevant macro specification section
   - If model_json schema changed (e.g. new graph metadata fields),
     update Section 3 (Model JSON Structure)

2. CLAUDE.md
   - Update "Current Sprint" to Sprint 10
   - Record any new architectural decisions or conventions introduced

3. docs/simmodlr_Build_Plan.md
   - Set Sprint 9B status to ✅ Complete with completion date
   - Record final test count in Sprint History table
   - Add any new deferred items to the Deferred Features Register

4. docs/decisions/ — add any new ADRs accepted during this sprint

Show me the diff for each document before writing it.
```

---

## Sprint 8C — AI Model Generator: Conversational Quality & Outcome Presentation *(complete)*

**Goal:** Transform the AI Generator from a technically correct but conversationally blunt JSON builder into a consultant-grade guided experience with a confirmation step, plain-English outcome presentation, and proactive refinement chips.

**Status:** ✅ Complete | **Started:** 2026-05-22 | **Completed:** 2026-05-22
**Prerequisite:** Sprint 9B complete.
**Files changed:** `src/llm/model-builder-prompts.js`, `src/ui/editors/ModelDiffPreview.jsx`, `src/ui/editors/AiGeneratedModelPanel.jsx`, `docs/simmodlr_User_Guide.md`, `docs/simmodlr_Engineering_Spec.md`

| Feature | Action |
|---------|--------|
| F8C.1 — Consultant-mode system prompt | Replace intent-classifier prompt with Phase A/B/C elicitation discipline in `model-builder-prompts.js`. Removed 2-question cap; added 7-question ordered discovery sequence; enforced Phase B "Here is my understanding" format. |
| F8C.2 — Confirmation step in chat panel | Add `"confirm"` intent handling with styled `ConfirmBubble` and one-click "Looks right — build it" / "Something's wrong" buttons. |
| F8C.3 — Plain-English outcome card | Expanded `SimulationSummaryCard` with WHO ARRIVES sentence, HOW THEY FLOW per-stage, RESOURCES per server, GOALS section. Technical diff collapsed by default behind toggle. |
| F8C.4 — Proactive refinement chips | Pill-shaped chips after build/refine responses. `C.accent` border, transparent background, hover fill. Cleared on chip click or manual send. |
| F8C.5 — Documentation update | Updated User Guide §2.X with spec-exact three-step flow. Updated Engineering Spec §6.10: `confirm` intent, `suggestions[]`, Phase A/B/C operating modes, question-cap removed. |

**Completion checklist:**
- [x] Phase A/B/C prompt structure in `buildModelBuilderSystemPrompt()` — no fixed cap, 7-question sequence, Phase B format enforced
- [x] `"confirm"` intent handled in chat panel with styled confirmation bubble
- [x] Simulation summary card (WHO ARRIVES / HOW THEY FLOW / RESOURCES / GOALS) replaces schema diff as primary outcome view
- [x] Refinement chips render and submit after build/refine responses; cleared correctly
- [x] User Guide §2.X rewritten with spec-exact three-step flow and tips
- [x] Engineering Spec §6.10 updated — `confirm` intent, `suggestions[]`, Phase A/B/C, question-cap removed
- [x] 11 new tests added (6 prompt, 3 ModelDiffPreview, 2 AiGeneratedModelPanel); all pass
- [x] Existing tests unaffected

---

## Sprint 9C — Execute Canvas: Live Flow View *(complete)*

**Goal:** Replace the current flat server-card / queue-lane Execute view with a topology-derived live canvas that mirrors the model's flow structure. The canvas reuses `@xyflow/react` and `model_json.graph` layout metadata already established by the Visual Designer, rendering live simulation state as overlays on the same node shapes the modeller knows from authoring.

**Status:** ✅ Complete | **Started:** 2026-05-07 | **Completed:** 2026-05-08
**Prerequisite:** Sprint 9B complete.

**Architectural constraint:** This sprint is UI-only. No engine changes. The canvas reads engine output (entity states, queue depths, server statuses, step log) from the existing results/state objects — it does not change how that data is produced. The Visual Designer canvas node components are not modified — new execute-mode node components are created alongside them.

### Design Principles

**Topology-derived layout.** Stage order and spatial arrangement come from `model_json.graph` — whatever position the modeller set in the Visual Designer is the position in the execute canvas. No separate layout step. A model drawn left-to-right as a flow produces a left-to-right execute view automatically.

**Execute-mode node components.** Each of the four node types (Source, Queue, Activity, Sink) gets a dedicated execute-mode React component that renders live state instead of edit controls. These are new components — the authoring-mode node components are not touched.

**Server pool cards, not server instance cards.** A resource with N servers renders as a compact dot-grid (■ BUSY, □ IDLE) with a utilisation percentage. "Server #1 Clerk / Server #2 Clerk" disappears entirely. This is compatible with Sprint 10's multi-server pooling from day one.

**Entity token animation.** Entities are shown as small coloured dots (colour by entity type). Tokens animate along edges when routing events fire. Animation can be toggled off for performance on large models (stored in `user_settings`).

**Bottom panel.** A tabbed panel below the canvas contains Step Log, Entity Table, Stage KPIs, and (from Sprint 10) Charts. The panel is collapsible to maximise canvas space.

**User-adjustable preferences (stored in `user_settings`):**
- Entity token animation on/off
- Bottom panel collapsed/expanded
- Which KPIs are pinned to the top stats bar
- Canvas node positions (already persisted via `model_json.graph`)

**Not user-adjustable:** which queue belongs to which activity (model fact); the fundamental flow topology.

### Feature Table

| Feature | Audit Status | Action |
|---|---|---|
| F9C.1 — Execute canvas shell with `@xyflow/react` | ✗ | New execute-mode canvas in `execute/index.jsx`; reads `model_json.graph` for layout |
| F9C.2 — Execute-mode Source node component | ✗ | Shows inter-arrival rate, next arrival time, arrival pulse animation |
| F9C.3 — Execute-mode Queue node component | ✗ | Shows queue depth badge, entity token dots (colour by type), discipline badge, live sparkline |
| F9C.4 — Execute-mode Activity node component | ✗ | Shows server pool dot-grid (■/□), busy/capacity fraction, utilisation %, service completion animation |
| F9C.5 — Execute-mode Sink node component | ✗ | Shows total served, throughput rate, mean sojourn time |
| F9C.6 — Entity token animation on edges | ✗ | Tokens animate along edges on routing events; toggle off via `user_settings` |
| F9C.7 — Global KPI stats bar | ~ | Extend existing Arrived/Served/Reneged/Waiting bar; make KPIs user-pinnable |
| F9C.8 — Bottom panel: tabbed detail area | ~ | Reorganise existing StepLog, EntityTable into collapsible tabbed panel; add Stage KPIs tab |
| F9C.9 — Stage KPIs tab | ✗ | Per-queue and per-server live stats table: mean wait, max wait, utilisation, throughput |
| F9C.10 — Step / speed controls | ✗ | Step-through (one Phase A/B/C cycle), Run, Pause, Stop, speed slider (0.5×–10×) |
| F9C.11 — Node-filtered step log | ~ | Clicking a canvas node filters Step Log to that node's events only |
| F9C.12 — Animation preference persistence | ✗ | Token animation on/off stored in `user_settings` via Sprint 7B wrappers |
| F9C.13 — Documentation update | ✗ | Update CLAUDE.md, Build Plan; remove Execute UX from Deferred register |

### Sprint 9C Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 9C of simmodlr.

Sprint 9C goal: Execute Canvas — Live Flow View.
This sprint replaces the flat server-card / queue-lane Execute view
with a topology-derived live canvas using @xyflow/react.

This is a UI-only sprint. The engine, macros, and data model are
NOT changed. The canvas reads existing engine output.

Completed in Sprints 1–9B: [paste sprint history summary]

Features:
  F9C.1  — Execute canvas shell with @xyflow/react
  F9C.2  — Execute-mode Source node component
  F9C.3  — Execute-mode Queue node component
  F9C.4  — Execute-mode Activity node component (server pool dot-grid)
  F9C.5  — Execute-mode Sink node component
  F9C.6  — Entity token animation on edges
  F9C.7  — Global KPI stats bar (extend existing)
  F9C.8  — Bottom panel: collapsible tabbed detail area
  F9C.9  — Stage KPIs tab (per-queue, per-server live stats)
  F9C.10 — Step/speed controls
  F9C.11 — Node-filtered step log
  F9C.12 — Animation preference in user_settings
  F9C.13 — Documentation update

CRITICAL:
  - The existing execute/index.jsx is extended, not replaced
  - Visual Designer authoring-mode node components are NOT modified —
    create new execute-mode components alongside them
  - Layout is derived from model_json.graph — same source as Visual Designer
  - Server pool dot-grid must work for capacity = 1 (current models)
    and capacity > 1 (Sprint 10 multi-server pooling, coming next)
  - Token animation must degrade gracefully: if disabled in user_settings,
    queue depths and server statuses still update correctly
  - The existing single-replication VisualView and multi-replication CI
    dashboard must still function — the new canvas is the default view
    for the running simulation; results/CI display is unchanged

Definition of done:
  - Post Office model (two clerks, one queue) renders correctly on
    the execute canvas with server pool showing ■■ BUSY / □□ IDLE
  - Two-stage model (Triage → Consultant) renders as two spatial
    stages with queue and server pool visible per stage
  - Step-through advances one cycle and the canvas updates
  - Entity tokens animate along edges during a live run
  - Bottom panel tabs (Step Log, Entity Table, Stage KPIs) all work
  - Clicking a node filters the Step Log to that node
  - Animation toggle persists across sessions via user_settings
  - npm test -- --run passes with zero failures
  - npm run build succeeds
```

### Sprint 9C Analysis Prompt *(run before any code — read-only session)*

```
Re-read CLAUDE.md. Do not write any code in this session.
Sprint 9C analysis: Execute Canvas Live Flow View.

Read the following files in full and report findings:

  1. src/ui/execute/index.jsx
     - Show the current component structure in full
     - Show how VisualView, StepLog, and EntityTable are currently
       structured and what data they receive
     - Show how the simulation run loop drives UI updates
       (callbacks, state updates, refs)
     - Show the current server bay and queue lane rendering code
     - Show the existing KPI stats bar (Arrived/Served/Reneged/Waiting)

  2. src/ui/editors/index.jsx (Visual Designer section only)
     - Show the @xyflow/react canvas setup: ReactFlow component props,
       nodeTypes registration, edge types
     - Show the existing Source, Queue, Activity, Sink node components
       (the authoring-mode ones) — structure and props only, not full impl
     - Show how model_json.graph layout metadata is read and applied

  3. src/engine/index.js
     - Show the shape of the live state object passed back during a run:
       what fields are available at each clock tick for queue depths,
       server statuses, entity positions, and step log entries?

  4. src/db/models.js (user_settings section)
     - Show fetchUserSettings() and saveUserSettings() — confirm the
       settings shape and that they are available in the Execute component

  5. package.json
     - Confirm @xyflow/react version installed
     - Confirm whether any animation or transition library is present

After reading, answer:
  Q1. How does the run loop currently push live state to the UI?
      Is it callback-based, polling, or React state batching?
  Q2. What fields are available in the live state object per clock tick?
      Specifically: queue depths, server idle/busy counts, entity locations?
  Q3. How are the Visual Designer node components structured?
      Are they class or functional components? What props do they receive?
  Q4. Can execute-mode node components be registered in the same
      nodeTypes map alongside authoring-mode ones, or does the canvas
      need a separate ReactFlow instance?
  Q5. Is user_settings currently loaded in the Execute component,
      or would it need to be fetched there for the first time?
  Q6. What is the current rendering path for the Post Office model's
      two clerks? Are they rendered as separate named cards or already
      grouped by server type?

Findings and answers only. No implementation.
```

### Sprint 9C Implementation Prompts

**F9C.1–F9C.5 — Canvas shell and execute-mode node components**

```
Re-read CLAUDE.md. Sprint 9C F9C.1–F9C.5: Execute Canvas Shell and Node Components.

Verify the analysis findings before proceeding.

The existing execute/index.jsx has a VisualView component that renders
server bays and queue lanes as flat lists. We are replacing this with a
topology-derived @xyflow/react canvas. The existing CI dashboard, results
display, and multi-replication UI are NOT changed.

TASK F9C.1 — Execute canvas shell
  Read src/ui/execute/index.jsx in full before editing.
  Read the Visual Designer canvas setup in src/ui/editors/index.jsx before editing.

  Add a new ExecuteCanvas component (can be a new file
  src/ui/execute/ExecuteCanvas.jsx):
    - Uses @xyflow/react with a separate nodeTypes map for execute-mode nodes
    - Reads model_json.graph for node positions and derives topology from
      canonical model_json (same derivation helper already used by Visual Designer)
    - Receives live simulation state as props: queueDepths, serverStates,
      entityLocations, clock, isRunning
    - Replace the existing VisualView component with ExecuteCanvas in the
      Execute tab — VisualView can be retained as a fallback if no graph
      metadata exists

TASK F9C.2 — ExecuteSourceNode
  Props: nodeId, data (inter-arrival distribution label, nextArrivalTime, isRunning)
  Renders: source label, next arrival countdown, subtle pulse on arrival event
  Style: green border matching authoring-mode Source node colour token

TASK F9C.3 — ExecuteQueueNode
  Props: nodeId, data (queueName, depth, discipline, entities[], capacity)
  Renders:
    - Queue name and discipline badge
    - Depth number badge (colour: green 0, amber 1–3, red 4+)
    - Entity token dots: up to 8 visible (●), then "+N more" label
      Dot colour by entity type (use entity type colour tokens or cycle a palette)
    - Live sparkline: queue depth over last 20 clock ticks
      (store a rolling 20-value array in component state)
  Style: blue border matching authoring-mode Queue node colour token

TASK F9C.4 — ExecuteActivityNode
  Props: nodeId, data (serverTypeName, capacity, busyCount, idleCount,
         utilisation, isRunning, lastCompletionAt)
  Renders:
    - Server type name
    - Pool dot-grid: capacity dots in a wrap grid, each ■ (busy, teal) or
      □ (idle, muted). Maximum 12 dots visible; if capacity > 12 show
      "N/capacity busy" text instead
    - Utilisation % label
    - Subtle flash animation on lastCompletionAt change
  Style: purple border matching authoring-mode Activity node colour token
  NOTE: capacity defaults to 1 for all current models. The dot-grid for
  capacity=1 renders one dot only — this is correct and matches Sprint 10
  multi-server pooling from day one.

TASK F9C.5 — ExecuteSinkNode
  Props: nodeId, data (sinkName, totalServed, throughputPerHour, meanSojourn)
  Renders:
    - Sink label
    - Total served count (large)
    - Throughput / hr
    - Mean sojourn time
  Style: red border matching authoring-mode Sink node colour token

After all tasks:
  npm test -- --run
  npm run build
  Manual: Post Office model — confirm two clerks render as one Activity node
  with a 2-dot pool (□□ idle before run, ■■ busy during run)
  Manual: confirm queue node shows depth badge updating live
```

**F9C.6 — Entity token animation**

```
Re-read CLAUDE.md. Sprint 9C F9C.6: Entity Token Animation.

Read src/ui/execute/ExecuteCanvas.jsx before editing.
Read src/db/models.js user_settings wrappers before editing.

Add animated entity tokens that travel along edges when routing events fire.

Implementation approach:
  - Listen for routing events in the step log stream
    (ARRIVE, ASSIGN/SEIZE, COMPLETE, RELEASE events)
  - On each routing event, spawn a token element on the relevant edge
  - Animate the token from source handle to target handle over
    300ms (CSS transition or requestAnimationFrame)
  - Token colour matches the entity type
  - Maximum 5 simultaneous tokens per edge to avoid visual clutter
  - If animation is disabled in user_settings, skip spawning entirely —
    queue/server state still updates correctly via node props

Animation toggle:
  - Load user_settings on Execute mount
  - Default: animation enabled (true)
  - Toggle button in the controls bar: "● Animate" / "○ Animate"
  - Save to user_settings via saveUserSettings() on toggle

Write a UI test:
  - Animation toggle saves to user_settings mock
  - With animation disabled, routing events do not spawn token elements
```

**F9C.7–F9C.9 — KPI bar, bottom panel, and stage KPIs**

```
Re-read CLAUDE.md. Sprint 9C F9C.7–F9C.9: KPI Bar, Bottom Panel, Stage KPIs.

Read src/ui/execute/index.jsx in full before editing.

TASK F9C.7 — Global KPI stats bar
  The existing Arrived / Served / Reneged / Waiting bar is correct but static.
  Extend (do not replace):
    - Make the four KPI slots user-configurable: each slot can show one of:
      Arrived, Served, Reneged, Waiting, Sim Clock, Active Entities
    - Store pinned KPI selection in user_settings
    - Default to current four (Arrived, Served, Reneged, Waiting)
    - Small edit icon on hover opens a slot picker dropdown

TASK F9C.8 — Bottom panel: collapsible tabbed detail area
  Reorganise the area below the canvas (currently Step Log + Entity Table
  rendered together) into a tabbed panel:
    Tab 1: Step Log (existing component — do not rewrite)
    Tab 2: Entity Table (existing component — do not rewrite)
    Tab 3: Stage KPIs (new — F9C.9)
    Tab 4: Charts (placeholder tab, disabled — activated in Sprint 10 F10.5)
  Add a collapse/expand toggle (chevron button) that hides the panel body,
  giving the canvas full height. Collapsed state stored in component state
  (not user_settings — it is session-local).

TASK F9C.9 — Stage KPIs tab
  A compact live-updating table with one row per queue and one row per
  server type:

  Queue rows:
    Queue name | Current depth | Mean wait | Max wait | Total arrivals | Reneged

  Server rows:
    Server type | Capacity | Busy | Utilisation % | Mean service time | Completions

  Data source: derived from existing engine results/live state — no new
  engine instrumentation needed in this sprint.
  Update frequency: every Phase A clock advance (same as canvas node props).

Write UI tests:
  - Bottom panel renders three active tabs (Charts disabled)
  - Collapse toggle hides panel body
  - Stage KPIs tab shows at least one queue row and one server row
```

**F9C.10–F9C.11 — Step/speed controls and node-filtered log**

```
Re-read CLAUDE.md. Sprint 9C F9C.10–F9C.11: Controls and Filtered Log.

Read src/ui/execute/index.jsx in full before editing.

TASK F9C.10 — Step/speed controls
  The existing Run / Stop controls are functional but minimal.
  Extend the controls bar (do not replace):
    ◀ Step  |  ▶▶ Run  |  ‖ Pause  |  ■ Stop  |  Speed: [slider] ×N

  Step button: advance exactly one Phase A + Phase B + Phase C cycle.
    Enabled only when simulation is paused or not yet started.
    Canvas updates after each step.

  Speed slider: multiplier for the animation frame rate between clock ticks.
    Range: 0.5× (slow, good for debugging) to 10× (fast).
    Does not affect engine execution speed — only the cadence at which
    the UI renders intermediate states.
    Default: 1×.

  Pause/Resume: pauses live animation at the current clock tick;
    engine continues executing; canvas catches up when resumed.
    (If engine runs synchronously in main thread, pause halts the run loop.)

  Implementation note: read the current run loop mechanism from the
  analysis session before implementing. If the engine runs in a Worker,
  pause sends a PAUSE message; if synchronous, pause suspends the
  setInterval / requestAnimationFrame driving UI updates.

TASK F9C.11 — Node-filtered step log
  Clicking a node on the execute canvas filters the Step Log tab to
  show only events involving that node (by nodeId / name).
  A "Show all" button clears the filter.
  The filter is visual only — it does not affect the underlying log array.
  Store selected nodeId in component state (not user_settings).

Write a UI test:
  - Clicking a node sets the active filter
  - Step Log renders only matching events when filter is active
  - "Show all" clears the filter
```

**F9C.13 — Sprint 9C documentation update**

```
Sprint 9C is feature-complete. Before committing, update ALL of:

1. CLAUDE.md
   - Update "Current Sprint" to Sprint 10
   - Add ExecuteCanvas component to the UI Layer description
   - Add execute-mode node types (ExecuteSourceNode, ExecuteQueueNode,
     ExecuteActivityNode, ExecuteSinkNode) to the component inventory
   - Note that model_json.graph drives both Visual Designer layout and
     Execute canvas layout
   - Note that animation preference is stored in user_settings

2. docs/simmodlr_Build_Plan.md
   - Set Sprint 9C status to ✅ Complete with completion date
   - Record final test count in Sprint History table
   - Remove "Execute running-model UX" from Deferred Features Register
     (it is now resolved)
   - Update Roadmap Snapshot: Execute canvas stage to ✅ Complete

3. No changes to docs/addition1_entity_model.md — this sprint adds
   no new macros, schema fields, or engine behaviour.

Show me the diff for each document before writing it.
```

### Sprint 9C Completion Gate

```bash
npm test -- --run                       # 464 tests — zero failures
npm test -- ui                          # ExecuteCanvas, node component, bottom panel tests pass
npm test -- execute-panel               # Existing execute panel tests still pass
npm run build                           # Succeeds
# Manual: Post Office model (2 clerks, 1 queue)
#   - Execute canvas renders with one Activity node (2-dot pool) and one Queue node
#   - Before run: dots show □□ idle
#   - During run: dots show ■■ busy; queue depth badge increments; tokens animate
#   - Step-through advances one cycle; canvas updates
# Manual: Two-stage model (Triage → Consultant)
#   - Canvas shows two spatial stages with clear left-to-right flow
#   - Stage KPIs tab shows two queue rows and two server rows
# Manual: Click Triage Queue node → Step Log filters to Triage events only
# Manual: Toggle animation off → queue/server state still updates correctly
# Manual: Animation preference persists after page reload
# Manual: Bottom panel collapse/expand works; Charts tab is present but disabled
```

---



**Goal:** Deliver the three highest-priority modelling capability gaps — conditional/probabilistic entity routing, multi-server resource pooling, and time-series output.

**Status:** ✅ Complete | **Started:** 2026-05-08 | **Completed:** 2026-05-08
**Prerequisite:** Sprint 9C exit gate passed.

> **Sequencing note:** Conditional routing is the keystone. Finite queues (Sprint 11) require it — a blocked entity must be routed somewhere. Build routing before capacity constraints.

### ADR-011 — Conditional Routing Schema *(must be accepted before F10.1 coding begins)*

**Option A (recommended):** Routing table on RELEASE B-Event schedule row — an optional `routing` array with `{ condition: Predicate, queueName: string }` entries plus mandatory `defaultQueueName`. First match wins. No new node types; backward compatible.

**Option B:** Dedicated ROUTE diamond node in Visual Designer. Cleaner visual representation; requires new node type, new macro, and new DAG rules.

Recommendation: Option A for Sprint 10. Option B is future syntactic sugar over the same mechanism.

| Feature | Status | Description |
|---|---|---|---|
| F10.1 — Conditional routing via RELEASE routing table | ✅ | Extend RELEASE macro with routing table; condition evaluation in order; first-match-wins; fallback defaultQueueName. |
| F10.2 — Probabilistic routing (stochastic branch) | ✅ | probabilisticRouting with weighted branch selection using seeded RNG; sum-to-1 validation. |
| F10.3 — Multi-server resource pooling (capacity > 1) | ✅ | idleCount/busyCount state model; SEIZE precondition: idleCount >= 1; capacity preserved at 1 for existing models. |
| F10.4 — Time-series collection (opt-in) | ✅ | collectTimeSeries flag in buildEngine(); snapshots queue length + resource utilisation at each Phase A. |
| F10.5 — Time-series charts in results panel | ✅ | Charts tab in Execute BottomPanel; MiniLineChart per queue/resource. |
| F10.6 — Waiting time distribution at Sink | ✅ | WaitDist histogram per queue with p50/p90/p95/p99 markers. |
| F10.7 — Visual Designer: multiple outgoing edges from Activity | ✅ | Relaxed single-edge rule; labelled conditional/probabilistic routing edges. |
| F10.8 — Documentation update | ✅ | Updated addition1_entity_model.md, AGENTS.md, Build Plan; ADR-011 accepted. |

### Sprint 10 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 10 of simmodlr.

Sprint 10 goal: Modelling Expressiveness — Routing & Pooling.
This sprint extends the engine's modelling vocabulary. No existing
macro, test, or authoring mode is replaced — only extended.

Completed in Sprints 1–9B: [paste sprint history summary]

Pre-sprint: confirm ADR-011 Option A (routing table on RELEASE)
before writing any engine code.

Features:
  F10.1 — Conditional routing via RELEASE routing table
  F10.2 — Probabilistic routing (stochastic branch weights)
  F10.3 — Multi-server resource pooling (capacity > 1)
  F10.4 — Time-series collection (opt-in flag in buildEngine())
  F10.5 — Time-series charts in Execute results panel
  F10.6 — Waiting time distribution and percentiles at Sink
  F10.7 — Visual Designer: multiple outgoing edges from Activity
  F10.8 — Documentation update

CRITICAL:
  - Existing single-route RELEASE behaviour must be preserved exactly —
    the routing table is an optional extension, not a replacement
  - capacity: 1 (default) on resources must reproduce current IDLE/BUSY
    behaviour bit-for-bit — no regression on M/M/1 benchmark
  - collectTimeSeries defaults to false — no performance overhead
    on existing runs

Definition of done:
  - M/M/1 benchmark still exits 0 with correct mean wait
  - Two-route model (ICU / Ward based on Entity.outcome) routes correctly
  - 3-server pooled queue: up to 3 concurrent entities in service
  - Time-series chart renders queue length curve for a known model
  - npm test -- --run passes with zero failures
  - npm run build succeeds
  - addition1_entity_model.md updated to reflect new macro signatures
```

### Sprint 10 Analysis Prompts *(run before any code — read-only sessions)*

**F10.1a — Routing analysis**

```
Re-read CLAUDE.md. Do not write any code in this session.
Sprint 10 F10.1 analysis: Conditional Entity Routing.

Read in full and report findings:
  1. src/engine/macros.js — full RELEASE macro; how nextQueueId is resolved
  2. src/engine/phases.js — how B-Events are fired and RELEASE called
  3. src/engine/conditions.js — evalCondition() signature; can it receive
     an entity instance and evaluate Entity.* attributes at runtime?
  4. docs/addition1_entity_model.md — RELEASE macro specification; the
     routing section; "downstream C-Event" workaround note
  5. src/ui/editors/index.jsx — how a B-Event schedule row captures
     nextQueueId; whether UI allows more than one outgoing route per row

After reading, answer:
  Q1. Does RELEASE take a fixed nextQueueId with no runtime branching?
  Q2. Does evalCondition() receive the entity instance?
  Q3. How is nextQueueId stored in model_json?
  Q4. Minimum model_json schema change for routing table:
      { routing: [{ condition: Predicate, queueName: string }],
        defaultQueueName: string }?
  Q5. Which existing tests are most affected by a RELEASE routing change?

Findings and answers only. No implementation.
```

**F10.3a — Resource pooling analysis**

```
Re-read CLAUDE.md. Do not write any code in this session.
Sprint 10 F10.3 analysis: Multi-Server Resource Pooling.

Read in full and report findings:
  1. src/engine/macros.js — idleOf(), busyOf(); full SEIZE/ASSIGN and
     RELEASE; how resource status is checked and updated
  2. src/engine/entities.js — resource state shape; fields per resource
  3. docs/addition1_entity_model.md — Resource state variable definitions;
     any mention of capacity or busyCount
  4. src/ui/editors/index.jsx — resource/server type editor; capacity field?
  5. tests/engine/ — tests covering SEIZE/RELEASE and resource transitions

After reading, answer:
  Q1. Is busyCount tracked per resource and used for availability?
  Q2. Current SEIZE precondition — status == IDLE or count-based?
  Q3. Minimum schema change for capacity: number (integer >= 1, default 1)?
  Q4. Does adding capacity require changes to evalCondition()?
  Q5. How many existing tests need updating if resource state changes from
      single IDLE/BUSY to count-based model?

Findings and answers only.
```

**F10.4a — Time-series analysis**

```
Re-read CLAUDE.md. Do not write any code in this session.
Sprint 10 F10.4–F10.6 analysis: Time-Series Output.

Read in full and report findings:
  1. src/engine/index.js — full results/summary object from buildEngine();
     are any time-series data points collected today?
  2. src/engine/macros.js — where sojourn time and wait time are recorded;
     is wait time tracked separately from sojourn time?
  3. src/ui/execute/index.jsx — results display; CI dashboard;
     any chart library already imported?
  4. package.json — is Recharts or any charting library installed?
  5. tests/engine/ — tests that verify results shape or summary statistics

After reading, answer:
  Q1. Does the engine emit timestamped events usable as a time-series?
  Q2. Is wait time tracked separately from sojourn time?
  Q3. Full structure of the results object returned by buildEngine()?
  Q4. Is Recharts installed?
  Q5. Lowest-risk approach for time-series collection?

Findings and answers only.
```

### Sprint 10 Implementation Prompts

**F10.1 — Conditional routing**

```
Re-read CLAUDE.md. Sprint 10 F10.1: Conditional Entity Routing.

Verify the analysis findings before proceeding.

Implement conditional routing as a non-breaking extension.
Fixed single-route RELEASE must continue to work unchanged.

Schema extension on B-Event RELEASE schedule rows:

  Existing (preserved):
    { macro: "RELEASE", serverType: "Nurse", queueName: "Consultant Queue" }

  Extended (optional):
    { macro: "RELEASE", serverType: "Nurse",
      routing: [
        { condition: { variable: "Entity.outcome", operator: "==", value: "ICU" },
          queueName: "ICU Queue" },
        { condition: { variable: "Entity.outcome", operator: "==", value: "ward" },
          queueName: "Ward Queue" }
      ],
      defaultQueueName: "Ward Queue"
    }

Rules:
  - routing absent → existing behaviour, no change
  - routing present → evaluate in order; first match wins
  - no match → use defaultQueueName
  - no match and no default → runtime engine error with descriptive message
  - queueName (plain) and routing are mutually exclusive on the same row

Tasks (run npm test -- --run after each):

  F10.1a — Engine: extend RELEASE macro for routing table
    Read src/engine/macros.js before editing.
    Write unit tests first, then implement.

  F10.1b — Schema: extend validateModel()
    Routing entries must reference valid queues in model.
    defaultQueueName must exist. queueName and routing mutually exclusive.

  F10.1c — UI: routing table builder on B-Event RELEASE rows
    Read editors/index.jsx B-Event schedule row before editing.
    "Conditional routing" toggle. When enabled: routing table builder
    + mandatory fallback queue. When disabled: existing UI unchanged.

  F10.1d — Visual Designer: multiple outgoing edges from Activity
    Confirm single-outgoing-edge enforcement before editing.
    Relax rule when routing table present. Edge labels show condition.
    Default edge labelled "fallback".

After all tasks:
  npm test -- --run && npm run build
  Manual: two-route model (ICU/Ward), confirm routing correct.
```

**F10.2 — Probabilistic routing**

```
Re-read CLAUDE.md. Sprint 10 F10.2: Probabilistic Routing.

Schema extension on B-Event RELEASE schedule rows:

  { macro: "RELEASE", serverType: "Doctor",
    probabilisticRouting: [
      { probability: 0.7, queueName: "Ward Queue" },
      { probability: 0.3, queueName: "ICU Queue" }
    ]
  }

Rules:
  - probabilities must sum to 1.0 (tolerance 0.001)
  - routing, probabilisticRouting, and queueName mutually exclusive
  - sampling uses the replication's seeded RNG

Tasks:
  F10.2a — Engine: RELEASE samples probabilistic branch using seeded RNG
    Unit test: correct queue frequency over 10,000 samples (within 3%).

  F10.2b — Schema: validateModel() sum validation + mutual exclusion.

  F10.2c — UI: "Probabilistic routing" mode toggle on RELEASE rows.
    Each row: queue dropdown + probability input (0–1).
    Running total shown; blocks save if total ≠ 1.0.
```

**F10.3 — Multi-server resource pooling**

```
Re-read CLAUDE.md. Sprint 10 F10.3: Multi-Server Resource Pooling.

Design:
  - capacity: 1 (default) preserves all existing IDLE/BUSY behaviour exactly
  - capacity > 1: IDLE/BUSY status replaced by idleCount / busyCount
  - SEIZE precondition for pooled resource: idleCount >= 1
  - RELEASE: decrement busyCount, increment idleCount
  - C-scan restart rule fires when idleCount > 0 after RELEASE
  - Predicate Builder exposes idleCount and busyCount for all resources

Tasks (run npm test -- --run after each):

  F10.3a — Engine: extend resource state model
    Read entities.js before editing.
    capacity field; idleCount + busyCount for capacity > 1.
    Retain status for capacity = 1 (no regression).
    Unit tests at capacity 1, 2, N. M/M/1 benchmark must still pass.

  F10.3b — Engine: extend SEIZE/ASSIGN and RELEASE
    Read macros.js before editing.

  F10.3c — Schema: capacity validation in validateModel()
    capacity: integer >= 1, default 1. Reject < 1 or non-integer.

  F10.3d — UI: capacity field in resource editor
    Read editors/index.jsx resource editor before editing.
    Numeric capacity input (min 1, default 1).
    Predicate Builder: expose idleCount and busyCount.

After all tasks:
  npm test -- --run && npm run build
  Manual: 3-server pool — confirm 3 concurrent entities; 4th waits.
```

**F10.4–F10.6 — Time-series and waiting time output**

```
Re-read CLAUDE.md. Sprint 10 F10.4–F10.6: Time-Series and Distribution Output.

Category A — Time-series (F10.4 + F10.5):
  collectTimeSeries: boolean in buildEngine() (default false).
  Snapshot queue lengths and resource utilisation at each Phase A.
  Store as { t: number, value: number }[] in results.timeSeries.
  Charts tab in Execute panel (one line per queue/resource).
  Use Recharts if available; install if not.

Category B — Waiting time distribution (F10.6):
  Wait time = seize time − arrival time at SEIZE.
  Histogram + p50/p90/p95/p99 per queue in results.waitDist.

Rules:
  - collectTimeSeries: false (default) → zero overhead
  - All new data under results.timeSeries and results.waitDist
  - Existing summary fields unchanged

Tasks:
  F10.4a — Engine: time-series collection
    Read index.js before editing. Add collectTimeSeries flag.
    Unit tests: false → timeSeries undefined; true → correct values.

  F10.4b — Engine: wait time collection
    Read macros.js SEIZE before editing.

  F10.5 — UI: Charts tab
    Read execute/index.jsx before editing.
    "Detailed output" checkbox (default off). Charts tab when enabled.

After all tasks: npm test -- --run && npm run build
Manual: run with detailed output — confirm time-series chart correct.
```

**F10.8 — Sprint 10 documentation update**

```
Sprint 10 is feature-complete. Before committing, update ALL of the
following. Show me the diff for each before writing it.

1. docs/addition1_entity_model.md
   - RELEASE Inputs section: add routing table schema and
     probabilisticRouting schema
   - RELEASE Routing row: document evaluation order and fallback behaviour
   - Resource state variable definitions: add capacity, idleCount, busyCount;
     note status retained for capacity = 1 (backward compatibility)
   - Section 7 validation rules: add rules for routing table,
     probabilistic routing, and resource capacity

2. CLAUDE.md
   - Update "Current Sprint" to Sprint 11
   - Add capacity/idleCount/busyCount to resource state description
   - Add routing table and probabilisticRouting to B-Event schema section
   - Add collectTimeSeries and waitDist to results object description
   - Update ADR register: mark ADR-011 closed with Option A recorded

3. docs/simmodlr_Build_Plan.md
   - Set Sprint 10 status to ✅ Complete with completion date
   - Record final test count in Sprint History table
   - Update Modelling Capability Coverage table: mark Sprint 10 items ✅
   - Add any new deferred items to Deferred Features Register

4. docs/decisions/ADR-011-conditional-routing-schema.md (new file)
   - Record Option A decision and rationale
   - Document routing table schema and evaluation rules
   - Note Option B (ROUTE node type) as potential future enhancement
```

### Sprint 10 Completion Gate

```bash
npm test -- --run                       # Zero failures — M/M/1 benchmark still exits 0
npm test -- macros                      # Routing table and pooling tests pass
npm test -- distributions               # Probabilistic routing frequency tests pass
npm test -- validation                  # New schema validation tests pass
npm test -- ui                          # Routing table UI and resource capacity tests pass
npm run build                           # Succeeds
# Manual: two-route model (ICU/Ward) — attribute-based routing correct
# Manual: probabilistic routing — 200 reps, frequencies within 3% of weights
# Manual: 3-server pool — 3 concurrent entities in service; 4th waits
# Manual: detailed output on — time-series chart renders
# Manual: waiting time histogram correct shape for M/M/1
```

---

## Sprint 11 — Modelling Expressiveness: Capacity & Output

**Goal:** Add finite queue capacity, balking, and overflow routing. These are natural extensions of conditional routing (which must be in place first) and complete the practical queueing model patterns for healthcare and logistics work.

**Status:** ✅ Complete | **Started:** 2026-05-08 | **Completed:** 2026-05-08
**Prerequisite:** Sprint 10 exit gate passed.

| Feature | Status | Description |
|---|---|---|
| F11.1 — Finite queue capacity | ✅ | `capacity` field on Queue (integer >= 1, default unlimited); ARRIVE enforces limit. |
| F11.2 — Balking (probabilistic / condition-based joining) | ✅ | balkCondition (predicate) + balkProbability (0–1 float) on arrival B-Events. |
| F11.3 — Overflow routing | ✅ | OverflowDestination field on Queue; reuses Sprint 10 routing infrastructure. |
| F11.4 — Queue capacity metrics | ✅ | blockingCount + balkCount per queue tracked in results summary. |
| F11.5 — Visual Designer: capacity and overflow on Queue nodes | ✅ | Capacity input, overflow destination picker in Queue inspector. |
| F11.6 — Documentation update | ✅ | Updated addition1_entity_model.md, AGENTS.md, Build Plan. |

### Sprint 11 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 11 of simmodlr.

Sprint 11 goal: Modelling Expressiveness — Capacity & Output.
Prerequisite: Sprint 10 conditional routing is complete and working.

Features:
  F11.1 — Finite queue capacity (integer >= 1, default unlimited)
  F11.2 — Balking: entity declines to join queue on arrival
  F11.3 — Overflow routing: blocked or balking entity sent to
           alternative queue or Sink (reuses Sprint 10 routing)
  F11.4 — Queue capacity metrics: blockingCount, balkCount per queue
  F11.5 — Visual Designer: capacity and overflow destination on Queue nodes
  F11.6 — Documentation update

CRITICAL:
  - capacity: unlimited (default) must reproduce current ARRIVE exactly
  - Overflow routing reuses Sprint 10 conditional routing mechanism
  - Balk probability sampled using replication's seeded RNG

Definition of done:
  - Finite queue blocks at capacity limit; overflow entity routed correctly
  - Balking entity exits to Sink with balk count recorded
  - blockingCount and balkCount in results summary
  - npm test -- --run passes with zero failures
  - npm run build succeeds
  - addition1_entity_model.md updated
```

### Sprint 11 Key Implementation Notes

**F11.1 — Finite Queue Capacity:** Extend the ARRIVE macro. At arrival, if `Queue.<queueId>.length >= capacity` the entity is blocked and routed to `overflowDestination`. `capacity: null` (default) means unlimited — existing behaviour unchanged.

**F11.2 — Balking:** Evaluated before the entity joins the queue. If `balkCondition` predicate is true or sampled `balkProbability` exceeds threshold, entity exits to designated Sink without joining. Balk count recorded per queue.

**F11.3 — Overflow Routing:** Both blocking and balking share an `overflowDestination` field on the Queue node — a named queue or Sink. Reuses routing infrastructure from Sprint 10; no new macro.

### Sprint 11 Completion Gate

```bash
npm test -- --run                       # 523 tests — zero failures
npm test -- macros                      # Finite capacity and balking tests pass
npm test -- validation                  # Queue capacity validation tests pass
npm test -- ui                          # Queue capacity UI tests pass
npm run build                           # Succeeds
# Manual: finite queue capacity 3 — 4th arrival blocked and routed correctly
# Manual: balk condition (queue.length >= 5) — entities balk at threshold
# Manual: blockingCount and balkCount in results summary
```

---

## Sprint 12 — Modelling Expressiveness: Assembly & Recirculation

**Goal:** Add entity batching (assembly / kitting) and controlled recirculation (rework loops, multi-pass processes). The most architecturally complex extensions — deferred until routing and capacity are stable.

**Status:** ✅ Complete | **Started:** 2026-05-08 | **Completed:** 2026-05-08
**Prerequisite:** Sprint 11 exit gate passed.

> **Design note:** ADR-012 accepted before any engine work. Back-edges use `loop: true` flag on graph edges. BATCH uses queue-accumulation model (Option A). UNBATCH restores original entities with full history.

| Feature | Status | Description |
|---|---|---|
| F12.1 — ADR-012: Recirculation and batching design | ✅ | Accepted 2026-05-08. Four design decisions: back-edge `loop:true` flag, loop guard (maxLoopCount + conditional exit), BATCH queue-accumulation, UNBATCH restore originals. |
| F12.2 — BATCH macro | ✅ | C-Event macro. Accumulates N entities per queue discipline; creates parent batch entity with `batch.children`; attributes copied from first child. |
| F12.3 — UNBATCH macro | ✅ | B-Event macro. Restores children from parent.batch to target queue; parent marked done and counted as served. |
| F12.4 — Controlled back-edges with loop guard | ✅ | Loop guard fires after probabilistic routing in phases.js: increments entity.loopCount per ev.loopConfig; routes to exitQueueName or marks done when maxLoopCount reached. |
| F12.5 — Entity.loopCount attribute | ✅ | Auto-maintained by engine; resolved in resolveVariable()/evalCondition()/buildConditionTokens(); initialised to 0 in createCustomer(). |
| F12.6 — Visual Designer: loop and batch node support | ✅ | wouldCreateCycle skips loop:true edges; validateVisualConnection returns `loop:true` for Activity→Queue cycles; back-edge auto-detection in deriveGraphFromModel; dashed amber rendering for loop edges. |
| F12.7 — Documentation update | ✅ | `addition1_entity_model.md` updated with BATCH (MACRO 6) and UNBATCH (MACRO 7) specs, Entity.loopCount, Loop Guard, V22/V23/V24 validation gates. Closed macro set updated from 5 to 7. |

### Sprint 12 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 12 of simmodlr.

Sprint 12 goal: Modelling Expressiveness — Assembly & Recirculation.
Prerequisite: Sprints 10 and 11 complete.

IMPORTANT: ADR-012 must be accepted before any code is written.
ADR-012 must answer:
  1. How are back-edges represented in model_json without breaking
     existing DAG validation?
  2. Required loop guard:
     Option A: max recirculation count on each back-edge
     Option B: mandatory conditional exit to Sink at each pass
     Option C: both (engine guard + modeller intent)
  3. How does BATCH interact with existing queue disciplines?
  4. Does UNBATCH create new entity instances or restore originals?

Features:
  F12.1 — ADR-012 (must complete before F12.4)
  F12.2 — BATCH macro
  F12.3 — UNBATCH macro
  F12.4 — Controlled back-edges with mandatory loop guard
  F12.5 — Entity.loopCount (auto-maintained by engine)
  F12.6 — Visual Designer support for loops and batch nodes
  F12.7 — Documentation update

CRITICAL:
  - BATCH changes SEIZE semantics (multi-entity accumulation). Analyse
    engine impact thoroughly before implementation.
  - Entity.loopCount uses seeded RNG for any stochastic branching.
  - All existing tests must pass — additive features only.

Definition of done:
  - Assembly model (2 components → 1 product) runs correctly
  - Rework loop (30% rework, max 3 loops) terminates correctly
  - Entity.loopCount accessible in Predicate Builder
  - npm test -- --run passes with zero failures
  - npm run build succeeds
  - addition1_entity_model.md updated with BATCH and UNBATCH specs
```

### Sprint 12 Completion Gate

```bash
npm test -- --run                       # 541 passed, 60 test files — all prior tests unchanged
npm test -- macros                      # BATCH, UNBATCH, recirculation tests pass
npm test -- validation                  # V22 (BATCH size), V23 (UNBATCH queue), V24 (loop guard) pass
npm test -- ui                          # Batch and loop Visual Designer tests pass (graph-operations, FlowDiagramReactFlow)
npm run build                           # Succeeds — 6 chunks
node tests/engine/mm1_benchmark.js      # 1.48% error (< 5% gate)
# Manual: assembly model — product only created when both components present
# Manual: rework loop — 30% rework, max 3 loops; no infinite loop;
#         Entity.loopCount correct in step log
```

### Sprint 12 Documentation Update *(run at completion)*

```
Sprint 12 of simmodlr is complete. Before committing, update ALL of:

1. docs/addition1_entity_model.md
   - BATCH (MACRO 6) and UNBATCH (MACRO 7) macro specifications
   - Entity.loopCount field on Entity schema
   - Loop Guard section (maxLoopCount, exitQueueName)
   - Closed macro set updated from 5 to 7
   - Validation gates V22, V23, V24 added
   - "Out of Scope" amended to remove entity joining

2. AGENTS.md
   - Update "Current Sprint" from Sprint 12 to next sprint or "Complete"
   - Add BATCH/UNBATCH to the five permitted macros (now seven)
   - Add loop guard rules to Three-Phase and entity sections

3. docs/simmodlr_Build_Plan.md
   - Set Sprint 12 status to ✅ Complete with completion date 2026-05-08
   - Record final test count in Sprint History table (541 tests, 60 files)
   - Update roadmap flowchart, Roadmap Snapshot, Modelling Capability Coverage
   - Mark ADR-012 as ✅ Accepted in Open Architectural Decisions
   - Add version 1.46 to Document History

4. docs/decisions/ADR-012-recirculation-batching.md
   - Set Status to Accepted (already done)
```

## Sprint 13 — AI Model Building Enhancement

**Goal:** Enhance the AI model building system with updated prompts for all 7 macros, a validation feedback loop, results-informed refinement, and a "Suggest Model Changes" button in the Execute panel's AI Assistant.

**Status:** ✅ Complete | **Started:** 2026-05-08 | **Completed:** 2026-05-08
**Prerequisite:** Sprint 12 exit gate passed.

| Feature | Status | Description |
|---|---|---|
| F13.1 — 7-macro prompts update | ✅ | MACROS constant updated to all 7 macros (ARRIVE, ASSIGN, COMPLETE, RELEASE, RENEGE, BATCH, UNBATCH); B_EVENT_MACROS and C_EVENT_MACROS constants added with event-type guidance; system prompt includes BATCH/UNBATCH usage guidance. |
| F13.2 — Validation feedback loop | ✅ | `AiGeneratedModelPanel.send()` calls `validateModel()` on AI proposal; on errors, sends retry with error summary; max 1 retry; retry response explanation shown in history; unfixable issues displayed as notice. |
| F13.3 — Results-informed refinement | ✅ | `buildModelBuilderUserMessage()` accepts optional 4th `results` param; when provided, includes `simulationResults` in JSON payload with KPI data and instruction to refine based on bottlenecks. |
| F13.4 — Suggest Model Changes button | ✅ | `buildSuggestionPrompt()` function returns kind:"suggestion" payload; "Suggest model changes" button in Execute panel AI Assistant (disabled when no results); triggers `suggestChanges()` calling `runPrompt()`. |
| F13.5 — SUGGESTION task kind | ✅ | `LLM_TASKS.SUGGESTION` added to `src/llm/contracts.js`. |

### Sprint 13 Completion Gate

```bash
npm test -- ai-generated-model-panel ai-model-apply-save   # 8 passed
npm test -- model-builder-prompts prompts                   # 16 passed
npm test -- --run                                           # 543 passed
npm run build                                               # Succeeds
```

---

## Post-Sprint 13 — Templates, Anonymous Mode, and Template Gallery

**Goal:** Add pre-built template models, anonymous/local storage mode, and a template gallery in the Model Library.

**Status:** ✅ Complete | **Started:** 2026-05-08 | **Completed:** 2026-05-09

| Feature | Status | Description |
|---|---|---|
| T1 — Template definitions (10 models) | ✅ | M/M/1, Call Center, ER Triage, Fast Food, Factory Assembly, Airport Security, Construction Logistics, Data Center, Outpatient Clinic, Warehouse Picking. |
| T2 — Template gallery UI | ✅ | Templates tab in Model Library alongside My Models and Public Library. |
| T3 — Template auto-run | ✅ | Opening a template creates a private model and opens Execute tab with auto-run flag. |
| T4 — Anonymous/local storage mode | ✅ | localStorage CRUD backend (`src/db/local.js`); local_ prefix for model IDs; works without Supabase session. |
| T5 — Template validation tests | ✅ | All 10 templates pass model validation; ER Triage priority queue discipline tested. |
| T6 — User guide update | ✅ | simmodlr_User_Guide.md updated to cover all features across Sprints 1–13. |

---

## Sprint 14 — AI Natural Language Results Queries

**Goal:** Enable free-form natural language queries against simulation results via the AI Assistant. Users ask questions like "Which queue had the longest wait?" or "What was the average utilisation of Clerk?" and the AI answers directly from the results object — no need to navigate tabs.

**Status:** 🔄 In progress | **Started:** 2026-05-09
**Prerequisite:** Post-Sprint 13 exit gate passed.
**Voice input pre-delivered:** F14.5 (microphone button in "Use AI" panel) was completed in prior session.

| Feature | Status | Description |
|---|---|---|
| F14.1 — Results query prompt builder | ✅ | `buildResultsQueryPrompt(question, model, results, conversationHistory)` transforms a natural language question + structured KPI data into an LLM prompt. Includes only the relevant subset of results data. Accepts optional conversation history array for follow-up support. |
| F14.2 — Query input in AI Assistant panel | ✅ | Text input at bottom of AI Assistant panel with "Ask" button. Sits below the existing Explain/Compare/Sensitivity/Suggest buttons. Enter key submits. Disabled when no results or streaming in progress. |
| F14.3 — Context-aware answer rendering | ✅ | AI response rendered in the response area with "YOU" / "AI" role headers and KPI values cited inline. Auto-scrolls to latest content. |
| F14.4 — Follow-up question support | ✅ | Conversation history preserved within the query session via `conversationHistory` state array. Past Q&A rendered in the response area. "Clear" button resets conversation. Users can ask "What about the second queue?" as a follow-up. |
| F14.5 — Voice input for AI model building | ✅ | Microphone button in "Use AI" panel input area using browser Web Speech API. Mic toggles speech recognition; transcribed text populates the draft. Graceful fallback for unsupported browsers. |
| F14.6 — Documentation & tests | ⬜ | Prompt tests, UI component tests, build plan update. |

### Sprint 14 Completion Gate

```bash
npm test -- llm prompts execute-panel ai-generated-model-panel
npm test -- --run
npm run build
# Manual: run an M/M/1 model, ask "What was the mean waiting time?" — correct answer displayed
# Manual: ask follow-up "Which queue had the longest wait?" — correct answer
# Manual: ask before any run — informative message about no results available
```

---

## Deferred Features Register

| Feature | Original sprint | Deferred to | Reason | Status |
|---|---|---|---|---|
| Split-pane SVG hybrid visual designer | Visual designer v2.0 Phase 2 | Not scheduled | ADR-007 retired the temporary SVG bridge | ❌ Cancelled |
| React Flow / canvas dependency decision | Visual designer planning | Sprint 9A | ADR-010 accepts `@xyflow/react` | ✅ Complete |
| SaaS tenancy/workspace model | Platform architecture planning | Post-Sprint 12 | Needs separate schema/RLS planning | ⏭ Deferred |
| Provider-neutral LLM configuration | Platform architecture planning | Sprint 8A | ✅ Complete |
| Admin-selectable LLM provider/model | Platform architecture planning | Sprint 8A or later admin UI sprint | Server-side config prepared; full admin UI can wait | ⏭ Deferred |
| Architecture health review | Platform architecture planning | Post-7A | Broader than roles/settings/TypeScript sprint | ⏭ Deferred |
| Execute running-model UX redesign | Platform architecture planning | Sprint 9C | Topology-derived live canvas with server pool cards and entity token animation — resolved in Sprint 9C | ✅ Complete |
| Platform role/settings persistence implementation | Sprint 7A | Sprint 7B | ✅ Complete |
| TypeScript tooling and first schema contracts | Sprint 7A | Sprint 7B | ✅ Complete |
| Apply Sprint 7B Supabase migration to remote project | Sprint 7B | Before settings UI depends on it | Migration committed; remote DB application is a deployment step | ⏭ Planned |
| Dependency audit remediation | Sprint 7B | Dependency maintenance sprint | Fix requires breaking Vite 8 upgrade | ⏭ Deferred |
| Time-varying arrivals NHPP refinement | Sprint 7 | Future refinement sprint | Piecewise sampling is clock-aware; resampling pending arrivals is a future refinement | ⏭ Deferred |
| SimPy/FastAPI backend on Render | Backlog | Post-Sprint 12 | Not required until browser engine is insufficient | ⏭ Deferred |
| Confidence interval enhancements (CRN, antithetic variates) | Backlog | Post-Sprint 12 | Methodologically important; not blocking modelling vocabulary | ⏭ Deferred |
| Full staff rostering / resource shift schedules | Sprint 7 (partial) | Sprint 13+ | Piecewise NHPP and SHIFT_CHANGE implemented; full rostering UI incomplete | ⏭ Deferred |
| ROUTE node type for Visual Designer | Sprint 10 | Sprint 13+ | ADR-011 selects routing table (Option A); ROUTE node is future syntactic sugar | ⏭ Deferred |

---

## Open Architectural Decisions

| ADR | Question | Needed by | Status |
|---|---|---|---|
| ADR-002 | Public model run permissions | Sprint 3 | ✅ Accepted — fork model |
| ADR-007 | Three authoring modes over one canonical model | Sprint 6 planning | ✅ Accepted — Forms/Tabs, AI Generated Model, Visual Designer |
| ADR-008 | Platform roles and user settings | Sprint 7A | ✅ Accepted — `profiles.role`; dedicated `user_settings` table |
| ADR-009 | TypeScript adoption posture | Sprint 7A | ✅ Accepted — incremental at schema/domain boundaries |
| ADR-010 | Visual Designer canvas and graph metadata | Sprint 9A | ✅ Accepted — `@xyflow/react`; optional layout-only `model_json.graph` |
| ADR-011 | Conditional routing schema | Sprint 10 | ✅ Accepted — routing table on RELEASE (Option A). |
| ADR-012 | Recirculation and batching design | Sprint 12 | ✅ Accepted — back-edge loop:true flag; BATCH queue-accumulation (Option A); UNBATCH restore originals. |
| ADR-013 | Resource claim and waiting ownership | Sprint 26 | ✅ Accepted — explicit waiting/resource ownership contracts, mirrored active claims. |
| ADR-014 | Preemption and interruption deferral | Sprint 26 | ✅ Accepted — preemption boundary documented; out of scope for Three-Phase method (later implemented in Sprint 32). |

---

## Known Issues Tracker

| # | Severity | Finding | File | Sprint | Status |
|---|---|---|---|---|---|
| C1 | Critical | `new Function()` eval — XSS | `conditions.js:76`, `macros.js:220` | S1 F1.1 | ✅ |
| C2 | Critical | LIFO/Priority ignored by engine | `entities.js:84–88` | S1 F1.3 | ✅ |
| C3 | High | C-scan restart pass-granularity | `engine/index.js:121–142` | S1 F1.2 | ✅ |
| C4 | High | Phase C truncation silent | `engine/index.js:121` | S1 F1.6 | ✅ |
| C5 | High | No pre-run validation | `execute/index.jsx:141–147` | S1 F1.5 | ✅ |
| C6 | Medium | Stale B-Event refs after delete | `phases.js:91,125` | S1 F1.5 | ✅ |
| C7 | Medium | No seeded RNG | `distributions.js:84` | S1 F1.4 | ✅ |
| C8 | Low | ConditionBuilder tokens stale | `editors/index.jsx:495` | S2 F2.6 | ✅ |
| C9 | Low | avg_service_time column mismatch | `db/models.js:127` | S5 F5.6 | ✅ |
| C10 | Low | Distribution inputs missing type=number | `editors/index.jsx:171,241,731` | S1 F1.5 | ✅ |
| C11 | Low | DistPicker ReferenceError | `components.jsx` | S1 F1.6 | ✅ |

---

---

## Sprints 41-45: Capability Exposure, UI Refinement & AI Depth

### Sprint 41 — Expose Engine Capabilities in UI ✅

**Goal:** Surface the engine macros added in Sprints 31–33 (COST, PREEMPT, FAIL, REPAIR, SPLIT, SET, SET_ATTR) in the structured editors so modellers can use them without writing raw JSON.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F41.1 — COST macro in BEventEditor | ✅ | COST action added to B-event effect picker; cost parameter field wired |
| F41.2 — PREEMPT macro in CEventEditor | ✅ | PREEMPT action available in C-event editor with priority field |
| F41.3 — FAIL/REPAIR macros in BEventEditor | ✅ | FAIL and REPAIR actions added; MTBF/MTTR fields exposed |
| F41.4 — SPLIT macro in BEventEditor | ✅ | SPLIT action with count and target queue fields |
| F41.5 — SET/SET_ATTR macros in editors | ✅ | SET (state variable assignment) and SET_ATTR (entity attribute write) in effect pickers |
| F41.6 — EffectPicker chip selector | ✅ | Shared EffectPicker component used across BEventEditor and CEventEditor |

---

### Sprint 42 — UI Usability Overhaul ✅

**Goal:** Improve the structural clarity of all editors through accordion sections, chip-based selectors, and new fields for loop guard and balk condition.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F42.1 — SectionPanel accordion | ✅ | Collapsible SectionPanel component used in all editors |
| F42.2 — EffectPicker chip selector | ✅ | Action selection via chip row instead of dropdown |
| F42.3 — loopConfig Loop Guard field | ✅ | BEventEditor exposes loopConfig (maxLoops, loopQueue) for recirculation cap |
| F42.4 — balkCondition expression field | ✅ | QueueEditor exposes balkCondition predicate builder field |
| F42.5 — EntityTypeEditor accordion sections | ✅ | Attributes, distributions, and server failure model in collapsible sections |

---

### Sprint 43 — Quantified AI Suggestions + Goal-Driven Sweep ✅

**Goal:** Upgrade AI suggestions from qualitative text to structured, quantified recommendations; add goal-driven sweep so the AI can search for parameter combinations that satisfy modeller-defined targets.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F43.1 — 6-step structured AI suggestion framework | ✅ | Suggestions include: observation, root cause, proposed change, expected impact (quantified), confidence, and risk |
| F43.2 — buildGoalGaps() | ✅ | Computes gap between current KPIs and modeller-defined goal thresholds |
| F43.3 — evaluateSweepPointGoals() | ✅ | Scores each sweep point against all goals; returns feasibility flag and gap vector |
| F43.4 — Goal-aware SweepChart | ✅ | SweepChart highlights feasible parameter regions; goal threshold drawn as horizontal line |
| F43.5 — Goal-aware Sweep2DGrid | ✅ | 2D grid cells coloured by feasibility (green = all goals met, amber = partial, red = none) |

---

### Sprint 44 — Execution Panel Insights ✅

**Goal:** Enrich the execution panel with production-quality log viewing, queue wait distribution histograms, sortable entity lifecycle tables, and goal-aware KPI cards.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F44.1 — LogViewer with phase filters/search/CSV export | ✅ | Phase A/B/C filter chips, free-text search, CSV export button |
| F44.2 — QueueHistogram | ✅ | Per-queue wait time distribution histogram (binned bar chart) |
| F44.3 — EntitySummaryTable | ✅ | Sortable, filterable entity lifecycle table with anomaly detection (highlighted rows for outlier sojourn times) |
| F44.4 — Goal-aware KPI cards | ✅ | KPI cards show green/amber/red status against goal thresholds |
| F44.5 — Log/Histograms/Entities toolbar buttons | ✅ | Execute panel toolbar buttons to toggle LogViewer, QueueHistogram, and EntitySummaryTable panels |

---

### Sprint 45 — AI Prompt Grounding ✅

**Goal:** Ground all AI prompts (suggestion, narrative, sweep) in richer simulation context so recommendations are more specific and actionable.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F45.1 — Enriched buildKpis | ✅ | buildKpis now includes maxSojourn, avgWIP, cost totals, container counts, and engine warnings |
| F45.2 — Server failure model in entity types | ✅ | Entity type JSON includes serverFailureModel (MTBF, MTTR, distribution) surfaced in prompts |
| F45.3 — B-event digest | ✅ | AI prompts receive a digest of all B-events including routing table, loopGuard config, and balkMode |
| F45.4 — C-event digest | ✅ | AI prompts receive a digest of all C-events with their condition and action summary |
| F45.5 — State variables in suggestion + narrative prompts | ✅ | State variable names and current values included in suggestion and narrative prompt context |
| F45.6 — Entity anomaly digest | ✅ | Anomalous entity sojourn times summarised and passed to AI prompts for targeted suggestions |
| F45.7 — MAX_PROMPT_WORDS 1500→2000 | ✅ | Prompt word cap raised from 1500 to 2000 to accommodate richer context |

---

---

### Sprint 47 — Toast Notification System ✅

**Goal:** Replace ad-hoc alert()/console patterns with a consistent toast notification system.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F47.1 — ToastContext + portal | ✅ | `src/ui/shared/ToastContext.jsx` — React context + `createPortal` bottom-right stack |
| F47.2 — Variants | ✅ | info / success / error / warning; auto-dismiss 4s; max 3 visible; `role="status"` / `aria-live="polite"` |
| F47.3 — Wrapped in App | ✅ | `<ToastProvider>` wraps app root in `App.jsx` |

---

### Sprint 48 — Skeleton Loading & Keyboard Shortcuts ✅

**Goal:** Add skeleton loading states and a keyboard shortcuts reference modal.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F48.1 — SkeletonPanel | ✅ | `src/ui/shared/SkeletonPanel.jsx` — CSS `@keyframes des-pulse` via injected `<style>` tag; staggered row delay |
| F48.2 — Visual Designer Suspense | ✅ | `<Suspense fallback={<SkeletonPanel rows={5}/>}>` wraps lazy VisualDesignerPanel |
| F48.3 — KeyboardShortcutsModal | ✅ | `src/ui/shared/KeyboardShortcutsModal.jsx` — global `?` keydown in App.jsx; skips INPUT/TEXTAREA/SELECT |

---

### Sprint 49 — Starter Guide & Bulk History Selection ✅

**Goal:** Persist starter guide dismissal state; add bulk run history selection.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F49.1 — Starter guide localStorage | ✅ | `des_starter_${modelId}` key; auto-hidden when entities or runs exist; `reopenStarterGuide()` function |
| F49.2 — Bulk history selection | ✅ | `historySelected` Set state; select-all checkbox; per-row checkbox; bulk archive/export action bar |

---

### Sprint 50 — Toast Integration ✅

**Goal:** Wire toast system into all save, export, and AI rate-limit paths.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F50.1 — ModelDetail save/export toasts | ✅ | `save()`, `saveGeneratedModel()`, `exportRunHistoryJson/Csv` all fire toasts; `saveStatus` state removed |
| F50.2 — CsvImportModal toast | ✅ | `handleApply` fires `toast.success` on successful CSV import |
| F50.3 — AiAssistantPanel rate-limit toast | ✅ | `/rate.?limit|429/i` regex in `onError` handlers; `toast.warning` surfaced |

---

### Sprint 51 — DistPicker Redesign ✅

**Goal:** Redesign the Distribution Picker with family grouping, inline validation, and sparkline preview.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F51.1 — DistHelp metadata | ✅ | `src/ui/shared/DistHelp.js` — DIST_GROUPS, DIST_HELP, getDistGroup(), validateDistParams() |
| F51.2 — DistSparkline | ✅ | `src/ui/shared/DistSparkline.jsx` — 120×40 SVG; shape functions for Exponential/Uniform/Fixed/Normal/Triangular/Erlang |
| F51.3 — DistPicker family segmented buttons | ✅ | Three family groups (Parametric / Time-varying / From data); ? toggle for help card; blur validation; "Preview ▾" toggle |

---

### Sprint 52 — Responsive Design & Layout Robustness ✅

**Goal:** Replace all manual `window.innerWidth` resize listeners with a shared `useViewport()` hook; add compact and mobile layouts.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F52.1 — useViewport hook | ✅ | `src/ui/shared/hooks.js` — `ResizeObserver` on `document.documentElement`; `BP = { mobile: 720, compact: 1024 }` |
| F52.2 — "More ▾" compact tab bar | ✅ | Access/History/Validate tabs hidden behind dropdown at 720–1024px in ModelDetail |
| F52.3 — ExecutePanel column stacking | ✅ | Root flex `flexDirection: isCompact ? "column" : "row"` |
| F52.4 — AdminPanel mobile layout | ✅ | Tab buttons wrap full-width; form grids single-column at `narrowLayout` |

---

### Sprint 53 — God Component Decomposition ✅

**Goal:** Extract self-contained auth forms and run history tab from their parent god components.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F53.1 — AuthShell extracted | ✅ | `src/ui/AuthShell.jsx` — all auth state and supabase auth calls; App.jsx passes only `isRecoverySession` |
| F53.2 — ModelHistoryTab extracted | ✅ | `src/ui/ModelHistoryTab.jsx` — history tab state (search, selected, label-edit) + export/archive functions |
| F53.3 — ModelDetail cleanup | ✅ | ~220 lines removed from ModelDetail; 4 orphaned `setSaveStatus` calls removed; db import trimmed |

---

---

### Sprint 54 — Cost Modelling Visibility ✅

**Goal:** Surface the existing `totalCost`/`costPerServed` engine data in all results views and add per-entity cost tracking.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F54.1 — Options doc corrected | ✅ | Option 1 marked complete (Sprint 36); status table updated |
| F54.2 — CI_METRICS + METRIC_LABELS | ✅ | `totalCost`/`costPerServed` in tile grid, CI precision table, sample-size guidance |
| F54.3 — ANALYSIS_METRICS | ✅ | Available in batch-means metric selector in ResultsWorkspace |
| F54.4 — Single-run cost section | ✅ | `COST SUMMARY` MetricStrip in ResultsWorkspace when `totalCost > 0` |
| F54.5 — Per-entity cost | ✅ | `entity.attrs.__cost` accumulation in COST macro |
| F54.6 — Per-entity cost tests | ✅ | 2 new tests in G17 suite; 13/13 cost tests pass |

**Deferred:** Option 4 (cost breakdown by event `summary.costBreakdown`) — Sprint 55 candidate.

---

### Sprint 55a — God Component Decomposition (Completion) ✅

**Goal:** Complete the 10 extractions planned in Sprint 53 but not delivered (only AuthShell and ModelHistoryTab were extracted). Extract 7 high-value components from ModelDetail.jsx, App.jsx, and execute/index.jsx.

**Status:** ✅ Complete

| Feature | Status | Description |
|---|---|---|
| F55a.1 — ModelHealthPanel | ✅ | `src/ui/ModelHealthPanel.jsx` (116 lines) extracted from ModelDetail inline fn |
| F55a.2 — ModelDetailHeader | ✅ | `src/ui/ModelDetailHeader.jsx` (43 lines) top header with undo/redo/save |
| F55a.3 — SaveBanner | ✅ | `src/ui/SaveBanner.jsx` (27 lines) dirty-state unsaved-changes banner |
| F55a.4 — ModelTabBar | ✅ | `src/ui/ModelTabBar.jsx` (150 lines) two-level mode + contextual sub-tab bar |
| F55a.5 — AppNavBar | ✅ | `src/ui/AppNavBar.jsx` (40 lines) top navigation bar |
| F55a.6 — ModelLibrary | ✅ | `src/ui/ModelLibrary.jsx` (256 lines) full library view with tabs, modals, PatternsGuidePanel |
| F55a.7 — ExperimentControls | ✅ | `src/ui/execute/ExperimentControls.jsx` (221 lines) warm-up / replications / seed / termination form |

**Line count reductions:**
- `ModelDetail.jsx`: 1,246 → 965 lines (−22%)
- `App.jsx`: 757 → 504 lines (−33%)
- `execute/index.jsx`: 2,474 → 2,293 lines (−7%)

**Limitation noted:** execute/index.jsx target of ≤ 300 lines is not achievable — ~100 tightly coupled state variables. Only the setup form was safely extractable.

---

### Sprint 66 — Visual Designer Badges + Execute Panel UX ⬜

**Goal:** Make advanced model configuration visible in the Visual Designer via read-only node badges (Option B). Streamline the Execute Panel menu by moving run-configuration controls to Setup, consolidating exports, removing Share, guarding the Log button during runs, renaming the Entities tab, and improving Analysis chart formatting.

**Status:** Planned

| Feature | Status | Description |
|---|---|---|
| F66.1 — Node badge system | ⬜ | `when` badge (amber) on ACTIVITY nodes with conditional cSchedules; `feed` badge (cyan) on SOURCE nodes with scheduleFeed data sources |
| F66.2 — Animate/Collect/Speed to Setup | ⬜ | Move three run-configuration controls to Setup tab (`ExperimentControls.jsx`) |
| F66.3 — Export consolidation | ⬜ | Single Export… button with format-selection popover |
| F66.4 — Remove Share Model | ⬜ | Delete Share button, state, and modal |
| F66.5 — Log guard | ⬜ | Disable Log menu button during active run; re-enable post-run |
| F66.6 — Entity Details rename | ⬜ | Rename "Entities" tab → "Entity Details" |
| F66.7 — Analysis graph formatting | ⬜ | Axis labels, chart titles, grid lines, consistent colour, padding |

---

### Sprint 71 — Individual SaaS Operator Layer ✅

**Goal:** Deliver Phase 1 SaaS operator foundation: user lifecycle visibility, per-user usage intelligence, and signup notifications. Designed for clean Phase 2 (org/team tenancy) additive migration.

**Status:** ✅ Complete — 2026-05-24

**Migration:** `supabase/migrations/20260524060000_sprint71_saas_operator.sql`

| Feature | Status | Description |
|---|---|---|
| F71.1 — Schema migration | ✅ | Added `email`, `plan`, `signup_at`, `last_active_at`, `organisation_id` to profiles. `email` synced from auth.users via trigger. `last_active_at` updated on profile row updates. `admin_user_stats` view + security-definer RPCs. |
| F71.2 — last_active_at touch | ✅ | `touchLastActive(userId)` in `src/db/supabase.js`. Called once per session in `App.jsx` via `useRef` guard. |
| F71.3 — Signup notification Edge Function | ✅ | `supabase/functions/notify-new-signup/index.ts`. Resend email (primary) + Slack (optional). WEBHOOK_SECRET verification. Always returns 200. Manual webhook setup documented. |
| F71.4 — Enhanced admin user list | ✅ | Replaced `fetchAllUsers` with `fetchAdminUserStats` RPC. New columns: plan badge, signup date, last active (relative), model count, runs (30d), total runs. Client-side sort on all columns. Email prefix search. Row-click detail drawer with Change Plan/Role/Suspend. |
| F71.5 — Usage tab | ✅ | New "Usage" tab in AdminPanel. KPI tiles: total users, active 7d, active 30d, total models. Usage table (sorted by runs_last_30d desc). Signups-over-time bar chart (inline SVG). |
| F71.6 — Plan badge (user-facing) | ✅ | `PlanBadge` component in `UserSettingsPanel`. FREE (grey) / PRO (blue). `plan` prop passed from `App.jsx` via updated `fetchProfiles` (added `plan` to select). |

### Sprint 72 — Performance Optimisation 🔄

**Goal:** Reduce execution overhead for models with many C-events by removing the legacy runtime condition-string path, migrating old models to canonical predicate JSON, and optimising the Phase C hot path with measurable benchmarks.

**Status:** 🔄 Planned | **Started:** 2026-05-25

**Source documents:**
- `docs/reviews/sprint-72-performance-optimisation-plan.md`
- `docs/reviews/sprint-72-performance-optimisation-closure.md`
- `docs/performance-envelope.md`

**Scope guardrails:**
- Preserve Three-Phase correctness exactly; no changes to the restart rule or one-event-at-a-time Phase C semantics.
- Migrate existing supported legacy models before removing the runtime legacy condition evaluator.
- Measure every optimisation step against named benchmark scenarios; no performance claims without recorded evidence.
- No new runtime dependencies.

| ID | Feature / refinement | Status | Deliverable |
|---|---|---|---|
| F72.1 | Benchmark refresh and baselines | 🔄 Planned | Updated benchmark fixtures and pre-optimisation baseline in `docs/performance-envelope.md`. |
| F72.2 | Legacy-condition contract audit | 🔄 Planned | File-by-file map of remaining legacy producers/consumers and canonical predicate shape. |
| F72.3 | Load-time migration to predicate JSON | 🔄 Planned | Deterministic migration utility for supported legacy conditions. |
| F72.4 | Remove legacy runtime condition execution | 🔄 Planned | Engine executes predicate JSON only. |
| F72.5 | Precompiled predicate evaluators | 🔄 Planned | Compiled evaluators and dependency metadata cached at engine build time. |
| F72.6 | Phase C helper/order caching | 🔄 Planned | Cached C-event order and reduced helper churn inside Phase C scans. |
| F72.7 | Dirty-dependency candidate filtering | 🔄 Planned | Candidate subset scans with safe full-scan fallback. |
| F72.8 | Correctness and migration coverage | 🔄 Planned | Focused engine/db/ui tests plus benchmark verification. |
| F72.9 | Documentation and architecture updates | 🔄 Planned | AGENTS, build plan, engineering spec, closure report, and measured results updated. |

**Exit gate:**
- Focused migration/correctness tests pass.
- Named performance scenarios run successfully with before/after measurements recorded.
- `npm run build` passes.
- Legacy runtime condition execution path is removed.
- Docs reflect the predicate-only runtime contract and delivered optimisation layers.
| F71.7 — Docs and tests | ✅ | AGENTS.md updated. `.env.example` updated. 3 new test files: `tests/db/admin-user-stats.test.js`, `tests/notify-signup.test.js`, `tests/ui/admin-panel-users.test.jsx`. Existing `admin-panel.test.jsx` updated. |

**Phase 2 deferred:** organisations table, org-scoped RLS, member invites, per-org usage, Stripe billing, upgrade/downgrade flow.

---

### Sprint 79 — ✦ Explore: AI-Powered Adaptive Batch Analysis ✅

**Goal:** Give modellers a one-click way to get statistically robust simulation results and actionable improvement opportunities from any design view, without manually tuning replication counts or interpreting raw output.

**Status:** ✅ Complete — 2026-05-31

**Branch:** `claude/ai-agent-batch-design-iAp3V`

**Source document:** `docs/reviews/sprint-79-ai-explore-plan.md`

**Scope guardrails:**
- No new database migrations or `model_json` schema changes; uses existing `simulation_runs.ai_insights` column
- Engine layer (`adaptive-batch.js`) is pure JS — zero React, zero DOM
- All DB calls delegated to `db/models.js` wrappers; none in UI components
- Styling via `tokens.js` exclusively; no hardcoded values or CSS classes
- One LLM call per user trigger — no change to rate limit exposure

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F79.1 | Adaptive batch engine | ✅ | `src/engine/adaptive-batch.js` — steps up replications until 95% CI relative half-width < 5% of mean, or tier max reached. Non-overlapping seeds across rounds. `_createWorker` injectable for tests. |
| F79.2 | LLM opportunity prompt | ✅ | `buildBatchAnalysisPrompt()` appended to `src/llm/prompts.js`. Structured four-section output: Bottlenecks / Quick Wins / Investment Opportunities / Confidence Summary. `BATCH_ANALYSIS` added to `LLM_TASKS` in `contracts.js`. |
| F79.3 | Explore modal panel | ✅ | `src/ui/execute/AdaptiveBatchPanel.jsx` — three-phase modal (Running → Analysing → Done). Live progress bar with CI%, convergence/tier-limit badge, streaming LLM output, cancel support, View Results navigation. |
| F79.4 | ✦ Explore header button | ✅ | `src/ui/ModelDetailHeader.jsx` — `✦ Explore` button visible in Overview + Design + Run modes; hidden when model has validation errors. |
| F79.5 | ModelDetail wiring | ✅ | `src/ui/ModelDetail.jsx` — `showExplorePanel` state, `resolvedTier`, `aiSchedulesMap`, DB callback props, modal render. |
| F79.6 | Tests | ✅ | `tests/engine/adaptive-batch.test.js` — 3 tests: convergence (M/M/1 standard tier), tier cap (free tier), seed non-overlap (stub worker). |

---

### Sprint 80 — Model Library Discovery ✅

**Goal:** Make it fast for users to find and act on models as the library grows, without changing the data model or adding backend queries.

**Status:** ✅ Complete — 2026-06-03

**Scope:**
- Client-side only — no new DB migrations, no new columns, no changes to fetch logic in `App.jsx` or `db/models.js`
- Filter state is tab-scoped local state inside `ModelLibrary.jsx`; no new props added to the `ModelLibrary` component

| ID | Feature | Status | Deliverable |
|---|---|---|---|
| F80.1 | Search bar | ✅ | Text search on name + description for My Models, Public Library, Community tabs. Clear (✕) button inline. |
| F80.2 | Sort control | ✅ | Dropdown: Last modified (default), Name A→Z, Most runs, Version. Applied after search/tag filter. |
| F80.3 | Tag chips (filter row) | ✅ | Dynamic tag chip row derived from union of tags in current tab. Multi-select OR logic. "Clear tags" reset button. |
| F80.4 | Tag chips (model cards) | ✅ | `ModelCard` renders up to 3 tags inline; "+N more" overflow label. Clicking a chip adds that tag to the active filter. |
| F80.5 | Empty-after-filter state | ✅ | "No models match your filters" message with one-click "Clear filters" button when search/tags yield zero results but source list is non-empty. |
| F80.6 | Templates tab unchanged | ✅ | Existing domain filter + search on Templates tab is untouched. |

**Active-tags semantics:** selecting multiple tag chips returns models matching *any* selected tag (OR). This was chosen over AND logic because it better matches the discovery use case — narrowing by AND would too aggressively prune small libraries.

---

*End of build plan. Update after each sprint.*
*The most important rule: read the existing file before changing it.*
*Modelling vocabulary rule: if a requirement cannot be expressed using the current macro set, extend the spec — never add a free-text escape hatch.*
