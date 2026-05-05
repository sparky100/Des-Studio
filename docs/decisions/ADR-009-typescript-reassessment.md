# ADR-009: Reassess JavaScript-only implementation and TypeScript adoption

**Status:** Accepted
**Sprint:** Sprint 7A
**Date:** 2026-05-05
**Decided by:** Architecture review (Claude Code session)

---

## Context

`CLAUDE.md` currently records JavaScript/JSX as the project language and states "No TypeScript." There is no dedicated ADR explaining that decision.

The application now includes:

- a non-trivial DES engine
- a canonical model JSON schema used by multiple authoring modes
- Supabase persistence boundaries
- replication/result export structures
- LLM prompt payloads
- planned AI-generated model authoring
- planned visual designer graph metadata
- future SaaS roles, tenancy, and settings

These areas would benefit from explicit types at module boundaries and schema contracts.

---

## Decision

The JavaScript-only rule is retired. DES Studio will adopt TypeScript incrementally, starting at domain/schema boundaries. This is not a rewrite.

Accepted direction:

1. Existing JavaScript/JSX remains valid and should not be converted opportunistically.
2. New `.ts` and `.tsx` files are allowed when they clarify cross-module contracts or reduce schema risk.
3. Start with domain contracts:
   - `model_json`
   - entity types, queues, B-events, C-events
   - run/result payloads
   - LLM prompt/request/response payloads
   - DB row shapes
4. Migrate leaf/domain modules first, then UI modules only where useful.
5. Keep existing tests green throughout.
6. Do not convert large UI surfaces such as `src/ui/execute/index.jsx` or `src/App.jsx` as an early migration step.
7. TypeScript adoption should pair with runtime validation where data crosses trust boundaries such as import files, Supabase rows, and LLM responses.

---

## Alternatives

**Stay JavaScript-only.**
Rejected. Lower immediate churn, but continued reliance on tests and runtime validation for complex cross-module contracts. The planned AI authoring and visual designer work will make the canonical model schema more important, not less.

**Big-bang TypeScript rewrite.**
Rejected as too disruptive and contrary to the build-on rule.

**Use JSDoc types only.**
Rejected as the primary strategy. JSDoc can help during transition, but it is weaker than explicit TypeScript modules for shared contracts and compile-time enforcement.

---

## Consequences

- `CLAUDE.md` must be updated to allow incremental TypeScript.
- Do not start a broad conversion without a dedicated migration task.
- Future schema-heavy work should prefer typed contract files or be designed so typed contracts can be introduced cleanly.
- A later migration sprint should add `tsconfig.json`, decide strictness, and introduce first contract modules.

---

## First Migration Scope

The first TypeScript implementation sprint should be small:

1. Add TypeScript tooling/configuration in Vite/Vitest with `allowJs` and no broad conversion.
2. Add typed contract modules for canonical model JSON and run/result payloads.
3. Add type-check command to package scripts.
4. Convert one low-risk domain/helper module or add `.d.ts`/`.ts` contract files without changing runtime behavior.
5. Keep `npm test` and `npm run build` green.
