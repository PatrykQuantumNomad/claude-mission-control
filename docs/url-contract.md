# URL contract

Every URL pattern in this document is preserved across phases. Breaking a pattern requires explicit migration planning + a deprecation phase. The `backend/tests/test_url_contract.py` pytest gate (Phase 24 plan 05) fails CI if a documented pattern is missing from `frontend/src/routes/`, or if a route file in `frontend/src/routes/` is not documented here.

Established: Phase 24 (POLI-13). Locked invariant from REQUIREMENTS.md milestone constraints: "Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are forbidden."

## Routes

| URL pattern         | Route file                       | Description                            | validateSearch shape |
|---------------------|----------------------------------|----------------------------------------|----------------------|
| `/`                 | `routes/index.tsx`               | Mission Control / Home                 | none in v1.2; Phase 26 may add |
| `/activity`         | `routes/activity.tsx`            | Activity heatmap + sessions list       | none in v1.2; Phase 26 may add |
| `/skills`           | `routes/skills.tsx`              | Skills registry                        | none in v1.2 |
| `/skills/$name`     | `routes/skills_.$name.tsx`       | Skill detail (per-skill panels)        | none in v1.2 |
| `/sessions/compare` | `routes/sessions_.compare.tsx`   | Session compare (TWO-arg required)     | `{ a: string, b: string }` (validated; v1.2 baseline — only existing `validateSearch` route) |
| `/cost`             | `routes/cost.tsx`                | Cost analytics                         | none in v1.2 |
| `/alerts`           | `routes/alerts.tsx`              | Alert rules + events                   | none in v1.2 |

## Stability rules

- **Adding a search param to an existing route is BACKWARDS-COMPATIBLE if and only if** the new param has a default value that reproduces the pre-change behavior. Rolling forward Phase 25 / 26 / 27 / 28 changes adhere to this rule.
- **Removing a search param requires a deprecation phase.** Telegram deep-links and browser bookmarks must continue to resolve.
- **Renaming a route file requires a phase-level migration plan + a redirect** from old to new (or graceful 404 with explanation). Forbidden as a silent rename.
- **`schemaVersion` field on every route's `validateSearch` shape (Phase 25)** — append-only schema evolution.

## Phase 24 effects on URL contract

- No new routes added; no `validateSearch` shapes changed. Phase 24 is shell + primitives + quality gates only.
- The `cmc.density`, `cmc.theme`, `cmc.sidebar.collapsed` keys are localStorage-only — they intentionally do NOT enter the URL.

## Test gate

`backend/tests/test_url_contract.py` (Phase 24 plan 05) parses this doc and asserts:

1. Every URL pattern documented here has a corresponding route file in `frontend/src/routes/`.
2. Every route file in `frontend/src/routes/` (excluding `__root.tsx` and `routeTree.gen.ts`) is documented here.

Both directions enforce drift-free coverage.
