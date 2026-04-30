// Playwright config — Phase 9 Plan 05 Task 2 (TEST-01..04).
//
// Locked decisions per RESEARCH §D8/§D9:
//   - chromium-only (single-developer macOS dashboard; multi-browser is v2)
//   - Run against `vite preview` (production build), NEVER `vite dev`
//     — Pitfall P9: HMR causes flake (DOM repaints between page.click and
//       page.locator).
//   - webServer launches BOTH backend (uvicorn) and the vite preview server.
//   - reuseExistingServer=true so a developer who already has `cc start`
//     running OR a stray vite preview from a prior run doesn't conflict.
//
// Q6=manual locked: this config is invoked only via `npm run test:e2e` at
// close-out. There is no CI gate in v1.
//
// baseURL=127.0.0.1:4173 — explicit IPv4 to match the backend bind address
// and avoid IPv6 (::1) ambiguity when uvicorn binds to 127.0.0.1.

/// <reference types="node" />

import { env } from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // Schedules test mutates server state — keep serial.
  retries: 0,
  workers: 1,
  reporter: env.CI ? 'github' : 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Backend uvicorn — relies on factory create_app(); same invocation as
      // backend/scripts/start.sh but bound explicitly for tests.
      command:
        'cd ../backend && uv run uvicorn cmc.app.factory:create_app --factory --host 127.0.0.1 --port 8765',
      url: 'http://127.0.0.1:8765/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Vite preview — serves the production build from ./dist.
      // Must run `npm run build` before `npm run test:e2e` (or chain it in CI).
      // --host 127.0.0.1 forces IPv4 to match the URL Playwright probes.
      // (Vite's default `localhost` may resolve to ::1 only on macOS, which
      //  Playwright's webServer health check then misses.)
      command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
