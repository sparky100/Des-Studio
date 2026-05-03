import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/ui/**', 'jsdom'],
    ],
    globals: true,
    setupFiles: ['tests/setup.js'],
  },
})
