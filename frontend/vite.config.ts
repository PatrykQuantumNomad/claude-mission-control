// Source: tanstack.com/router (Vite Plugin Setup) + vite.dev/config/server-options

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    // MUST come before the React plugin (tanstackRouter must be FIRST)
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
  ],
  server: {
    port: 5173,            // dev only — never reached in production
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: false, // localhost; same origin model
      },
      // Phase 2 will add /v1/logs and /v1/metrics; for now /api is enough
    },
  },
  build: {
    outDir: 'dist',         // → frontend/dist/
    emptyOutDir: true,
    sourcemap: false,
  },
  // base: './' if FastAPI mounts at a non-root path; default '/' is fine here
})
