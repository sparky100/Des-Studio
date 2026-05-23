import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.md'],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**', 'jsdom'],
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
