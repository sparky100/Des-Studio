import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Resolve the commit the build was produced from, so a deployed bundle's
// provenance can be checked from the running app (About modal) without
// needing access to the hosting provider's dashboard. Falls back to the
// host platform's own commit-SHA env var (set by most CI/deploy providers,
// e.g. VERCEL_GIT_COMMIT_SHA) if `git` isn't available in the build sandbox.
function resolveBuildSha() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    const fallback = process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA;
    return fallback ? fallback.slice(0, 7) : 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.md'],
  define: {
    // Inject package.json version at build time; no manual version maintenance
    // needed. The version field stays valid semver; "Beta" is display-only.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      `${process.env.npm_package_version} Beta`
    ),
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(resolveBuildSha()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  test: {
    globals: true,
    // Vitest reuses one jsdom `window`/environment across test files that
    // land on the same worker (this became visible under vitest 3 in a way
    // it wasn't under 1.x — a handful of tests were relying on a fresh
    // `window` per file). `vi.stubGlobal(...)`-based mocks were already
    // fine either way; these two flags auto-restore them (and any stubbed
    // process.env vars) after every test regardless, closing off the
    // easiest way for a test to leak global state into an unrelated file
    // that happens to share its worker.
    unstubGlobals: true,
    unstubEnvs: true,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      // Deno-style `https://` imports; can't run under Node/Vitest.
      'supabase/functions/**',
    ],
    // Three tiers, run as separate `vitest run --project <name>` invocations
    // (see package.json's `test`/`test:soak`/`test:all` scripts) so the fast
    // majority of the suite gets real cross-file parallelism instead of being
    // serialised behind the handful of files that run full simulations.
    // `poolOptions.forks.singleFork` used to be set globally with the
    // (non-functional — poolOptions isn't scoped by poolMatchGlobs) intent of
    // applying only to tests/benchmarks/**; that serialised every file in the
    // repo into one child process, which both made the suite slow and let its
    // heap grow unbounded until CI's forks OOM'd.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          setupFiles: ['tests/setup-node.js'],
          testTimeout: 15000,
          include: [
            'tests/**/*.test.{js,ts}',
            'src/db/**/__tests__/**/*.test.js',
            'src/engine/**/__tests__/**/*.test.js',
            'src/llm/**/__tests__/**/*.test.js',
            'src/reports/**/__tests__/**/*.test.js',
          ],
          exclude: [
            'tests/ui/**',
            // Soak-tier files (see the `soak` project below).
            'tests/benchmarks/**',
            'tests/engine/benchmarks/**',
            'tests/engine/determinism-parity.test.js',
            'tests/engine/perf_timing.test.js',
            'tests/engine/adaptive-batch.test.js',
            'tests/engine/replication-ci.test.js',
            'tests/engine/pruning.test.js',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          setupFiles: ['tests/setup-jsdom.js'],
          testTimeout: 15000,
          include: [
            'tests/ui/**/*.test.{js,jsx}',
            'src/ui/**/__tests__/**/*.test.{js,jsx}',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'soak',
          environment: 'node',
          setupFiles: ['tests/setup-node.js'],
          // Full-simulation / replication / benchmark runs genuinely take
          // minutes of CPU-bound work, out of the fast tiers above so
          // everyday `npm test` stays quick. Run on every push via CI's
          // separate "Simulation soak" job (`npm run test:soak`).
          //
          // Deliberately NOT `singleFork: true`: Vitest's `isolate: true`
          // (default) recycles the worker process between test files to
          // reset its heap, but `singleFork` forces the whole run into one
          // OS process for its entire duration, which disables that
          // recycling. `maxForks: 2` still bounds how many heavy
          // simulations run concurrently — soak is its own isolated CI job
          // now, so the original reason a single fork existed at all
          // (avoid starving the fast tiers' parallel workers of CPU) no
          // longer applies within this job.
          //
          // execArgv raises each worker's heap ceiling above Node's ~4GB
          // default: determinism-parity.test.js's stress scenarios include
          // one deliberately-unstable queue (ρ>1, grows without bound up to
          // its 250k-cycle cap) and the engine has no way to opt out of
          // full trace-log accumulation (that's a src/engine/ change, out
          // of scope here) — that single file's worst case exceeds 4GB on
          // its own on a standard CI runner, independent of cross-file
          // accumulation. 6144MB x maxForks(2) = 12GB worst case, safely
          // under a standard GitHub-hosted runner's 16GB.
          testTimeout: 240000,
          // Vitest's beforeAll/afterAll hooks use a SEPARATE default timeout
          // (10s) from testTimeout — easy to miss, since a hook that merely
          // wraps a run() call reads like it inherits the test's own budget.
          // Match hookTimeout to testTimeout here so a soak-tier beforeAll
          // that runs a full simulation doesn't silently timeout-and-skip
          // its dependent tests instead of failing loudly.
          hookTimeout: 240000,
          poolOptions: {
            forks: {
              maxForks: 2,
              execArgv: ['--max-old-space-size=6144'],
            },
          },
          include: [
            'tests/benchmarks/**/*.test.js',
            'tests/engine/benchmarks/**/*.test.js',
            'tests/engine/determinism-parity.test.js',
            'tests/engine/perf_timing.test.js',
            'tests/engine/adaptive-batch.test.js',
            'tests/engine/replication-ci.test.js',
            'tests/engine/pruning.test.js',
          ],
        },
      },
    ],
  },
})
