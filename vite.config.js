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
          // minutes of CPU-bound work; keep them serialised in one fork so
          // they don't compete with each other for CPU, but out of the fast
          // tiers above so everyday `npm test` stays quick. Run on every push
          // via CI's separate "Simulation soak" job (`npm run test:soak`).
          testTimeout: 240000,
          poolOptions: {
            forks: {
              singleFork: true,
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
