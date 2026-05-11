// Flat-config ESLint setup — Phase 24 plan 06 (POLI-14 + CONT-05).
//
// Minimal scope by design (research OQ#5): we run only the two custom
// invariant rules — `cmc/testid-registry-only` and `cmc/no-raw-z-index` —
// on `src/` + `tests/`. A project-wide stylistic lint sweep is explicitly
// deferred to a future phase; this config exists to enforce the testid
// registry and the z-index ladder, not to police style.
//
// `package.json` has `"type": "module"`, so this file is ESM; the CMC
// plugin lives in `eslint-rules/index.cjs` and we load it through
// `createRequire` to bridge the CJS/ESM gap cleanly.

import { createRequire } from 'node:module'
import tseslint from 'typescript-eslint'

const require = createRequire(import.meta.url)
const cmc = require('./eslint-rules/index.cjs')

// Shim no-op rules for plugins we do NOT load but whose names appear in
// `eslint-disable-next-line` directives across the v1.2 baseline
// (react-hooks/exhaustive-deps). Defining the rule lets the disable
// directive resolve without flipping ESLint's "rule not found" fatal.
// Real react-hooks coverage is intentionally deferred (research OQ#5).
const noop = () => ({})
const stubRule = {
  meta: { type: 'suggestion', docs: { description: 'stub' }, schema: [] },
  create: noop,
}
const reactHooksStub = {
  rules: { 'exhaustive-deps': stubRule, 'rules-of-hooks': stubRule },
}

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/routeTree.gen.ts',
      'src/routes/routeTree.gen.ts',
      'eslint-rules/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.d.ts',
    ],
  },
  // typescript-eslint recommended provides the parser + a baseline rule set;
  // we disable the rules that would require a full lint sweep below.
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    linterOptions: {
      // Pre-existing `eslint-disable` directives in the v1.2 codebase reference
      // rules we don't load (react-hooks/exhaustive-deps, no-console). Treating
      // those as unused-disable warnings would derail `--max-warnings 0`. The
      // unused-directive flagger is informational, not invariant-enforcing, so
      // we silence it here. Reinstate when phases 25+ adopt those rules.
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { cmc, 'react-hooks': reactHooksStub },
    rules: {
      'cmc/testid-registry-only': 'error',
      'cmc/no-raw-z-index': 'error',
      // Per research OQ#5: minimal scope. Silence stylistic TS rules that
      // would require a full lint sweep — that work is intentionally
      // deferred. Phases 25+ may opt in to additional rules if they choose.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
    },
  },
]
