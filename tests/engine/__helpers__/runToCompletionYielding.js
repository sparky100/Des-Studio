// Shared by tests/engine/determinism-parity.test.js and
// tests/engine/perf_timing.test.js — both need to run a benchmark scenario
// to completion without tripping vitest's worker heartbeat.
//
// Vitest's worker RPC layer (birpc) enforces a hard, non-configurable 60s
// timeout on its internal onTaskUpdate heartbeat calls between the worker
// process and the main orchestrator — a literal `DEFAULT_TIMEOUT = 6e4`
// constant, present unchanged in both vitest 3.2.7 and the latest 4.x
// (checked both sources directly; not a version-specific bug, and there is
// no vitest config that raises it). The heaviest scenario
// (refugee-displacement-corridor) runs engine.runAll() synchronously for
// ~70-75s, which blocks the worker's event loop past that window; when the
// loop frees up, the overdue heartbeat fires and crashes the whole
// `vitest run`, even though the test itself already passed — confirmed this
// is unrelated to (and not fixable by) the test's own `timeout` option,
// which governs a different timeout entirely. A process-level
// `unhandledRejection` guard was tried and does not work: vitest's own
// handler in the main process reacts to the same rejection independently of
// anything registered here.
//
// The actual fix: yield to the event loop periodically during the run, so
// the heartbeat can always be serviced. runAll() (src/engine/index.js)
// can't be made async without breaking every other synchronous caller in
// the app, so this reimplements its outer loop locally using only its
// already-public API. This is provably equivalent to runAll() for every
// scenario this file exercises: none of tests/engine/benchmark-scenarios.js
// configures purge (grepped), and outside of purge handling, step() already
// self-terminates internally on FEL-empty, maxSimTime reached, maxCycles
// reached, and termination-condition-met — runAll()'s own outer-loop guard
// conditions are a redundant early exit in that case, not additional logic.
// buildResult() is the exact same function runAll() itself calls to build
// its return value.
//
// yieldEveryCycles default: previously 500. Profiling
// refugee-displacement-corridor (the scenario that actually trips this)
// found individual engine.step() calls costing up to ~1.5s and 500-cycle
// buckets up to ~3s even on an idle, unloaded machine — and this recurred
// in CI as the exact "Timeout calling onTaskUpdate" error the comment above
// describes, meaning real CI contention (shared runners, two heavy soak
// forks competing for CPU under vite.config.js's maxForks: 2) pushes
// individual 500-cycle gaps well past the 60s heartbeat window. Yielding
// every cycle instead bounds the worst-case gap to one step's own cost
// (~1.5s observed) — the one thing that genuinely can't be interrupted —
// rather than to N steps' cumulative cost, which scales with CI load in a
// way this test has no control over. Verified the overhead is immaterial:
// timed refugee-displacement-corridor (~54k cycles) at yieldEveryCycles=1
// vs. the old 500 back to back on the same machine, several times each —
// both land in the same ~110-145s band, run to run, with no consistent gap
// between them; whatever per-yield cost setImmediate scheduling adds is
// smaller than this machine's own run-to-run variance.
export async function runToCompletionYielding(engine, yieldEveryCycles = 1) {
  let cycles = 0;
  while (true) {
    const r = engine.step({ captureSnap: false });
    if (r.done) break;
    cycles++;
    if (cycles % yieldEveryCycles === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return engine.buildResult();
}
