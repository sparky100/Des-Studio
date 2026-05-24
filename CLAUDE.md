# DES Studio — CLAUDE.md

This project uses **OpenCode**, not Claude Code. See the following files for authoritative guidance:

| File | Purpose |
|---|---|
| `AGENTS.md` | Architectural contract, tech stack, coding conventions, testing rules |
| `opencode.json` | Agent profiles, routing logic, permissions, MCP servers |
| `.opencode/skills/` | Reusable skill workflows (run-tests, commit-push, build-verify) |
| `docs/code-quality-plan.md` | Prioritized code improvement plan |
| `docs/DES_Studio_Build_Plan.md` | Sprint-by-sprint build roadmap |
| `docs/reviews/sprint-27-simulation-debugging-and-explainability-plan.md` | Current structured sprint plan, task tracker, issue log, and acceptance criteria |
| `docs/reviews/sprint-27-closure-report.md` | Sprint 27 closure report scaffold and delivered-scope tracker |
| `docs/reviews/sprint-27-capability-guide.md` | Sprint 27 capability-guide scaffold for modeller-facing explainability documentation |
| `docs/addition1_entity_model.md` | Entity model, action vocabulary, distribution specs |

**Backup:** `AGENTS.md.bak` and `CLAUDE.md.bak` contain the pre-consolidation originals.

## Schema Contract

Any change that adds a field to model_json, db/models.js serialisation, or the Supabase schema must include a corresponding Vitest round-trip assertion in tests/db/. PRs without this are incomplete.
