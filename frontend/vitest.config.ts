import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Phase 5 Plan 01 — Vitest 4 + happy-dom + RTL 16 config.
//
// Deviation (Rule 3 — environment plumbing): the test scripts in package.json
// run with `NODE_OPTIONS=--no-experimental-webstorage`. Node 25.x exposes a
// bare `globalThis.localStorage = {}` (no methods) by default via experimental
// Web Storage. That bare object shadows happy-dom's Storage Proxy that
// Vitest's populateGlobal would otherwise inject — leaving setItem/clear
// undefined on `window.localStorage` inside tests. Disabling the experimental
// flag lets happy-dom's localStorage land cleanly. Tracked in 05-01-SUMMARY.
//
// Note: NOT using mergeConfig(viteConfig, ...) because the project's vite.config
// pulls in tanstackRouter, which would regenerate routeTree.gen.ts on every
// Vitest run. We explicitly opt back into the @vitejs/plugin-react transform
// so JSX/TSX in tests compiles correctly.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/__tests__/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/routeTree.gen.ts', 'src/**/*.test.{ts,tsx}'],
    },
  },
})
