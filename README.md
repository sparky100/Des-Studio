# DES Studio

DES Studio is a browser-based discrete-event simulation modelling tool built around Pidd's Three-Phase Method: Phase A clock advance, Phase B bound events, and Phase C conditional events.

The app lets simulation modellers define entity types, queues, B-Events, C-Events, distributions, experiment controls, and replications through structured editors. Models run in the browser, with Supabase used for authentication, model storage, user settings, and run history.

## Current Status

Version: `7.0.0`

The project has completed the core DES engine, editor, execution, replication, export, accessibility, AI insights, platform foundation, and dynamic modelling work through Sprint 7.

Latest roadmap status from `docs/DES_Studio_Build_Plan.md`:

| Area | Status |
|---|---|
| Core DES engine and validation | Complete |
| Forms/Tabs model editor | Complete and actively preserved |
| Experiment controls, warm-up, termination, forked public runs | Complete |
| Replication runner, confidence intervals, run history | Complete |
| Import/export, onboarding, accessibility, production polish | Complete |
| AI results insights via Supabase Edge Function proxy | Complete |
| Platform roles, user settings, TypeScript contracts | Complete |
| Dynamic distributions and time-varying resources | Complete |
| LLM provider architecture preflight | Current next |
| AI generated model authoring | Planned |
| Visual Designer authoring | Planned |

Most recent recorded completion gate: Sprint 7 passed with `369` tests and a successful production build.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18.3.1 |
| Build tool | Vite 5.4.0 |
| Language | JavaScript/JSX with incremental TypeScript for contracts |
| Styling | Inline style objects using shared tokens |
| Database/auth | Supabase JS client 2.45.0 |
| Tests | Vitest, jsdom, React Testing Library |

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
npm test
npm test -- ui
npm test -- engine
npm run typecheck
npm run build
```

Focused verification commands used in recent sprints include:

```bash
npm test -- db onboarding model-export contracts
npm test -- llm execute-panel
npm test -- accessibility delete-model onboarding
```

## Architecture Rules

Before changing code, read `CLAUDE.md` or `AGENTS.md`. They are the architectural contract for the project.

Key rules:

- Preserve working components; extend or fix in place.
- Keep `src/engine/` pure JavaScript with no React or DOM access.
- Keep Supabase access inside `src/db/models.js` or `src/db/supabase.js`.
- Use structured pickers and the Predicate Builder for modelling logic. Do not add free-text logic fields.
- Never use `eval`, `new Function`, or client-side LLM API keys.
- Use seeded RNG for simulation sampling; do not use `Math.random()` in simulation code.
- Keep one canonical `model_json` across Forms/Tabs, AI Generated Model, and future Visual Designer modes.
- Do not add dependencies without explicitly reviewing and documenting the decision.

## Documentation

Important project documents:

| Document | Purpose |
|---|---|
| `CLAUDE.md` | Architectural contract and current implementation rules |
| `AGENTS.md` | Codex-facing architectural contract |
| `docs/DES_Studio_Build_Plan.md` | Living roadmap, sprint status, implementation prompts |
| `docs/addition1_entity_model.md` | Entity model, macros, distributions, validation schema |
| `docs/decisions/` | Architectural Decision Records |
| `AUDIT.md` | Full audit findings and known issue context |

## Roadmap

The product architecture is one canonical simulation model with three authoring modes:

1. Forms/Tabs editor: current stable manual authoring mode.
2. AI Generated Model: planned natural-language model authoring over validated `model_json`.
3. Visual Designer: planned graph-first authoring surface over the same canonical model.

The immediate next planned work is Sprint 8A: provider-neutral LLM routing before adding AI model authoring in Sprint 8.
