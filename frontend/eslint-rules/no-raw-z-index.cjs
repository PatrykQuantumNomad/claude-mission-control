/**
 * cmc/no-raw-z-index — CONT-05 enforcement.
 *
 * Bans JSX `style={{ zIndex: <number> }}` literals. Use `--cmc-z-*`
 * CSS variables from `styles.css :root` instead (see docs/z-index-ladder.md).
 *
 * CSS files are policy-only — out of scope for ESLint; reviewed via PR.
 *
 * Authored: Phase 24 plan 06.
 */
'use strict'

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallows raw zIndex integers in JSX inline style; use --cmc-z-* CSS variables.',
    },
    schema: [],
    messages: {
      rawZIndex:
        'Raw zIndex {{value}} in inline style — use a --cmc-z-* CSS variable from styles.css :root (see docs/z-index-ladder.md).',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (!node.key) return
        const keyName =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal'
              ? node.key.value
              : null
        if (keyName !== 'zIndex') return
        const v = node.value
        if (
          v &&
          v.type === 'Literal' &&
          typeof v.value === 'number'
        ) {
          context.report({
            node,
            messageId: 'rawZIndex',
            data: { value: String(v.value) },
          })
        }
      },
    }
  },
}
