# DES Studio — CLAUDE.md

This project uses **OpenCode**, not Claude Code. See the following files for authoritative guidance:

| File | Purpose |
|---|---|
| `AGENTS.md` | Architectural contract, tech stack, coding conventions, testing rules |
| `opencode.json` | Agent profiles, routing logic, permissions, MCP servers |
| `.opencode/skills/` | Reusable skill workflows (run-tests, commit-push, build-verify) |
| `docs/archived/code-quality-plan.md` | Prioritized code improvement plan (archived) |
| `docs/DES_Studio_Build_Plan.md` | Sprint-by-sprint build roadmap |
| `docs/reviews/sprint-79-ai-explore-plan.md` | Current structured sprint plan — AI-Powered Adaptive Batch / Explore (Sprint 79) |
| `docs/reviews/sprint-79-plan.md` | Sprint 79 — Consistent Panel Visibility UX (also Sprint 79, companion plan) |
| `docs/reviews/sprint-78-plan.md` | Sprint 78 — Visual Designer Canvas Visibility |
| `docs/addition1_entity_model.md` | Entity model, action vocabulary, distribution specs |

**Backup:** `AGENTS.md.bak` and `CLAUDE.md.bak` contain the pre-consolidation originals.

## Schema Contract

Any change that adds a field to model_json, db/models.js serialisation, or the Supabase schema must include a corresponding Vitest round-trip assertion in tests/db/. PRs without this are incomplete.
