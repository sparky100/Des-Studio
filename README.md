# DES Studio

DES Studio is a browser-based discrete-event simulation modelling tool built around Pidd's Three-Phase Method: Phase A clock advance, Phase B bound events, and Phase C conditional events.

The app lets simulation modellers define entity types, queues, B-Events, C-Events, distributions, experiment controls, and replications through structured editors. Models run in the browser, with Supabase used for authentication, model storage, user settings, and run history.

## Current Status

Version: `7.0.0`

The project has completed **33 sprints** covering the full DES modelling lifecycle — from engine safety and correctness through advanced scheduling macros, resource reliability, and statistical analytics.

| Area | Status |
|---|---|
| Core DES engine (Three-Phase A/B/C) | Complete |
| Engine safety (XSS fix, seeded RNG, queue disciplines) | Complete |
| Forms/Tabs model editor (5 editors, Predicate Builder) | Complete |
| Visual Designer (@xyflow/react graph-first authoring) | Complete |
| Execute canvas (live topology-derived flow view) | Complete |
| Experiment controls (warm-up, termination, seed, fork) | Complete |
| Replication runner, confidence intervals, run history | Complete |
| Import/export, accessibility, production polish | Complete |
| AI model authoring and results queries | Complete |
| Platform roles, user settings, SaaS admin | Complete |
| Dynamic distributions and time-varying resources | Complete |
| Modelling expressiveness (routing, pooling, batching, recirculation) | Complete |
| Parametric sweeps (1D + 2D), scenario comparison | Complete |
| Statistical output analyzer (Welch, batch-means, Bonferroni) | Complete |
| Shareable results dashboard + QR codes | Complete |
| CSV import bridge with distribution fitting | Complete |
| Community gallery and template library (16 templates) | Complete |
| Resource preemption, breakdowns, MTBF/MTTR | Complete |
| Advanced scheduling (SPLIT, COSEIZE, MATCH, dynamic BATCH) | Complete |
| Queue disciplines (FIFO, LIFO, PRIORITY, SPT, EDD, PRIORITY(attr)) | Complete |
| Histograms and ANOVA with Tukey HSD | Complete |
| Test infrastructure, benchmarks, CI pipeline | Complete |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3.1 |
| Build tool | Vite 5.4.0 |
| Language | JavaScript/JSX with incremental TypeScript for contracts |
| Styling | Inline style objects using shared tokens |
| Database/auth | Supabase JS client 2.45.0 |
| Canvas / DAG | @xyflow/react |
| Tests | Vitest, jsdom, React Testing Library |
| CI | GitHub Actions (test + benchmark + build) |

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file with Supabase browser credentials:

```text
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Useful Commands

```bash
# Development
npm run dev

# Testing
npm test                              # Watch mode — all tests
npm test -- --run                     # Single pass, no watch
npm test -- engine                    # Engine tests only
npm test -- ui                        # UI tests only

# Correctness gates
node tests/engine/mm1_benchmark.js    # M/M/1 analytical validation
node tests/engine/mmc_benchmark.js    # M/M/c analytical validation

# Build
npm run build                         # Production build
npm run preview                       # Preview production build locally
```

## Architecture Rules

Before changing code, read `AGENTS.md`. It is the architectural contract for the project.

Key rules:

- Preserve working components; extend or fix in place — never rewrite from scratch.
- Keep `src/engine/` pure JavaScript with no React or DOM access.
- Keep Supabase access inside `src/db/models.js` or `src/db/supabase.js`.
- Use structured pickers and the Predicate Builder for modelling logic. No free-text logic fields.
- Never use `eval`, `new Function`, or client-side LLM API keys.
- Use seeded RNG for simulation sampling; never `Math.random()` in engine code.
- One canonical `model_json` across Forms/Tabs, AI Generated Model, and Visual Designer modes.
- Do not add dependencies without explicitly reviewing and documenting the decision.

## Documentation

| Document | Purpose |
|---|---|
| `AGENTS.md` | Architectural contract, sprint history, coding conventions, test strategy |
| `docs/DES_Studio_Build_Plan.md` | Living roadmap, sprint status, implementation prompts |
| `docs/DES_Studio_User_Guide.md` | End-user guide for modellers |
| `docs/Template Models Guide.md` | Detailed explanations of all 16 template models |
| `docs/addition1_entity_model.md` | Entity model, macros, distributions, validation schema |
| `docs/capability-gap-analysis.md` | DES Studio vs professional tools (SimPy, AnyLogic, JaamSim) |
| `docs/patterns/` | Reusable modelling pattern references (6 patterns) |
| `docs/decisions/` | Architectural Decision Records (ADR-001 through ADR-014) |
| `docs/reviews/` | Sprint closure reports, capability guides, pre-sprint assessments |
| `docs/archived/` | Superseded historical documents (reference only) |

## Macro Vocabulary

DES Studio supports 15 macros across B-Events and C-Events:

| Macro | Phase | Purpose |
|---|---|---|
| `ARRIVE` | B-Event | Creates entity, places in queue, schedules next arrival |
| `ASSIGN` | C-Event | Seizes resource for entity, schedules completion |
| `COMPLETE` | B-Event | Releases resource, records stats, entity departs |
| `RELEASE` | B-Event | Frees resource and routes entity to another queue |
| `RENEGE` | B-Event | Removes oldest waiting entity from queue (abandonment) |
| `BATCH` | C-Event | Accumulates N entities into one batch |
| `UNBATCH` | B-Event | Restores children from parent batch |
| `PREEMPT` | C-Event | Interrupts busy server; re-queues entity with remaining service |
| `FAIL` | B-Event | Sets matching servers to failed status |
| `REPAIR` | B-Event | Restores failed servers to idle |
| `SPLIT` | B/C-Event | Creates N-1 clones of context entity |
| `COSEIZE` | C-Event | Atomically seizes multiple server types simultaneously |
| `MATCH` | C-Event | Pairs entities from two queues into batch |
| `SET` | B/C-Event | Computes state variable via safe arithmetic expression |
| `SET_ATTR` | B/C-Event | Computes entity attribute via safe arithmetic expression |
| `COST` | B/C-Event | Records cost events for economic analysis |

## Roadmap

The product architecture is one canonical simulation model with three authoring modes:

1. **Forms/Tabs editor:** stable manual authoring mode with structured pickers.
2. **AI Generated Model:** natural-language model authoring over validated `model_json`.
3. **Visual Designer:** graph-first authoring surface over the same canonical model.

All three modes write to the same `model_json` — changes in one are reflected in the others.
