/**
 * cmc/testid-registry-only — POLI-14.
 *
 * Forbids JSX `data-testid="..."` literals not present in
 * docs/testid-registry.md. For dynamic values (template literals with
 * expressions) the rule reconstructs the literal shape (e.g.
 * `sidebar-link-{x}`) and matches it against the dynamic-pattern list.
 *
 * Implementation:
 *   1. Load docs/testid-registry.md once at rule init; parse bullet items.
 *   2. Visit JSXAttribute name="data-testid"; check membership.
 *
 * Authored: Phase 24 plan 06.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function loadRegistry() {
  // docs/ lives at the repo root; from frontend/eslint-rules/, go up two levels.
  const docPath = path.resolve(
    __dirname,
    '..',
    '..',
    'docs',
    'testid-registry.md',
  )
  if (!fs.existsSync(docPath)) return { exact: new Set(), patterns: [] }
  const text = fs.readFileSync(docPath, 'utf8')
  const exact = new Set()
  const patterns = []
  // Match bullet list items with backtick-quoted IDs at the start of a line.
  // Lines like "- `density-toggle-trigger` — description"
  for (const m of text.matchAll(/^-\s+`([^`]+)`/gm)) {
    const id = m[1]
    if (id.includes('{') && id.includes('}')) {
      // dynamic: convert sidebar-link-{slug} to a regex.
      // The pattern matches the rule's reconstructed shape, where `${expr}`
      // becomes literally `{x}` (single placeholder token).
      const escaped = id
        .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
        .replace(/\{[^}]+\}/g, '\\{x\\}')
      patterns.push(new RegExp('^' + escaped + '$'))
    } else {
      exact.add(id)
    }
  }
  return { exact, patterns }
}

const REGISTRY = loadRegistry()

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Restricts data-testid usage to the values registered in docs/testid-registry.md',
    },
    schema: [],
    messages: {
      unregistered:
        'data-testid "{{id}}" is not registered in docs/testid-registry.md',
      dynamicUnregistered:
        'Dynamic data-testid template "{{template}}" matches no pattern in docs/testid-registry.md',
    },
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (!node.name || node.name.name !== 'data-testid') return
        const v = node.value
        if (!v) return

        // 1. String literal: <div data-testid="foo" />
        if (v.type === 'Literal' && typeof v.value === 'string') {
          if (!REGISTRY.exact.has(v.value)) {
            context.report({
              node,
              messageId: 'unregistered',
              data: { id: v.value },
            })
          }
          return
        }

        // 2. Expression container: <div data-testid={...} />
        if (v.type === 'JSXExpressionContainer') {
          const expr = v.expression

          // 2a. String literal inside braces: <div data-testid={"foo"} />
          if (expr.type === 'Literal' && typeof expr.value === 'string') {
            if (!REGISTRY.exact.has(expr.value)) {
              context.report({
                node,
                messageId: 'unregistered',
                data: { id: expr.value },
              })
            }
            return
          }

          // 2b. Template literal: <div data-testid={`foo-${x}`} />
          if (expr.type === 'TemplateLiteral') {
            if (expr.expressions.length === 0) {
              // Pure template (no interpolation): treat as literal.
              const raw = expr.quasis.map((q) => q.value.cooked).join('')
              if (!REGISTRY.exact.has(raw)) {
                context.report({
                  node,
                  messageId: 'unregistered',
                  data: { id: raw },
                })
              }
              return
            }
            // Reconstruct as `prefix{x}middle{x}suffix`.
            const reconstructed = expr.quasis
              .map((q, i) =>
                i < expr.expressions.length
                  ? q.value.cooked + '{x}'
                  : q.value.cooked,
              )
              .join('')
            const ok = REGISTRY.patterns.some((p) => p.test(reconstructed))
            if (!ok) {
              context.report({
                node,
                messageId: 'dynamicUnregistered',
                data: { template: reconstructed },
              })
            }
            return
          }

          // 2c. Any other expression (Identifier, MemberExpression, CallExpression…)
          //     is opaque — we cannot statically verify it. Skip silently;
          //     responsibility shifts to the author + code-review.
        }
      },
    }
  },
}
