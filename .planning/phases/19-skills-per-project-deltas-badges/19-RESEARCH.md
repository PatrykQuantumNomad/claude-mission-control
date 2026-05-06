# Phase 19: Skills Per-Project, Deltas & Badges - Research

**Researched:** 2026-05-06
**Domain:** SQLite read-time analytics (CTE prev-period windowing, DST-correct day arithmetic), Alembic schema-add migration with backfill, project_key normalization (sha1 of realpath), React/TanStack Query delta-pill + badge rendering on existing Skills panels
**Confidence:** HIGH (every claim grounded in repo evidence at HEAD; SQLite DST behavior cross-checked with the v1.1 fleet of `datetime('now', '-N days')` call sites already in production paths)

## Summary

Phase 19 bolts three features onto the existing Phase 14 skills router and frontend Skills page WITHOUT disrupting the v1.1 invariants (Decimal-as-JSON-string, prev-period CTEs derived from same source as totals, server-as-source-of-truth for thresholds, no path leakage). The phase ships exactly **one** schema migration (`0003_project_key`) — adding `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''` plus an index, with a backfill that hashes `realpath(cwd.rstrip('/'))` to `sha1[:12]`. Phase 20 (ANLY-07) consumes this column without further migration churn.

The three feature surfaces compose cleanly:
- **SKLP-08:** New endpoint `GET /api/skills/{name}/projects` joins `otel_events.skill_activated` to `sessions` on `session_id`, groups by `sessions.project_key`, and returns a sortable per-project rollup (project_key, count, p50/p95 latency, cost via dual-path attribution).
- **SKLP-09:** Period-over-period delta pills (7d-vs-prev-7d) for cost and usage count, derived via prev-period CTE in the same router; rendered on TopSkills, SkillCostCard, and `/skills/$name`.
- **SKLP-10:** Backend-computed `new_this_week` / `dormant` flags from `MIN(ts)` / `MAX(ts)` over `skill_activated` events, with cold-start suppression for skills <14 days old. DST-correct via SQLite `datetime('now', '-N days')` (UTC) — NOT local-time arithmetic.

**Primary recommendation:** Land the migration in a Wave 0 plan ahead of all feature work; build per-project endpoint and delta CTE in parallel Wave 1 plans (independent SQL surfaces, share schemas only for response shapes); reserve a single Wave 2 plan for badge rules + cold-start suppression so the unit test crossing the spring-forward boundary is co-located with the rule logic. Frontend wires up in a final Wave 3 plan once all three endpoints stabilize.

<user_constraints>
## User Constraints (from phase_context — no CONTEXT.md exists for Phase 19)

### Locked Decisions (from STATE.md / ROADMAP.md success criteria)

**Migration `0003_project_key` is owned by Phase 19** (Phase 20 ANLY-07 consumes without migration churn).
- Column: `sessions.project_key VARCHAR(12) NOT NULL DEFAULT ''`
- Indexed (per ROADMAP success criterion 2)
- Backfilled in same migration upgrade()
- Available for Phase 20 to consume without further migration

**`project_key` derivation:** `sha1[:12]` of `realpath(cwd.rstrip('/'))` — NEVER raw `cwd`, NO path leakage in API responses.
- Stable: same project always hashes to same key (path-canonicalized).
- One-way: response shape MUST NOT include `cwd` or any other path-shaped field; `project_key` is the only project identifier the user sees.

**Per-project endpoint shape:** `GET /api/skills/{name}/projects` returns rows keyed by `project_key`. No filesystem path leakage.

**Delta pill methodology:** 7d-vs-prev-7d, derived via prev-period CTE in the existing skills router (NOT a separate `/deltas` endpoint, NOT a frontend computation). UI renders ↑/↓ pill with absolute delta + percent.

**Badge rules:**
- "new this week": `first_activated_at` (= `MIN(ts)` over `skill_activated` for that skill) within last 7 days
- "dormant": `last_activated_at` (= `MAX(ts)`) older than 30 days
- Cold-start suppression: skills <14 days old (counted from `MIN(ts)`) MUST NOT show "dormant" — even if `last_activated_at` itself satisfies the >30d rule (impossible for a <14-day-old skill, but the suppression rule is the structural guard, not the math)

**DST-correct windowing:** SQLite `datetime('now', '-N days')` in UTC — NEVER local-time arithmetic. Verified by unit test crossing the spring-forward boundary.

**Phase-baseline (Phase 18 BASELINE.md) verifier rules:**
- pytest `passed >= 566`, `failed == 0`
- pytest `warnings_datetime_utcnow > 0` → fail (POLI-06 reverse-direction signal)
- vitest `passed >= 293`, `failed == 0`
- playwright `failed == 0`, `passed >= 7 - skipped_delta`

**Time-factory ban (POLI-06):** Use `cmc.core.time.now_utc` — NEVER `datetime.utcnow`. Structurally enforced by `ruff --select UP` AND `git grep` gates. The migration's backfill code MUST honor this in any inline Python (use `op.execute(...)` with SQL-only, OR if Python required, route through `now_utc`).

**Test-id convention (Phase 18 POLI-08):** kebab-case `feature-component-element` (e.g., `skills-detail-projects-table`, `skill-cost-card-delta-pill`). `data-testid` lives on the source React component, not test wrappers; decorate only when Playwright strict mode collides.

### Claude's Discretion (areas to research and recommend)

- **Table sort behavior** for the per-project table: server-side `ORDER BY` with toggleable column (limit-bounded) vs. client-side sorting in `DataTable`. Recommend client-side; rows are bounded (≤ 50 projects realistically per skill) and `DataTable` already supports column-level `sort: (a, b) => …`.
- **Badge visual treatment:** reuse existing `Badge` UI primitive (`cmc-badge` with neutral/info/success/warning/danger variants). Recommend `info` variant for "new this week" (blue/positive signal), `warning` for "dormant" (amber/attention).
- **Delta pill rendering:** new tiny component (e.g., `DeltaPill`) co-located with the existing `Badge` in `frontend/src/components/ui/`. ↑/↓ as Unicode arrows, color-coded (green-up for usage count or "lower-is-better" cost? — recommend neutral chrome, color reserved for sign indication only). Format: `↑12 (+45%)`.
- **Range coupling:** Should delta CTE bind to the panel's existing `range` toggle (14d/30d) or be hard-coded 7d-vs-prev-7d? Spec says 7d-vs-prev-7d explicitly — recommend hard-coded 7d window for the delta computation, regardless of which range the panel's primary chart uses.
- **Endpoint structure:** Single `GET /api/skills/{name}/projects` returning all of {count, p50_ms, p95_ms, cost_usd, cost_attribution} per project, OR three separate endpoints? Recommend single endpoint — the user sees all three columns in one table, and the dual-path attribution decision applies once per skill (not once per project).
- **Where deltas live in response shape:** Embed in existing `SkillUsageResponse` / `SkillCostResponse` (extend with `delta_count`, `delta_cost`, `delta_pct`)? Or new sibling field `previous` carrying the prev-period totals so the UI does the math? Recommend backend computes the delta + percent and emits a typed `DeltaPill` shape (`{value: int, delta: int, delta_pct: float, direction: '↑'|'↓'}`) — server is source of truth, no float arithmetic in TS.

### Deferred Ideas (OUT OF SCOPE — DO NOT plan)

- **Per-project cost breakdown card on cost dashboard** → Phase 20 ANLY-07
- **Cost forecast** → Phase 20 ANLY-06
- **Alert NL authoring / sliding-window anomaly** → Phase 21
- **Skill latency overhead decomposition** → Phase 22 (spike-gated)
- **Per-project latency overhead, percentile splits** → Phase 22 if SKLP-11 ships, else v1.3
- **Heatmap toggle on per-project breakdown** → SKLP-13, v1.3 candidate
</user_constraints>

## Standard Stack

### Core (already in repo — DO NOT add deps)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy + sqlmodel | existing | ORM + async query layer | Phase 14 skills router uses `sqlalchemy.text()` raw SQL with `db.execute().mappings().all()` for analytics — keep the pattern |
| Alembic | existing | Migration tooling (CLI + lifespan-injected connection) | 0001/0002 already use `op.batch_alter_table` for SQLite ALTER workaround — Phase 19 follows |
| FastAPI + Pydantic v2 | existing | Endpoint + DTO layer | `Decimal` serialized as JSON string per Pydantic v2 default; DO NOT pipe through `jsonable_encoder` |
| TanStack Query | existing | Frontend data fetching | Existing `useSkillUsage` / `useSkillCost` hooks at 60s/45s cadence — extend pattern |
| TanStack Router | existing | File-based routes | `/skills/$name` already lives at `routes/skills_.$name.tsx` (trailing-underscore opt-out) |
| Recharts | existing | Sparklines | Trend charts on SkillCostCard / TopSkills already use `LineChart` |

**Zero net-new dependencies** (STATE.md v1.2 roadmap-time decision; verified — `hashlib.sha1` is stdlib, no new packages).

### Supporting (already imported elsewhere — reuse)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `hashlib` (stdlib) | py3.12 | sha1 for project_key | Backfill SQL needs Python helper OR pure-SQL `hex(substr(?, 1, 12))` — see Architecture below |
| `os.path.realpath` (stdlib) | py3.12 | Canonicalize cwd | Backfill helper needs Python — pure SQL can't canonicalize symlinks |
| `cmc.core.time.now_utc` | local | Naive UTC factory | Any Python timestamp the migration backfill emits MUST go through this |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure-SQL backfill | Python loop over rows | Pure SQL can't `realpath` (symlink resolution); Python loop is the canonical path. Mirrors how 0002 backfilled session_id via `op.execute("UPDATE … json_extract …")` for SQL-only logic, but `realpath` is filesystem-level. |
| Computing `first_activated_at` / `last_activated_at` at read-time via `MIN(ts)` / `MAX(ts)` | Materialize on `skills` table as columns | Read-time MIN/MAX over `otel_events.skill_activated` is fast (indexed via `idx_otel_events_attrs_skill_name` from migration 0002); no need to denormalize. Mirrors the v1.1 invariant (tokens stored, $ computed at read time). |
| Server-emitted `delta_pct: float` | Server-emitted `delta_pct: Decimal` JSON-string | Phase 14 SkillCostResponse uses Decimal-as-string for `cost_usd` (correctness-critical money). For UI delta percent, `float` is fine — no precision invariant. Match the existing `error_rate: float` precedent in `SkillLatencyResponse`. |
| Single combined "deltas + per-project + badges" endpoint | Three logical endpoints | Each maps to a different request: TopSkills wants the deltas inline with usage; per-skill detail wants per-project + deltas + badges; the projects table is its own request. Single combined endpoint over-couples cadences. |

**Installation:**
None. Net-zero deps locked by STATE.md.

## Architecture Patterns

### Recommended Plan Structure (4 plans, sequenced for clean wave-handoff)

```
19-01-migration-0003-project-key-PLAN.md
  Wave 0 — Schema + backfill, lands first; no other plans run until this is green
  - Alembic 0003 upgrade()/downgrade() with VARCHAR(12) NOT NULL DEFAULT ''
  - Indexed (idx_sessions_project_key)
  - Python-loop backfill: SELECT cwd FROM sessions; UPDATE … SET project_key = sha1
  - test_migrations.py: test_0003_upgrade_from_0002, test_0003_downgrade_to_0002
  - Augment cmc/ingest/scheduler.py to set sess["project_key"] on insert
  - Helper module: cmc/core/project_key.py (compute_project_key(cwd) → str)

19-02-skills-projects-endpoint-PLAN.md
  Wave 1a — Per-project breakdown (SKLP-08)
  - GET /api/skills/{name}/projects
  - Schema: SkillProjectsResponse{ name, range, rows: [SkillProjectRow] }
  - SkillProjectRow{ project_key, count, p50_ms, p95_ms, cost_usd, cost_attribution, low_sample }
  - SQL: JOIN otel_events skill_activated ↔ sessions on session_id, GROUP BY sessions.project_key
  - Reuse dual-path cost CTE; compute per-project p50/p95 via existing window-function pattern
  - test_skills_router.py: 4 tests (happy, empty, missing-skill, no-path-leakage assertion)

19-03-skills-deltas-and-badges-PLAN.md
  Wave 1b — Period-over-period delta CTE + badge rules (SKLP-09 + SKLP-10)
  - Extend SkillUsageResponse with usage_delta: DeltaPill
  - Extend SkillCostResponse with cost_delta: DeltaPill
  - Add badges: ['new_this_week' | 'dormant'] via MIN(ts)/MAX(ts) + 14-day cold-start guard
  - Pure SQLite: datetime('now', '-7 days'), datetime('now', '-14 days'), datetime('now', '-30 days')
  - test: 7d-vs-prev-7d delta math; new/dormant boundary tests; cold-start suppression test;
    DST-spring-forward windowing test (the explicit ROADMAP success criterion #5)

19-04-frontend-deltas-projects-badges-PLAN.md
  Wave 2 — UI wiring
  - New: components/ui/DeltaPill.tsx (↑/↓ + abs + pct, color via sign)
  - New: components/panels/SkillProjectsTable.tsx (DataTable, sortable cost/latency/count cols)
  - Mount on routes/skills_.$name.tsx (after SkillCostCard, before SkillRunsTable)
  - Extend TopSkills.tsx, SkillCostCard.tsx with DeltaPill in panel header/body
  - Add badges (Badge component, info/warning variants) on TopSkills row + SkillsRegistry row
  - Vitest: DeltaPill.test.tsx (sign, format, zero-edge); SkillProjectsTable.test.tsx (sort, empty)
  - Playwright: skill-detail.spec.ts opens /skills/$name, asserts projects table renders;
    NO assertion against cwd — testid is `skills-detail-projects-table`, rows show project_key only
```

### Pattern 1: Migration with Python-Loop Backfill

**What:** Schema add column + index + Python loop reading existing rows, computing project_key, writing back.

**When to use:** Whenever the backfill needs filesystem-level operations (realpath) that pure SQL can't express. Migration 0002 used pure-SQL backfill (json_extract) for session_id; 0003 needs Python.

**Example:**
```python
# Source: backend/migrations/versions/0003_project_key.py (NEW)
import hashlib
import os
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0003_project_key"
down_revision: str | None = "0002_v1_1_alerts_and_skills"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def _compute_project_key(cwd: str | None) -> str:
    """sha1[:12] of realpath(cwd.rstrip('/')). Returns '' for None/empty cwd."""
    if not cwd:
        return ""
    canonical = os.path.realpath(cwd.rstrip("/"))
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]


def upgrade() -> None:
    # Add the column with server_default='' so existing rows satisfy NOT NULL.
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "project_key",
                sqlmodel.sql.sqltypes.AutoString(length=12),
                nullable=False,
                server_default="",
            )
        )
        batch_op.create_index("idx_sessions_project_key", ["project_key"], unique=False)

    # Backfill: realpath needs Python (SQLite can't resolve symlinks).
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT session_id, cwd FROM sessions")).fetchall()
    for sid, cwd in rows:
        pk = _compute_project_key(cwd)
        if pk:
            bind.execute(
                sa.text("UPDATE sessions SET project_key = :pk WHERE session_id = :sid"),
                {"pk": pk, "sid": sid},
            )


def downgrade() -> None:
    with op.batch_alter_table("sessions") as batch_op:
        batch_op.drop_index("idx_sessions_project_key")
        batch_op.drop_column("project_key")
```

### Pattern 2: Prev-Period CTE for Delta Computation

**What:** Single SQL query computes current 7d window AND prev 7d window in two CTEs, then JOINs / does arithmetic.

**When to use:** Anywhere the spec calls for period-over-period delta on the same metric. Mirrors how the dual-path cost SQL composes two CTEs (skill_events + api_req_events) before the SELECT.

**Example:**
```sql
-- Source: SKLP-09 prev-period delta CTE (proposed pattern)
WITH curr AS (
  SELECT
    attrs_skill_name AS skill_name,
    COUNT(*) AS curr_count
  FROM otel_events
  WHERE event_name = 'skill_activated'
    AND attrs_skill_name = :name
    AND ts >= datetime('now', '-7 days')
  GROUP BY attrs_skill_name
),
prev AS (
  SELECT
    attrs_skill_name AS skill_name,
    COUNT(*) AS prev_count
  FROM otel_events
  WHERE event_name = 'skill_activated'
    AND attrs_skill_name = :name
    AND ts >= datetime('now', '-14 days')
    AND ts <  datetime('now', '-7 days')
  GROUP BY attrs_skill_name
)
SELECT
  COALESCE(c.curr_count, 0) AS curr,
  COALESCE(p.prev_count, 0) AS prev,
  COALESCE(c.curr_count, 0) - COALESCE(p.prev_count, 0) AS delta
FROM curr c
LEFT JOIN prev p ON p.skill_name = c.skill_name
```

**Critical:** `datetime('now', ...)` in SQLite is UTC by default — exactly what we want for DST-safety. Adding `'localtime'` modifier would re-introduce DST bugs. Verified by every existing call site in `cmc/api/routes/observability.py` (lines 171, 220, 295, 310, 431, 486, 529, 555) and `cmc/cli/doctor.py:592` — all use the bare UTC form.

### Pattern 3: Server-Computed DeltaPill DTO (server-as-source-of-truth)

**What:** Pydantic schema emits the rendered delta — value, delta, delta_pct, direction.

**Why:** Mirrors SKLP-05's `low_sample: bool` pattern (server is source of truth; frontend re-asserts for defense-in-depth). Avoids float arithmetic drift in TS.

**Example:**
```python
# Source: cmc/api/schemas/skills.py (extension)
from typing import Literal

class DeltaPill(BaseModel):
    """Period-over-period delta for cost or usage count.

    Server-computed (matching SKLP-05's "server is source of truth" pattern).
    direction is the rendered arrow; abs(delta) is rendered next to it; pct
    is rendered in parens as `(+45%)` or `(-12%)`.

    delta_pct == None when prev == 0 (avoid div-by-zero / infinity).
    """
    curr: int  # absolute current-period value
    prev: int  # absolute prev-period value
    delta: int  # curr - prev (can be negative)
    delta_pct: float | None  # (curr - prev) / prev when prev > 0; None otherwise
    direction: Literal["up", "down", "flat"]  # sign indicator for the pill
```

For `cost_delta`, swap `int` for `Decimal` (cost is money). Two DeltaPill subtypes — `IntDeltaPill` and `DecimalDeltaPill` — keep the JSON serialization invariant.

### Pattern 4: Per-Project Endpoint with No Path Leakage

**What:** Response carries `project_key` only — never `cwd`, never `display_path`, never `path`.

**Why:** ROADMAP success criterion 1 — "the response shape leaks no filesystem paths."

**Example response:**
```json
{
  "name": "analyze",
  "range": "14d",
  "rows": [
    {
      "project_key": "a3f8d92b1c4e",
      "count": 47,
      "p50_ms": 1200,
      "p95_ms": 4800,
      "cost_usd": "0.4521",
      "cost_attribution": "session",
      "low_sample": false
    }
  ]
}
```

**Test assertion:** Parse the JSON response and assert `'cwd' not in any row`, `'path' not in any row`, `'display_path' not in any row`.

### Anti-Patterns to Avoid

- **Computing project_key on every read.** It's stable per session — compute once on insert (in `cmc/ingest/scheduler.py`) AND in the migration backfill, then store it. Don't recompute at endpoint time.
- **Surfacing `cwd` in the API response.** Even for "debugging" or "tooltip" use. ROADMAP success criterion 1 is unambiguous: no path leakage. The user sees `project_key`; if they want a human-readable label, that's a v1.3 enhancement (the existing `cmc.cwd` mapping in `ProjectBreakdownCard` is a different surface that uses the cost dashboard's `display_path` — Phase 19 doesn't touch that).
- **Hard-coding 7d as a magic literal in 4 different SQL strings.** Bind via parameter or constant: `_DELTA_WINDOW_DAYS = 7`. Mirrors how `_RANGE_TO_DAYS` is centralized in `cmc/api/routes/skills.py:69`.
- **Computing `first_activated_at` from `MIN(s.started_at)` of sessions.** Spec is `first_activated_at` of the SKILL — derived from `MIN(otel_events.ts)` where `event_name = 'skill_activated' AND attrs_skill_name = :name`. The skill may have existed in the registry for months before its first activation; only activations count.
- **Using local-time arithmetic for badge thresholds.** `datetime('now', '-7 days', 'localtime')` reintroduces DST bugs. Stay in UTC.
- **Float arithmetic for `delta_pct` in TS.** Backend emits the float; TS just renders. Don't reconstruct from `(curr - prev) / prev` client-side.
- **Returning `delta_pct: 0.0` when prev is 0.** That's a lie (you don't have a baseline). Emit `null` and render "—" instead of "(+0%)".

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Project canonicalization | A bespoke regex stripping `~`, double-slashes, `..` | `os.path.realpath(cwd.rstrip('/'))` | Symlinks, `..`, double-slashes, etc. all collapse via stdlib realpath. The existing `cmc/api/routes/sessions.py` `display_path` regex is for HUMAN display only; project_key needs *canonical* identity. |
| 12-char short hash | Truncate `uuid4()` or `hash(cwd)` | `hashlib.sha1(canonical.encode()).hexdigest()[:12]` | sha1 collision rate at 12 hex chars (48 bits) over a single user's project set is astronomically low; locked by spec. |
| Period-over-period delta SQL | TWO endpoint calls + diff in TS | Single CTE in same router | Network roundtrip × 2 + race condition on data shifting between requests. CTE is one transaction. |
| Sortable per-project table | DIY `<table>` with sort state hooks | Existing `DataTable` primitive (`frontend/src/components/ui/DataTable.tsx`) | Already supports `DataTableColumn<T>` with `sort: (a, b) => …` and stable sort key. Used by SessionsTable, SkillLatencyTable. |
| Period-over-period delta percent | Manual `Math.abs(curr - prev) / Math.abs(prev)` | Server-computed `delta_pct: float \| None` (Pattern 3) | Avoids div-by-zero, sign confusion, locale issues. Server is source of truth. |
| DST-correct day math in Python | `timedelta(days=7)` arithmetic on `datetime.now()` | `datetime('now', '-7 days')` in SQLite | Python's timedelta is UTC-correct, but the existing skills router idiom uses SQLite arithmetic — mirror it for consistency with cost/observability routers. |
| Badge component | Custom `<span>` styled inline | `Badge` UI primitive at `frontend/src/components/ui/Badge.tsx` | Already has 5 variants (neutral/info/success/warning/danger) with the project's design tokens. |

**Key insight:** Phase 14 already shipped 4 read-time analytics endpoints with the exact patterns Phase 19 needs (raw SQL CTEs, Decimal-as-JSON, dual-path attribution, server-computed booleans). Phase 19 is *additive* — extend the patterns, don't reinvent them.

## Common Pitfalls

### Pitfall 1: `event_name` storage idiom — bare, NOT prefixed

**What goes wrong:** Writing `WHERE event_name = 'claude_code.skill_activated'` returns zero rows.

**Why it happens:** The ingest layer strips the `claude_code.` prefix on insert; SQL filters reference the bare name. Phase 14 router header (lines 224-225) explicitly documents this.

**How to avoid:** ALWAYS `WHERE event_name = 'skill_activated'` (or `'api_request'`, etc.), never the prefixed form. Verify by grepping for any literal `claude_code.skill_activated` in the new SQL — should find nothing.

### Pitfall 2: SkillRange Literal narrows to "14d" | "30d" only

**What goes wrong:** Adding a `range='7d'` parameter to the new `/projects` endpoint or to the delta endpoint produces a 422 (Pydantic Literal mismatch).

**Why it happens:** `SkillRange` is locked at `Literal["14d", "30d"]` (`backend/cmc/api/schemas/skills.py:30`). The 7d window for SKLP-09 deltas is hard-coded — not user-toggleable.

**How to avoid:** For SKLP-09 delta CTE, do NOT bind `range_` to the 7d window — use a constant `_DELTA_WINDOW_DAYS = 7`. The user-facing `range` toggle (14d/30d) remains for the *primary* chart; deltas are independently 7d-vs-prev-7d.

### Pitfall 3: `Field(default_factory=now_utc)` — function reference, NOT call

**What goes wrong:** `Field(default_factory=now_utc())` freezes a single timestamp at import-time across all instances.

**Why it happens:** Same trap as Phase 18 Pitfall 7 (documented in `18-RESEARCH.md`). Calling the function captures the value; passing the function defers the value.

**How to avoid:** `default_factory=now_utc` (no parentheses). The migration backfill is fine because it inlines `now_utc()` per row, but the schema definitions for any new fields MUST use the reference form.

### Pitfall 4: SQLite VARCHAR(12) is advisory, not enforced

**What goes wrong:** Inserting a 14-char string into VARCHAR(12) silently succeeds. The Alembic migration declares `length=12`, but SQLite ignores the length constraint.

**Why it happens:** SQLite type affinity rules (`https://www.sqlite.org/datatype3.html`).

**How to avoid:** The 12-char invariant is enforced in the producer (`compute_project_key` returns `[:12]`) and in tests (`assert all(len(row.project_key) == 12 or row.project_key == '' for row in rows)`). Don't rely on the column constraint.

### Pitfall 5: realpath on a non-existent cwd path

**What goes wrong:** Backfill runs against historical sessions whose `cwd` no longer exists on disk (deleted projects). `os.path.realpath` doesn't error — it returns the input unchanged for missing paths — so this is safe BUT means historical sessions for the same logical project get different keys depending on whether the path was canonicalized at recording-time vs. backfill-time.

**Why it happens:** `realpath` resolves symlinks ONLY for path components that exist; missing tail components are returned literally.

**How to avoid:** Document the limitation in the migration docstring. The project_key for a missing-cwd session is "best-effort" — current sessions (cwd exists) hash correctly; deleted-project sessions may have a stale key. Acceptable per spec — there's no path leakage either way, and the user's active projects (the ones that matter for /skills/$name analytics) are stable.

### Pitfall 6: aiosqlite default-datetime-adapter notices

**What goes wrong:** Pytest emits 32 `aiosqlite.DefaultDatetimeAdapter` warnings (Phase 18 baseline).

**Why it happens:** Out-of-scope for POLI-06, accepted as baseline.

**How to avoid:** Don't introduce *new* warnings. The verifier rule is `total_warnings > 132 → warn` (100-warning headroom). New `default_factory=now_utc` callers don't trigger it; new `datetime.utcnow` calls do — they're banned.

### Pitfall 7: TanStack Router file-route opt-out for `/skills/$name`

**What goes wrong:** Naming the projects-table panel file `skills.$name.projects.tsx` would nest under SkillsPage's parent route, which has no `<Outlet/>`.

**Why it happens:** TanStack Router flat-routing convention (Phase 14 Plan 05's load-bearing decision).

**How to avoid:** The /skills/$name route already exists at `routes/skills_.$name.tsx` (trailing-underscore opt-out). The new SkillProjectsTable panel mounts INSIDE that route's component tree (alongside SkillCostCard / SkillRunsTable) — no new route file needed. Existing pattern at `routes/skills_.$name.tsx:144-170`.

### Pitfall 8: data-testid collisions with existing skills page

**What goes wrong:** Adding `data-testid="projects-table"` collides with another panel's testid in strict mode.

**Why it happens:** Phase 18 Plan 04 locked the `feature-component-element` kebab-case convention precisely to avoid this.

**How to avoid:** Use `skills-detail-projects-table` (page-feature-component-element). Decorate only when strict mode collides — pre-decoration is anti-pattern (Phase 18 Plan 04 SUMMARY).

### Pitfall 9: cmc/ingest/scheduler.py NOT updated — backfill drifts

**What goes wrong:** Migration 0003 backfills existing rows, but new sessions inserted post-migration get `project_key=''` (the server_default).

**Why it happens:** The backfill is one-time; ongoing inserts need the value computed at session-creation time.

**How to avoid:** Plan 19-01 MUST include an edit to `cmc/ingest/scheduler.py` (around line 117-118 where `project_hash` is set) to ALSO set `sess["project_key"] = compute_project_key(cwd)`. AND `_SESSION_MUTABLE_COLS` in `cmc/ingest/repository.py:57` must include `"project_key"` so re-syncs of existing sessions update the key (in case of late-arriving cwd corrections).

### Pitfall 10: Spring-forward boundary test (ROADMAP success criterion #5)

**What goes wrong:** A test asserting "skill activated 30 days ago is dormant" silently passes/fails at the spring-forward boundary because local-time arithmetic loses an hour.

**Why it happens:** US spring-forward 2026 is March 8, 02:00 → 03:00 local. Any test that computes "30 days ago" via local time on March 9 lands on Feb 6 02:00 (correct UTC) but Feb 6 01:00 local (wrong by 1 hour) — so a session activated at Feb 6 01:30 local is "dormant" by UTC, "not dormant" by local-time math.

**How to avoid:** The unit test seeds `skill_activated` events at known UTC timestamps, freezes the clock at a UTC time straddling the spring-forward window (e.g., `2026-03-08T07:00:00Z` = post-DST in US, but UTC-stable), and asserts the badge classification. Since the SQL uses `datetime('now', '-N days')` in UTC, the test is straightforward. Use `vi.spyOn(Date, 'now')`-equivalent for backend (freezegun OR clock-patch via `cmc.core.time` monkeypatch).

## Code Examples

### Per-project rollup SQL (SKLP-08)

```sql
-- Source: proposed SQL for GET /api/skills/{name}/projects
WITH skill_runs AS (
  SELECT
    o.session_id,
    o.ts,
    CAST((SELECT json_extract(value, '$.value.stringValue')
          FROM json_each(json_extract(o.body, '$.record.attributes'))
          WHERE json_extract(value, '$.key') = 'duration_ms'
          LIMIT 1) AS INTEGER) AS duration_ms
  FROM otel_events o
  WHERE o.event_name = 'skill_activated'
    AND o.attrs_skill_name = :name
    AND o.ts >= datetime(:since)
),
joined AS (
  SELECT
    s.project_key,
    sr.duration_ms,
    s.tokens_input + s.tokens_output + s.tokens_cache_read
      + s.tokens_cache_create_5m + s.tokens_cache_create_1h AS total_tokens,
    s.model
  FROM skill_runs sr
  JOIN sessions s ON s.session_id = sr.session_id
),
ranked AS (
  SELECT
    project_key, duration_ms, total_tokens, model,
    ROW_NUMBER() OVER (PARTITION BY project_key ORDER BY duration_ms) AS rnk,
    COUNT(*) OVER (PARTITION BY project_key) AS n
  FROM joined
  WHERE duration_ms IS NOT NULL
)
SELECT
  project_key,
  COUNT(*) AS count,
  MAX(duration_ms) FILTER (WHERE rnk = MAX(CAST(n * 0.5 AS INTEGER), 1)) AS p50_ms,
  MAX(duration_ms) FILTER (WHERE rnk = MAX(CAST(n * 0.95 AS INTEGER), 1)) AS p95_ms,
  SUM(total_tokens) AS total_tokens,
  MAX(model) AS model
FROM ranked
GROUP BY project_key
ORDER BY count DESC
```
Cost computation: per-row `compute_cost(model, …)` in Python after the SQL returns, mirroring Phase 14 SkillCostResponse trend handling.

### Badge derivation SQL (SKLP-10)

```sql
-- Source: proposed SQL for skills usage badges
WITH activations AS (
  SELECT
    attrs_skill_name AS skill_name,
    MIN(ts) AS first_activated_at,
    MAX(ts) AS last_activated_at,
    -- Days since first activation (for cold-start gate)
    CAST((julianday('now') - julianday(MIN(ts))) AS INTEGER) AS days_since_first
  FROM otel_events
  WHERE event_name = 'skill_activated'
    AND attrs_skill_name IS NOT NULL
  GROUP BY attrs_skill_name
)
SELECT
  skill_name,
  first_activated_at,
  last_activated_at,
  -- "new this week" — first activated within last 7 days (UTC)
  CASE WHEN first_activated_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END AS is_new,
  -- "dormant" — last activated > 30 days ago AND skill is older than 14 days
  -- (cold-start suppression: skills <14 days old NEVER show dormant)
  CASE WHEN last_activated_at < datetime('now', '-30 days')
        AND days_since_first >= 14 THEN 1 ELSE 0 END AS is_dormant
FROM activations
```

### DST spring-forward unit test (ROADMAP success criterion #5)

```python
# Source: tests/test_skills_router.py (NEW test, proposed)
import pytest
from datetime import datetime, timezone, timedelta

@pytest.mark.asyncio
async def test_dormant_badge_dst_spring_forward(seeded_app, monkeypatch):
    """SKLP-10: badge thresholds use UTC SQLite arithmetic — DST-safe.

    Seeds a skill_activated event at 2026-02-06T01:30:00Z (31 days before
    2026-03-09T02:00:00Z, which straddles the US 2026-03-08 spring-forward).
    Asserts the skill is classified 'dormant' regardless of which side of the
    DST boundary the wall clock is on.
    """
    app, cm = seeded_app
    async with cm:
        # Seed a skill_activated 31 days before our frozen "now"
        async with app.state.sessions() as s:
            await s.execute(_insert(OtelEvent).values(
                ts=datetime(2026, 2, 6, 1, 30, 0),
                event_name='skill_activated',
                attrs_skill_name='dst-canary',
                body={'record': {'attributes': []}},
                received_at=datetime(2026, 2, 6, 1, 30, 0),
            ))
            # Also seed a 'first_activated' anchor 31 days back so days_since_first >= 14
            await s.commit()

    # Freeze SQLite 'now' at 2026-03-09T02:00:00Z (spring-forward neighborhood)
    # (Strategy: use SQLite's strftime override OR run the assertion against a
    # known fixture date with the seeded ts back-dated accordingly.)
    # Assert: badge classification is 'dormant' (last_activated > 30d, skill > 14d old)
    ...
```

### Frontend DeltaPill (proposed component)

```tsx
// Source: frontend/src/components/ui/DeltaPill.tsx (NEW)
import { HTMLAttributes } from 'react'

interface DeltaPillProps extends HTMLAttributes<HTMLSpanElement> {
  delta: number
  deltaPct: number | null  // null when prev == 0
  format?: 'integer' | 'currency'
}

export function DeltaPill({ delta, deltaPct, format = 'integer', className = '', ...rest }: DeltaPillProps) {
  const direction = delta > 0 ? '↑' : delta < 0 ? '↓' : '·'
  const sign = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const absStr =
    format === 'currency'
      ? `$${Math.abs(delta).toFixed(2)}`
      : new Intl.NumberFormat('en').format(Math.abs(delta))
  const pctStr = deltaPct === null ? '—' : `${deltaPct > 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%`
  return (
    <span
      className={`cmc-delta-pill cmc-delta-pill--${sign} ${className}`.trim()}
      aria-label={`Change: ${direction} ${absStr} (${pctStr})`}
      {...rest}
    >
      <span aria-hidden>{direction}</span>
      <span className="cmc-delta-pill__abs cmc-numeric">{absStr}</span>
      <span className="cmc-delta-pill__pct cmc-numeric">({pctStr})</span>
    </span>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `cwd` as project grouping key | `project_key = sha1[:12](realpath(cwd))` | Phase 19 (this) | Cardinality reduction (variant cwds collapse), no path leakage in API |
| Phase 14 SKIL-04 returns only totals | Phase 19 SKIL-04 returns totals + 7d-vs-prev-7d delta | Phase 19 SKLP-09 | Backwards-compat: existing fields preserved; new `usage_delta` field added |
| `datetime.utcnow` everywhere | `cmc.core.time.now_utc` | Phase 18 POLI-06 | Phase 19 inherits the ban; verifier fails on regression |
| `SkillsRegistry.tsx` shows just name + autonomy | + new/dormant badges | Phase 19 SKLP-10 | UI affordance for skill discovery hygiene |

**Deprecated/outdated:**
- Phase 14's "cwd-as-project-key" assumption in `cmc/api/routes/cost.py:166-178` (`_BREAKDOWN_BY_PROJECT_SQL`) — Phase 20 ANLY-07 will swap it to project_key. Phase 19 does NOT touch it (deferred per scope).

## Open Questions

1. **How does `os.path.realpath` behave on macOS for `~/Documents` on a synced iCloud volume?**
   - What we know: macOS resolves `~` to `$HOME` via env; `realpath` follows mount-point symlinks to the actual `Mobile Documents/com~apple~CloudDocs` path.
   - What's unclear: Whether iCloud's evict-and-redownload behavior ever changes the underlying mount path (which would change the project_key for the same logical project).
   - Recommendation: Document in migration docstring as known limitation; users primarily affected are unlikely to be hashed-key-stable across iCloud evictions. This is acceptable — project_key drift is path-canonicalization-equivalent, not data corruption.

2. **Should `compute_project_key('')` return `''` or a sentinel hash?**
   - What we know: Spec implies empty cwd → empty key (no project leakage; no fake project).
   - What's unclear: Whether `''` collides usefully with the column DEFAULT in queries.
   - Recommendation: Empty string. Queries naturally exclude `WHERE project_key != ''`. Mirrors the COALESCE(`'<unknown>'`) pattern in cost.py:168 but as an empty-string sentinel since the column is NOT NULL.

3. **Range coupling for delta CTE: bind to panel range or fixed 7d?**
   - What we know: ROADMAP success criterion 3 says "7d-vs-prev-7d" explicitly.
   - What's unclear: Whether the user might want "30d-vs-prev-30d" later.
   - Recommendation: Hard-code 7d for SKLP-09. If a future request needs 30d-vs-prev-30d, that's a different requirement (and trivially extended — change one constant).

4. **Should the per-project endpoint paginate?**
   - What we know: Realistic max projects per skill is ~50. DataTable handles ~200 rows fine.
   - What's unclear: Whether super-users (CI/CD running the same skill across thousands of repos) would breach this.
   - Recommendation: No pagination in v1.2. Cap server-side at `LIMIT 100` defensively. If a user breaches it, that's a legitimate v1.3 follow-up.

## Sources

### Primary (HIGH confidence)

- Repository at HEAD (commit 62113b5):
  - `backend/cmc/api/routes/skills.py` — Phase 14 router, dual-path CTE pattern, `_RANGE_TO_DAYS` map, `_SKILL_NAME_RE` validation, MIN_LATENCY_SAMPLES const
  - `backend/cmc/api/schemas/skills.py` — DTO patterns; SkillRange Literal; Decimal-as-JSON-string note
  - `backend/cmc/db/models/sessions.py` — sessions schema (target of project_key add)
  - `backend/migrations/versions/0001_initial.py`, `0002_v1_1_alerts_and_skills.py` — Alembic patterns (batch_alter_table, server_default, op.execute backfill)
  - `backend/cmc/ingest/scheduler.py:117-118` — project_hash setter (where project_key joins it)
  - `backend/cmc/ingest/repository.py:_SESSION_MUTABLE_COLS` — must add project_key
  - `backend/cmc/api/routes/observability.py` — 8+ uses of `datetime('now', '-N days')` (UTC arithmetic precedent)
  - `backend/cmc/api/routes/cost.py:166-178` — existing cwd-as-project pattern (Phase 19 doesn't touch; Phase 20 will)
  - `backend/cmc/core/time.py` — POLI-06 canonical home; `now_utc()`; `UTCDatetime` PlainSerializer
  - `backend/tests/test_migrations.py` — migration test pattern (alembic.command.upgrade/downgrade against tmp_path)
  - `backend/tests/test_skills_router.py` — fixture patterns for skill events
  - `frontend/src/components/panels/{TopSkills,SkillCostCard,SkillRunsTable,SkillsRegistry}.tsx` — panels to extend
  - `frontend/src/routes/skills_.$name.tsx` — TanStack Router opt-out idiom
  - `frontend/src/components/ui/{Badge,StatePill,DataTable}.tsx` — UI primitives to reuse
  - `frontend/src/lib/{api.ts,queries.ts}` — fetch helpers + query hooks (extend SKIL-04..07 idiom)
  - `.planning/phases/18-polish-carry-forward-cleanup/BASELINE.md` — verifier baseline
  - `.planning/STATE.md` — v1.2 roadmap-time decisions; "Migration 0003 owned by Phase 19"
  - `.planning/ROADMAP.md` — Phase 19 success criteria (5 items, all load-bearing)
  - `.planning/REQUIREMENTS.md` — SKLP-08/09/10 wording

### Secondary (HIGH confidence — derivable from repo evidence)

- SQLite `datetime('now', '-N days')` returns UTC by default (verified by every cost/observability/doctor call site in the repo using the bare form for time-windowing; the `'localtime'` modifier appears only on STRFTIME `'%Y-%m-%d'` day-bucket extraction, never on the windowing comparison)
- SQLite VARCHAR(N) length is advisory not enforced (https://www.sqlite.org/datatype3.html — type affinity rules)
- `os.path.realpath` returns input unchanged for non-existent path tail components (Python stdlib documented behavior)

### Tertiary (LOW confidence — assumptions to validate during planning)

- iCloud-mounted cwd realpath stability (macOS-specific; flagged as Open Question 1)

## Metadata

**Confidence breakdown:**
- Migration patterns: HIGH — identical structure to 0002 (batch_alter_table + server_default + python-loop backfill is a slight variation, but op.execute SQL backfill is well-trodden)
- Per-project endpoint SQL: HIGH — direct extension of Phase 14 dual-path + window-percentile CTE
- Delta CTE pattern: HIGH — composable with existing skills router idiom; hardcoded 7d window simplifies vs. range parameterization
- Badge rules: HIGH — straightforward MIN(ts)/MAX(ts) + datetime arithmetic in SQLite
- DST safety: HIGH — every existing call site in the repo uses the UTC form; failure mode is well-understood
- Frontend wiring: HIGH — DeltaPill is small, Badge component already exists, DataTable handles sortable columns
- project_key edge cases (iCloud, deleted dirs): MEDIUM — documented as known limitation; doesn't affect correctness for active projects

**Research date:** 2026-05-06
**Valid until:** 2026-06-06 (30 days — backend stack is stable; SQLite datetime semantics don't move)
