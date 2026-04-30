# Audit Part 1 — Orientation

## Folder Structure

```
Des-Studio/
├── index.html                  # Vite HTML entry point
├── package.json                # NPM config (v7.0.0)
├── package-lock.json           # Dependency lockfile
├── vite.config.js              # Vite + React plugin + Vitest config
├── .gitignore                  # Excludes node_modules, dist, .env*
├── CLAUDE_WORKFLOW.md          # Generic Claude Code workflow guide (NOT a CLAUDE.md)
├── README.md                   # Project readme (not read per audit scope)
└── src/
    ├── App.jsx                 # Root React component
    ├── main.jsx                # React entry point (renders App)
    ├── db/
    │   ├── supabase.js         # Supabase client initialisation
    │   └── models.js           # Data access / model query functions
    ├── engine/                 # Core simulation/modelling domain logic
    │   ├── index.js            # Engine public exports
    │   ├── conditions.js       # Condition evaluation logic
    │   ├── distributions.js    # Probability / statistical distribution functions
    │   ├── entities.js         # Entity management
    │   ├── macros.js           # Macro definitions and execution
    │   ├── phases.js           # Phase management / lifecycle
    │   └── __tests__/          # Engine unit tests (5 files)
    │       ├── conditions.test.js
    │       ├── distributions.test.js
    │       ├── engine.test.js
    │       ├── entities.test.js
    │       └── macros.test.js
    └── ui/
        ├── ModelDetail.jsx     # Model detail view component
        ├── editors/
        │   └── index.jsx       # Editor panel / editor components
        ├── execute/
        │   └── index.jsx       # Execution / run UI
        └── shared/
            ├── components.jsx  # Shared / reusable UI primitives
            └── tokens.js       # Design tokens (colours, spacing, etc.)
```

---

## Tech Stack (confirmed from package.json + vite.config.js)

| Layer | Technology | Version |
|---|---|---|
| UI framework | React | 18.3.1 |
| Build tool | Vite | 5.4.0 |
| React/Vite bridge | @vitejs/plugin-react | 4.3.1 |
| Backend / DB | Supabase JS client | 2.45.0 |
| Test runner | Vitest | 1.6.0 |
| Language | JavaScript (JSX), ESM | — |
| TypeScript | **None** | — |
| CSS framework | **None visible** | — |
| Linter / formatter | **None visible** | — |

**Module system:** `"type": "module"` — pure ESM throughout.

**Test environment:** `node` (set in vite.config.js). No `jsdom` or `happy-dom` configured.

---

## CLAUDE.md Status

**MISSING.**

A file named `CLAUDE_WORKFLOW.md` exists but it is a generic, template-style guide for how to use the Claude Code workflow methodology — it contains no project-specific information (no app name, no architecture notes, no commands, no current sprint). It is not a substitute for `CLAUDE.md`.

Per the workflow guide's own instructions (section 1.2), a `CLAUDE.md` should exist in the project root with the app name, purpose, tech stack, file structure, conventions, and current sprint goal. That file is absent.

---

## Red Flags (visible from structure alone)

1. **No CLAUDE.md** — Every Claude Code session starts without persistent context. The project's own workflow guide calls this out as the first setup step. This is the most impactful gap for AI-assisted development.

2. **Test environment is `node`, not `jsdom`** — Vitest is configured with `environment: 'node'`. React component tests require a DOM environment (`jsdom` or `happy-dom`). As configured, any UI test that touches the DOM will fail or be silently skipped. Tests exist only for the `engine/` layer, so this may be intentional — but it means there is zero test coverage for `src/ui/` and `src/db/`.

3. **No `.env.example`** — `.env` and `.env.local` are gitignored. Supabase requires at minimum a project URL and anon key. There is no example or documentation of which environment variables are required, making cold-start setup opaque.

4. **No linter or formatter in devDependencies** — `package.json` has no ESLint, Prettier, or equivalent. The `CLAUDE_WORKFLOW.md` template references `npm run lint` but no such script exists. Code style enforcement is absent.

5. **No TypeScript** — The engine layer (`conditions`, `distributions`, `entities`, `macros`, `phases`) is complex domain logic with no type safety. Plain `.js`/`.jsx` throughout. This is a notable risk for a modelling/simulation tool where type correctness matters.

6. **Version 7.0.0 on a small codebase** — The project is at `v7.0.0` but the file count is minimal (roughly 15 source files). This suggests either heavy semver inflation or significant prior rewrites. Worth confirming what changed between major versions.

7. **`src/ui/` has no tests** — Five test files exist, all under `src/engine/__tests__/`. No tests for `ModelDetail`, editors, or execution UI. Combined with the `node` test environment, the entire UI layer is untested.
