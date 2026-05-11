/**
 * cmc ESLint plugin — POLI-14 + CONT-05.
 *
 * Re-exports the two custom rules consumed by `frontend/eslint.config.js`.
 *
 * Authored: Phase 24 plan 06. Frontend `package.json` has `"type": "module"`,
 * so this file uses the `.cjs` extension to stay CommonJS; the ESM flat
 * config consumes it via `createRequire`.
 */
'use strict'

module.exports = {
  rules: {
    'testid-registry-only': require('./testid-registry-only.cjs'),
    'no-raw-z-index': require('./no-raw-z-index.cjs'),
  },
}
