# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Primary reference:** Read `AGENTS.md` in full before writing any code. It is the architectural contract and overrides anything here.

**Current sprint:** `docs/reviews/sprint-69-plan.md`

---

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm test             # Vitest — run all tests once
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit (TypeScript checks only)
npm run build        # Production build
npm run bench        # Engine benchmarks (verbose)

# Run a single test file
npx vitest run tests/engine/macros.test.js

# Run tests matching a pattern
npx vitest run -t "FIFO"
```

Tests require no running server. The engine tests (`tests/engine/`) run in Node; UI tests (`tests/ui/`) run in jsdom via the setup in `tests/setup.js`.

`.env.local` is required for Supabase — it is not committed. Required vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

---

## Architecture

### Layer boundaries — never cross these

```
src/engine/   — Pure JavaScript. Zero React. Zero DOM. Zero Supabase.
src/ui/       — React components. Never import engine internals except buildEngine()
                (called only from src/ui/execute/index.jsx).
src/db/       — All Supabase access. UI components never query Supabase directly.
src/llm/      — LLM prompt construction and API client. No simulation logic.
src/reports/  — docx report generation. No simulation logic.
```

### Three-Phase DES engine (`src/engine/`)

The simulation implements Pidd's Three-Phase Method (A/B/C):
- **Phase A** — advance clock to the next B-Event time
- **Phase B** — fire all B-Events scheduled at that time (deterministic)
- **Phase C** — iterative conditional scan with **restart rule**: when any C-Event fires, break and restart the scan from Priority 1

The restart rule is mandatory — completing the full C-Event list before restarting is a correctness bug. See `AGENTS.md §4` for the required loop structure.

`src/engine/index.js` — main loop  
`src/engine/phases.js` — `fireBEvent()`, `fireCEvent()`  
`src/engine/macros.js` — 19 macro implementations (ARRIVE, ASSIGN/SEIZE, COMPLETE, RELEASE, RENEGE, BATCH, UNBATCH, PREEMPT, FAIL, REPAIR, SPLIT, COSEIZE, MATCH, RENEGE_OLDEST, FILL, DRAIN, SET, SET_ATTR, COST)  
`src/engine/entities.js` — entity pool, queue discipline selection  
`src/engine/distributions.js` — sampler registry (open/extensible — add via `registerDistribution()`)  
`src/engine/validation.js` — V1–V29 pre-run validation rules

**Never use `eval()` or `new Function()` for condition evaluation.** All conditions are parsed predicate JSON evaluated by the safe evaluator in `conditions.js`.

### UI (`src/ui/`)

Tab-based, form-driven model editor. No CSS classes — all styling uses inline style objects with tokens from `src/ui/shared/tokens.js`.

Key editors (all in `src/ui/editors/`):
- `BEventEditor.jsx` — B-Events with effect macros, schedule distributions, conditional/probabilistic routing, balking, loop guard
- `CEventEditor.jsx` — C-Events with ConditionBuilder, cSchedules, `when` predicates
- `QueueEditor.jsx` — Queues with discipline (FIFO/LIFO/Priority/SPT/EDD), capacity, overflow destination
- `EntityTypeEditor.jsx` — Entity types with attributes, shift schedules, failure model (MTBF/MTTR)
- `ContainerEditor.jsx` — Container types for FILL/DRAIN macros

`src/ui/shared/components.jsx` — `DistPicker` (all 11 distributions including Piecewise, Schedule, Empirical/CSV)  
`src/ui/shared/DistHelp.js` — distribution metadata, family groupings, `validateDistParams()`  
`src/ui/execute/index.jsx` — the only file that calls `buildEngine()`

### Model JSON schema

The canonical model format is documented in `docs/model-schema-for-llm.md` (authoritative for LLM generation) and `docs/addition1_entity_model.md` (authoritative for engine/macro rules). TypeScript interfaces are in `src/contracts/model.ts`.

### AI / LLM

`src/llm/model-builder-prompts.js` — system prompt and `B_EVENT_MACROS`/`C_EVENT_MACROS` lists for the model-builder AI. These lists must stay in sync with the engine.  
`src/llm/contracts.js` — LLM request/response contract (version, task kinds, response formats)  
`supabase/functions/llm-proxy/` — Edge Function that routes to Anthropic/OpenAI

---

## Key rules (from AGENTS.md)

- **UI-Capability Parity** (§3b): every engine capability must be accessible from the UI. Never add an engine macro or model field without a corresponding UI entry point.
- **Build-On Rule** (§3a): read the target file before changing it. Extend or fix — never rewrite a working component.
- **Inline styles only**: no CSS classes, no CSS files. All values from `tokens.js`.
- **Save via toast**: the `ToastContext` system handles save feedback. No inline save-status banners.
- **No free-text logic fields**: all model logic uses structured pickers and the Predicate Builder.
- **New distribution types**: add to the registry in `distributions.js` only — no engine changes.

## Schema and spec documents to read before sprint work

| Doc | When to read |
|---|---|
| `AGENTS.md` | Always — before any code change |
| `docs/addition1_entity_model.md` | Before engine/macro/distribution work |
| `docs/model-schema-for-llm.md` | Before AI prompt or LLM integration work |
| `docs/reviews/sprint-69-plan.md` | Current sprint scope and detailed design |
| `docs/DES_Studio_User_Guide.md` | Before UI copy or help-text changes |
| `docs/decisions/` | Before changing any architectural pattern |
