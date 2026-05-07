# DES Studio — Build Plan
*Living document. Update after each sprint completion.*
*Version: 1.44 | Created: 2026-04-30 | Grounded in: Full Codebase Audit 2026-04-30*
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

| Symbol | Meaning |
|---|---|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete |
| ⏭ | Deferred |
| ❌ | Cancelled |

---

## Direction of Travel

DES Studio is moving from a working Forms/Tabs DES modeller into a richer modelling platform with three authoring modes over one canonical `model_json`: manual Forms/Tabs, AI Generated Model, and Visual Designer. The modelling expressiveness sprints (10–12) now extend the engine vocabulary to cover the critical real-world problem classes not yet supported.

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
  S8B --> S9A["Sprint 9A<br/>Visual preflight"]
  S9A --> S9["Sprint 9<br/>Visual Designer"]
  S9 --> S9B["Sprint 9B<br/>Visual UX hardening"]
  S9B --> S9C["Sprint 9C<br/>Execute canvas<br/>Live flow view"]
  S9C --> S10["Sprint 10<br/>Routing & Pooling"]
  S10 --> S11["Sprint 11<br/>Capacity & Output"]
  S11 --> S12["Sprint 12<br/>Assembly & Recirculation"]

  classDef done fill:#143d2a,stroke:#31a24c,color:#f2fff7;
  classDef current fill:#173447,stroke:#22d3ee,color:#ecfeff;
  classDef planned fill:#2a2438,stroke:#a78bfa,color:#f5f3ff;
  class PS,S1,S2,S3,S4,S5,S6,S7A,S7B,S7,S8A,S8,S8B,S9A,S9,S9B done;
  class S9C current;
  class S10,S11,S12 planned;
```

### Roadmap Snapshot

| Stage | Status | Summary |
|---|---|---|
| Foundations and core DES engine | ✅ Complete | Engine safety, reproducibility, validation, editors, experiment controls, replication, CI, exports, and accessibility in place. |
| AI results analysis | ✅ Complete | Read-only AI Insights via Supabase Edge Function proxy; run labels and history exports implemented. |
| Platform foundation | ✅ Complete | Sprint 7B: role/settings persistence and TypeScript tooling/contracts. |
| Dynamic modelling | ✅ Complete | Sprint 7: time-varying arrival rates and resource capacity schedules. |
| AI model creation | ✅ Complete | Sprint 8A: provider-neutral LLM routing. Sprint 8: natural-language model authoring. |
| Model definition coherence | ✅ Complete | Sprint 8B: queue/customer/server/service semantics aligned. |
| Visual authoring | ✅ Complete | Sprint 9: graph-first authoring model. Sprint 9B: UX hardening complete. |
| Execute canvas | ✅ Complete | Sprint 9C: topology-derived live canvas, four live node components, entity token animation, configurable KPI bar, BottomPanel with Stage KPIs. |
| Modelling expressiveness | ⬜ Planned | Sprints 10–12: conditional routing, multi-server pooling, finite queues, batching, recirculation. |

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
| Sprint 9A | ✅ Complete | 2026-05-05 | Visual Designer Architecture Preflight. | Docs | N/A | Success | ADR-010 accepted. |
| Sprint 9 | ✅ Complete | 2026-05-06 | Visual Designer Authoring. | 38 focused | N/A | Success | Graph-first authoring, round-trip parity, drag-to-place palette, visual validation summary. |
| Sprint 9B | ✅ Complete | 2026-05-07 | Visual Designer UX Hardening. | Focused | N/A | Success | Resource editing, safe delete, richer validation, connection editing, palette affordances, entity attribute logic fixes complete. |
| Sprint 9C | ✅ Complete | 2026-05-07 | Execute Canvas — Live Flow View. | 464 (464) | N/A | Success | ExecuteCanvas (lazy), four execute-mode node components, AnimatedEdge token animation, BottomPanel with Stage KPIs, configurable KPI bar, speed slider, node-filtered log. |
| Sprint 10 | ⬜ Not started | — | Modelling Expressiveness — Routing & Pooling. | — | — | — | Conditional routing; probabilistic routing; multi-server pooling; time-series output. |
| Sprint 11 | ⬜ Not started | — | Modelling Expressiveness — Capacity & Output. | — | — | — | Finite queues; balking; waiting time distributions. |
| Sprint 12 | ⬜ Not started | — | Modelling Expressiveness — Assembly & Recirculation. | — | — | — | Entity batching; controlled back-edges for rework loops. |

---

## Forward Product Roadmap

ADR-007 establishes DES Studio's model-authoring architecture: one canonical `model_json`, three authoring modes.

| Sprint | Product focus | Authoring mode / capability impact |
|---|---|---|
| Sprint 6 | LLM Integration & Results Analysis | Read-only AI interpretation; does not modify models |
| Sprint 7A | Platform Foundation: Roles, Settings & TypeScript | Architecture decisions |
| Sprint 7B | Platform Foundation Implementation | Role/settings/TypeScript foundation |
| Sprint 7 | Dynamic Distributions & Time-Varying Resources | Extends canonical model schema |
| Sprint 8A | LLM Provider Architecture Preflight | Provider-neutral server-side LLM routing |
| Sprint 8 | AI Generated Model Authoring | Second authoring mode |
| Sprint 8B | Model Definition Coherence | Semantic alignment across all authoring modes |
| Sprint 9 | Visual Designer Authoring | Third authoring mode |
| Sprint 9B | Visual Designer UX Hardening | Polish of third authoring mode — complete |
| Sprint 9C | Execute Canvas — Live Flow View | Topology-derived execute canvas; replaces flat server/queue lists |
| Sprint 10 | Modelling Expressiveness — Routing & Pooling | Conditional routing; probabilistic routing; multi-server pooling; time-series output |
| Sprint 11 | Modelling Expressiveness — Capacity & Output | Finite queues; balking; waiting time distributions |
| Sprint 12 | Modelling Expressiveness — Assembly & Recirculation | Entity batching; rework loops via controlled back-edges |

The existing Forms/Tabs editor remains the stable manual authoring mode throughout. The retired split-pane SVG hybrid designer is not part of the forward roadmap.

### Modelling Capability Coverage

| Capability | Status at Sprint 9 | Target sprint |
|---|---|---|
| Single/multi-stage sequential pathways | ✅ Supported via RELEASE chain | — |
| FIFO / LIFO / Priority queue disciplines | ✅ Supported | — |
| Reneging / abandonment | ✅ RENEGE macro | — |
| Stochastic service and inter-arrival times | ✅ 8 distribution types + empirical CSV | — |
| Time-varying arrival rates and shift schedules | ✅ Piecewise distributions + RATE_CHANGE/SHIFT_CHANGE | — |
| Warm-up period and termination controls | ✅ Sprint 3 | — |
| Multi-replication with 95% CI | ✅ Sprint 4 | — |
| AI-generated model authoring | ✅ Sprint 8 | — |
| Visual graph authoring | ✅ Sprint 9 | — |
| Conditional routing (entity-attribute branching) | ⚠️ Achievable via C-Event pattern; not guided or visualised | Sprint 10 |
| Probabilistic routing (stochastic branch probability) | ❌ Absent | Sprint 10 |
| Multi-server resource pooling (capacity > 1) | ❌ Absent — manual duplication workaround only | Sprint 10 |
| Time-series output (queue length / utilisation over time) | ❌ Absent — point estimates only | Sprint 10 |
| Finite queues and capacity-limited buffers | ❌ Absent | Sprint 11 |
| Balking (probabilistic queue joining) | ❌ Absent | Sprint 11 |
| Waiting time distribution and percentiles | ❌ Absent | Sprint 11 |
| Entity batching / assembly | ❌ Absent | Sprint 12 |
| Recirculation / rework loops | ❌ Absent — back-edges blocked by DAG rule | Sprint 12 |
| Full staff rostering (resource shift schedules) | ~ Partial — piecewise NHPP implemented; full rostering incomplete | Sprint 13+ |

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
Sprint 9B of DES Studio is complete. Before committing, update ALL of:

1. docs/addition1_entity_model.md
   - If any macro behaviour changed or was clarified during 9B, update
     the relevant macro specification section
   - If model_json schema changed (e.g. new graph metadata fields),
     update Section 3 (Model JSON Structure)

2. CLAUDE.md
   - Update "Current Sprint" to Sprint 10
   - Record any new architectural decisions or conventions introduced

3. docs/DES_Studio_Build_Plan.md
   - Set Sprint 9B status to ✅ Complete with completion date
   - Record final test count in Sprint History table
   - Add any new deferred items to the Deferred Features Register

4. docs/decisions/ — add any new ADRs accepted during this sprint

Show me the diff for each document before writing it.
```

---

## Sprint 9C — Execute Canvas: Live Flow View *(current)*

**Goal:** Replace the current flat server-card / queue-lane Execute view with a topology-derived live canvas that mirrors the model's flow structure. The canvas reuses `@xyflow/react` and `model_json.graph` layout metadata already established by the Visual Designer, rendering live simulation state as overlays on the same node shapes the modeller knows from authoring.

**Status:** 🔄 In progress | **Started:** 2026-05-07 | **Completed:** —
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
We are starting Sprint 9C of DES Studio.

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

2. docs/DES_Studio_Build_Plan.md
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
npm test -- --run                       # Zero failures
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

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 9C exit gate passed.

> **Sequencing note:** Conditional routing is the keystone. Finite queues (Sprint 11) require it — a blocked entity must be routed somewhere. Build routing before capacity constraints.

### ADR-011 — Conditional Routing Schema *(must be accepted before F10.1 coding begins)*

**Option A (recommended):** Routing table on RELEASE B-Event schedule row — an optional `routing` array with `{ condition: Predicate, queueName: string }` entries plus mandatory `defaultQueueName`. First match wins. No new node types; backward compatible.

**Option B:** Dedicated ROUTE diamond node in Visual Designer. Cleaner visual representation; requires new node type, new macro, and new DAG rules.

Recommendation: Option A for Sprint 10. Option B is future syntactic sugar over the same mechanism.

| Feature | Audit Status | Action |
|---|---|---|
| F10.1 — Conditional routing via RELEASE routing table | ❌ | Extend RELEASE macro; extend B-Event schedule row schema and UI |
| F10.2 — Probabilistic routing (stochastic branch) | ❌ | Add `probabilisticRouting` to RELEASE schedule rows; sample using seeded RNG |
| F10.3 — Multi-server resource pooling (capacity > 1) | ❌ | Extend resource state model; extend SEIZE/RELEASE; extend resource editor |
| F10.4 — Time-series collection (opt-in) | ❌ | Add `collectTimeSeries` flag to `buildEngine()`; snapshot queue/resource state at each Phase A |
| F10.5 — Time-series charts in results panel | ❌ | Charts tab in Execute panel; queue length over time; resource utilisation over time |
| F10.6 — Waiting time distribution at Sink | ❌ | Record per-entity wait at SEIZE; histogram + p50/p90/p95/p99 per queue |
| F10.7 — Visual Designer: multiple outgoing edges from Activity | ❌ | Relax single-edge rule when routing table present; show conditions on edges |
| F10.8 — Documentation update | ❌ | Update `addition1_entity_model.md`, CLAUDE.md, Build Plan, new ADR-011 file |

### Sprint 10 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 10 of DES Studio.

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

3. docs/DES_Studio_Build_Plan.md
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

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 10 exit gate passed.

| Feature | Audit Status | Action |
|---|---|---|
| F11.1 — Finite queue capacity | ❌ | Add `capacity` to Queue; check at ARRIVE; route on overflow |
| F11.2 — Balking (probabilistic / condition-based joining) | ❌ | `balkCondition` or `balkProbability` on Source; entity may decline to join queue |
| F11.3 — Overflow routing | ❌ | Extend ARRIVE to route overflow/balking entity using Sprint 10 routing; reuses `overflowDestination` field on Queue |
| F11.4 — Queue capacity metrics | ❌ | Track `blockingCount` and `balkCount` per queue in results summary |
| F11.5 — Visual Designer: capacity and overflow on Queue nodes | ❌ | Capacity input; overflow destination picker in Queue inspector |
| F11.6 — Documentation update | ❌ | Update `addition1_entity_model.md`, CLAUDE.md, Build Plan |

### Sprint 11 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 11 of DES Studio.

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
npm test -- --run                       # Zero failures — M/M/1 benchmark unchanged
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

**Status:** ⬜ Not started | **Started:** — | **Completed:** —
**Prerequisite:** Sprint 11 exit gate passed.

> **Design note:** Back-edges require ADR-012 before any engine work. The DAG constraint prevents infinite loops. The solution is controlled loop constructs with mandatory exit conditions — not removal of the DAG rule.

| Feature | Audit Status | Action |
|---|---|---|
| F12.1 — ADR-012: Recirculation and batching design | ❌ | Write and accept ADR before sprint coding begins |
| F12.2 — BATCH macro | ❌ | New macro: accumulate N entities; release batch to activity when threshold met |
| F12.3 — UNBATCH macro | ❌ | New macro: disperse batch back to individual entities after processing |
| F12.4 — Controlled back-edges with loop guard | ❌ | Allow back-edges with mandatory max-loop-count OR conditional exit to Sink |
| F12.5 — Entity.loopCount attribute | ❌ | Engine tracks recirculation count per entity; accessible in Predicate Builder |
| F12.6 — Visual Designer: loop and batch node support | ❌ | Visual back-edge representation; BATCH queue node variant |
| F12.7 — Documentation update | ❌ | Update `addition1_entity_model.md` with BATCH and UNBATCH specs; update Build Plan |

### Sprint 12 Planning Prompt *(run in claude.ai)*

```
We are starting Sprint 12 of DES Studio.

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
npm test -- --run                       # Zero failures — all prior tests unchanged
npm test -- macros                      # BATCH, UNBATCH, recirculation tests pass
npm test -- validation                  # Back-edge and loop guard validation pass
npm test -- ui                          # Batch and loop Visual Designer tests pass
npm run build                           # Succeeds
# Manual: assembly model — product only created when both components present
# Manual: rework loop — 30% rework, max 3 loops; no infinite loop;
#         Entity.loopCount correct in step log
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
| ADR-011 | Conditional routing schema | Sprint 10 | ⬜ Open — routing table on RELEASE (Option A, recommended) vs ROUTE node type (Option B). Must be accepted before F10.1 coding begins. |
| ADR-012 | Recirculation and batching design | Sprint 12 | ⬜ Open — back-edge loop guard strategy; BATCH multi-entity accumulation semantics. Must be accepted before F12.4 coding begins. |

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

*End of build plan. Update after each sprint.*
*The most important rule: read the existing file before changing it.*
*Modelling vocabulary rule: if a requirement cannot be expressed using the current macro set, extend the spec — never add a free-text escape hatch.*
