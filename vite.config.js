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
    // Inject package.json version at build time; no manual version maintenance needed.
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.npm_package_version
    ),
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(resolveBuildSha()),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**',               'jsdom'],
      ['src/ui/**/__tests__/**',    'jsdom'],
    ],
    globals: true,
    setupFiles: ['tests/setup.js'],
    // Run heavy benchmark tests in their own single fork so they don't
    // starve the parallel UI test workers of CPU time.
    poolMatchGlobs: [
      ['tests/benchmarks/**',        'forks'],
      ['tests/engine/benchmarks/**', 'forks'],
    ],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})
