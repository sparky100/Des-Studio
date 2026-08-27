# simmodlr — CLAUDE.md

This project uses **OpenCode**, not Claude Code. See the following files for authoritative guidance:

| File | Purpose |
|---|---|
| `AGENTS.md` | Architectural contract, tech stack, coding conventions, testing rules |
| `opencode.json` | Agent profiles, routing logic, permissions, MCP servers |
| `.opencode/skills/` | Reusable skill workflows (run-tests, commit-push, build-verify) |
| `docs/archived/code-quality-plan.md` | Prioritized code improvement plan (archived) |
| `docs/DES_Studio_Build_Plan.md` | Sprint-by-sprint build roadmap |
| `docs/reviews/sprint-89-probabilistic-routing-canvas-edit-plan.md` | Current sprint plan — Sprint 89: Visual Designer inline probabilistic-branch editing (latest shipped) |
| `docs/reviews/sprint-88-plan.md` | Sprint 88 — Export Consolidation & Data Portability (shipped; see also `sprint-88-closure-report.md`) |
| `docs/addition1_entity_model.md` | Entity model, action vocabulary, distribution specs |
| `docs/reviews/expert-review-2026-08-remediation-register.md` | Consolidated 2026-08 expert-review remediation register (prioritised) |
| `docs/reviews/expert-review-2026-08-ux.md` | 2026-08 UX expert / modeller review (maturity 7.5/10) |
| `docs/reviews/expert-review-2026-08-functionality.md` | 2026-08 functionality & capability review |
| `docs/reviews/expert-review-2026-08-code.md` | 2026-08 code review |
| `docs/decisions/ADR-020-draw-run-live-preview.md` | Draw/Run integration — explored (Phase 1 live preview shipped, dogfooded, removed), then decided against: the Draw and Run canvases remain separate surfaces |

## Schema Contract

Any change that adds a field to model_json, db/models.js serialisation, or the Supabase schema must include a corresponding Vitest round-trip assertion in tests/db/. PRs without this are incomplete.
