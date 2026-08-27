# flow

![Benchmark Gate](https://github.com/sparky100/simmodlr/actions/workflows/benchmark-gate.yml/badge.svg)

flow is a browser-based discrete-event simulation modelling tool built around the Three-Phase Method: Phase A clock advance, Phase B bound events, and Phase C conditional events.

The app lets simulation modellers define entity types, queues, B-Events, C-Events, distributions, experiment controls, and replications through structured editors. Models run in the browser, with Supabase used for authentication, model storage, user settings, and run history.

## Current Status

Version: `0.9.0` (Beta)

The project has completed **89 sprints** covering the full DES modelling lifecycle — from engine safety and correctness through advanced scheduling macros, resource reliability, statistical analytics, and AI-powered model authoring and analysis.

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
| Community gallery and template library (26 templates) | Complete |
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
| CI | GitHub Actions — sharded Vitest fast tier + simulation soak tier + typecheck + production build (`ci.yml`), plus benchmark gate with no-`Math.random` guard (`benchmark-gate.yml`) |

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
npm test                              # Fast tier: unit + ui projects (~1-2 min) — run this while iterating
npm run test:soak                     # Soak tier: full simulations, replications, analytical benchmarks (several min)
npm run test:all                      # Everything (fast + soak) — CI's overall bar; use before a final push
npm run test:quick                    # Only tests related to uncommitted changes — fast pre-commit check
npm run test:watch                    # Watch mode — re-runs tests affected by the file you save
npm test -- engine                    # Engine tests only (fast tier)
npm test -- ui                        # UI tests only

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
| `docs/Template Models Guide.md` | Detailed explanations of the template models (26 templates in `src/engine/templates.js`) |
| `docs/addition1_entity_model.md` | Entity model, macros, distributions, validation schema |
| `docs/capability-gap-analysis.md` | flow vs professional tools (SimPy, AnyLogic, JaamSim) |
| `docs/patterns/` | Reusable modelling pattern references (6 patterns) |
| `docs/decisions/` | Architectural Decision Records (ADR-001 through ADR-019) |
| `docs/reviews/` | Sprint closure reports, capability guides, pre-sprint assessments |
| `docs/archived/` | Superseded historical documents (reference only) |

## Macro Vocabulary

flow supports 24 macros across B-Events and C-Events (the `MACROS` array in `src/engine/macros.js` is the authoritative list):

| Macro | Phase | Purpose |
|---|---|---|
| `ARRIVE` | B-Event | Creates entity, places in queue, schedules next arrival |
| `ASSIGN` | C-Event | Seizes resource for entity, schedules completion |
| `COMPLETE` | B-Event | Releases resource, records stats, entity departs |
| `RELEASE` | B-Event | Frees resource and routes entity to another queue |
| `RENEGE` | B-Event | Removes waiting entity from queue on timeout (abandonment) |
| `RENEGE_OLDEST` | B-Event | Removes the oldest waiting entity of a given type from queue |
| `BATCH` | C-Event | Accumulates N entities into one batch |
| `UNBATCH` | B-Event | Restores children from parent batch |
| `PREEMPT` | C-Event | Interrupts busy server; re-queues entity with remaining service |
| `FAIL` | B-Event | Sets matching servers to failed status |
| `REPAIR` | B-Event | Restores failed servers to idle |
| `SPLIT` | B/C-Event | Creates N-1 clones of context entity |
| `COSEIZE` | C-Event | Atomically seizes multiple server types simultaneously |
| `MATCH` | C-Event | Pairs entities from two queues into batch |
| `FILL` | B-Event | Adds a quantity to a named container (tank/stock) |
| `DRAIN` | C-Event | Removes a quantity from a named container; blocks if insufficient |
| `SET` | B/C-Event | Computes state variable via safe arithmetic expression |
| `SET_ATTR` | B/C-Event | Computes entity attribute via safe arithmetic expression |
| `COST` | B/C-Event | Records cost events for economic analysis |
| `DELAY` | C-Event | Resource-free timed activity — entities leave the queue without seizing a server; optional slot capacity |
| `FINISH` | C-Event | Ends an in-progress service immediately when a condition becomes true |
| `RELEASE_COSEIZED` | B-Event | Atomically releases all co-seized servers held by the entity |
| `CANCEL` | B/C-Event | Removes a pending scheduled event for the context entity (e.g. a competing timeout) |
| `ROUND_ROBIN` | B/C-Event | Cycles a state variable through 0..N-1 to rotate entities across N destinations |

## Roadmap

The product architecture is one canonical simulation model with three authoring modes:

1. **Forms/Tabs editor:** stable manual authoring mode with structured pickers.
2. **AI Generated Model:** natural-language model authoring over validated `model_json`.
3. **Visual Designer:** graph-first authoring surface over the same canonical model.

All three modes write to the same `model_json` — changes in one are reflected in the others.
