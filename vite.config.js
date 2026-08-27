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
    // Vitest's `poolOptions` is a POOL-CONSTRUCTION-time setting, not a
    // per-file/per-test one: `test.projects` all share ONE 'forks' pool
    // instance (built once, from this root config), so `poolOptions` set
    // inside an individual project's `test` block below is silently
    // ignored — confirmed empirically (an absurd `--max-old-space-size`
    // nested there had zero effect). testTimeout/hookTimeout, in contrast,
    // ARE read per-project at file-execution time, so those stay on the
    // `soak` project below where they belong. maxForks/execArgv here apply
    // to unit+ui too, not just soak — harmless (more heap headroom never
    // hurts; a 2-fork cap still leaves real parallelism for the fast tier,
    // just less than unbounded CPU-count-based default).
    poolOptions: {
      forks: {
        maxForks: 2,
        // determinism-parity.test.js's scenario set includes a
        // deliberately-unstable queue (ρ>1, grows without bound up to its
        // 250k-cycle cap); the engine has no flag to skip full trace-log
        // accumulation (a src/engine/ change, out of scope for a
        // test-suite change), so that single file's worst-case memory
        // footprint exceeds Node's ~4GB default heap ceiling on a
        // standard CI runner, independent of cross-file accumulation.
        // 6144MB x maxForks(2) = 12GB worst case, safely under a standard
        // GitHub-hosted runner's 16GB.
        execArgv: ['--max-old-space-size=6144'],
      },
    },
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
          // separate "Simulation soak" job (`npm run test:soak`). Pool
          // concurrency/heap settings (maxForks, execArgv) are configured
          // on the root `test` block above, not here — see its comment.
          testTimeout: 240000,
          // Vitest's beforeAll/afterAll hooks use a SEPARATE default timeout
          // (10s) from testTimeout — easy to miss, since a hook that merely
          // wraps a run() call reads like it inherits the test's own budget.
          // Match hookTimeout to testTimeout here so a soak-tier beforeAll
          // that runs a full simulation doesn't silently timeout-and-skip
          // its dependent tests instead of failing loudly.
          hookTimeout: 240000,
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
