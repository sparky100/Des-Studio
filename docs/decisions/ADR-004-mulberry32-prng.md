# ADR-004: mulberry32 as the seeded PRNG

**Date:** 2026-05-03
**Status:** Accepted
**Sprint:** Sprint 1

## Context

The engine used `Math.random()` throughout, making simulation results non-reproducible and preventing the seed-per-replication design needed for parallel replications and run replay. A seedable PRNG was required to be threaded through `buildEngine(model, seed, maxCycles)` and passed to every sampling call site.

CLAUDE.md §9 listed mulberry32 and xorshift128 as acceptable candidates. The choice needed to be explicit so future sessions do not swap the PRNG without understanding the reproducibility implications.

## Decision

Use **mulberry32** as the sole PRNG for all simulation sampling. It is implemented as a single exported function `mulberry32(seed)` in `distributions.js` that returns a closure producing values in `[0, 1)`. The seed is a 32-bit integer; the sequence is fully determined by the seed.

`buildEngine(model, seed, maxCycles = 500)` calls `mulberry32(seed ?? 0)` at construction time and threads the resulting `rng` function through `makeCtx` to every `fireBEvent`, `fireCEvent`, `sampleAttrs`, and `sample` call site. No call site may call `Math.random()`.

## Alternatives Considered

**xorshift128:** Equivalent statistical quality and similar code complexity. No meaningful reason to prefer it over mulberry32 for this use case. Mulberry32 is specified in CLAUDE.md §9; xorshift128 was mentioned as an alternative. Mulberry32 selected for consistency with the documented spec.

**A third-party library (e.g., `seedrandom`):** Would provide more PRNG algorithms and better statistical guarantees. Rejected because CLAUDE.md prohibits new dependencies without an ADR, and mulberry32 is adequate for DES workloads where the number of samples per replication is in the thousands, not billions.

## Consequences

### Positive
- Two runs with the same seed produce bit-identical results — verified by the seeded-reproducibility tests in `tests/engine/distributions.test.js`.
- Seed is persisted to the `runs` table so any run can be replayed exactly.
- The PRNG is entirely internal — swapping it later requires only changing `mulberry32` in `distributions.js` and updating the test file.

### Negative
- mulberry32 is a 32-bit PRNG. Period is 2^32 ≈ 4 billion values. For models with very large run counts this is theoretically a concern, but in practice DES runs with thousands of entities are well within the period.
- `mulberry32(0)` is used as a fallback default in `sample()` and `sampleAttrs()`. A call site that forgets to pass `rng` silently uses seed 0 rather than erroring (G4). This is a known limitation documented in the Known Issues register.

### Rules added to CLAUDE.md
- `Math.random()` is listed in §18 Prohibited Patterns for all simulation code.
- `buildEngine` signature requires `seed` parameter: `buildEngine(model, seed, maxCycles = 500)`.
- The seeded RNG rule in §9 ("Seeded RNG — Non-Negotiable") documents mulberry32 as the implementation.

## Open Questions

If parallel web workers are added for multi-replication, each worker must receive a distinct seed. The seed assignment strategy (e.g., `baseSeed + replicationIndex`) should be documented when parallel workers are designed.
