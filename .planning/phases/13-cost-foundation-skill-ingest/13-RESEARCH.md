# Phase 13: Cost Foundation & Skill Ingest — Research

**Researched:** 2026-05-03
**Domain:** Python money math (Decimal), SQLAlchemy/Alembic schema migration on SQLite, OTLP attribute extraction (mirroring `attrs_mcp_*` pattern), JSONL token correlation, FastAPI read-time cost endpoints
**Confidence:** **HIGH** for ingest-side schema mechanics and Decimal stack (anchored on SPIKE.md verified locks + Anthropic's official pricing page + SQLAlchemy 2.0 docs); **MEDIUM-HIGH** for pricing rates (live-fetched from official page on 2026-05-03, but model-SKU [1m]-suffix question is unresolved — see Open Questions); **TENTATIVE** for skill-event runtime shape (LOCK-1/2/3/7/8 in SPIKE.md remain unverified at 2.1.116 — Phase 13 is the first phase that gets to disambiguate).

## Summary

Phase 13 has two orthogonal deliverables glued together by **one Alembic migration**:

1. **Cost foundation (ANLY-01..05)** — a hand-rolled `cmc/pricing.py` module exposes `compute_cost(model, input, output, cache_read, cache_create_5m, cache_create_1h) -> Decimal` using stdlib `decimal.Decimal` (no float drift). Pricing seeded from `data/pricing.json` (manual, freeze-dated). A new `pricing` SQLModel table with `effective_from` / `effective_until` columns lets historical totals self-correct as new rate rows are added — **dollar values are NEVER stored**, only tokens. Two GET endpoints (`/api/cost/summary?range=`, `/api/cost/breakdown?dim=`) compute cost at read time. `cmc doctor` gains a 9th check: warns when pricing rows are >30 days old or `unpriced_tokens > 0`. Frontend renders a "Rates as of YYYY-MM-DD" caption next to every dollar figure.
2. **Skill ingest (INGST-11..13)** — extend `/v1/logs` (the existing OTLP receiver) to extract `skill_name` from `claude_code.skill_activated` events into a new indexed `otel_events.attrs_skill_name` column, mirroring the existing `attrs_mcp_server` / `attrs_mcp_tool` pattern at `cmc/api/routes/ingest.py:107` (`extract_mcp_attrs`). The same Alembic migration that adds `attrs_skill_name` ALSO creates Phase 15's `alert_rules` and `alert_state` tables (locked by STATE.md decision; reduces SQLite `batch_alter_table` recreate overhead and keeps dev/prod schema steps atomic). Idempotent re-ingest under cross-midnight late arrivals is enforced via a `(session_id, otel_event_id)` UNIQUE constraint with `INSERT OR IGNORE` semantics — `otel_event_id` is `event.sequence` extracted from OTLP attributes (per-session monotonic int).

The migration ALSO must remediate **two latent v1.0 bugs surfaced by SPIKE.md** that block Phase 13 from working at all: BUG-A (flat `json_extract(body, '$.tool_name')` at `cmc/api/routes/observability.py:535` returns NULL silently across all 1,406 production rows) and BUG-B (`cmc/api/routes/ingest.py:103` reads `session_id` underscore but Claude Code 2.1.116 emits `session.id` dotted; all 6,392 production `otel_events.session_id` columns are NULL). Both are on the critical path for INGST-11 because skill events will inherit the same NULL-FK pathology unless fixed at the same time as the column add.

**Primary recommendation:** Build the migration as a single Alembic revision (`0002_v1_1_alerts_and_skills.py`) that does five things atomically: (1) ADD COLUMN `otel_events.attrs_skill_name` + index, (2) ADD COLUMN `otel_events.otel_event_id` (int) + composite UNIQUE `(session_id, otel_event_id)`, (3) CREATE TABLE `pricing` + indexes, (4) CREATE TABLE `alert_rules` + `alert_state` (Phase 15 stub schema; Phase 15 fills the rows), (5) data backfill of `otel_events.session_id` from `body.record.attributes` (BUG-B fix). All ALTERs use `render_as_batch=True` (already configured in `migrations/env.py:34`). Use `decimal.Decimal` exclusively in `cmc/pricing.py` — never `float`. Pricing rates seeded from Anthropic's official API pricing page (https://platform.claude.com/docs/en/about-claude/pricing) with a `published_at: "2026-05-03"` field stamped into `data/pricing.json` for the doctor staleness check.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `compute_cost()` math primitive | Backend (Python pure-fn) | — | Pure stdlib `Decimal` math; no I/O, no DB, no async — must be importable from REPL per ANLY-01 success criterion #1 |
| `pricing` table + seed loader | Database / Storage | Backend (loader at app start) | Effective-window queries are SQL-native; loader idempotently upserts from `data/pricing.json` on app boot |
| OTLP `/v1/logs` skill-attr extraction | API / Backend | — | Mirrors existing `extract_mcp_attrs` pattern in `cmc/ingest/otel_parser.py`; runs synchronously in the same `iter_attrs` walk that already handles MCP |
| `(session_id, otel_event_id)` idempotency | Database / Storage | Backend (INSERT OR IGNORE in ingest path) | UNIQUE constraint enforced at DB level; ingest layer adapts to ON CONFLICT DO NOTHING to keep `/v1/logs` idempotent under retries |
| `/api/cost/summary` + `/api/cost/breakdown` | API / Backend | Database (read-only aggregates) | Read-time cost compute joins token totals to pricing window; no derived `$` ever stored |
| `cmc doctor` pricing staleness check | Backend (CLI) | Database | New 9th check in `cmc/cli/doctor.py::CHECKS` — pure read query against `pricing` and `otel_events` for unpriced-token detection |
| "Rates as of YYYY-MM-DD" caption | Frontend (component prop) | API (returns rates_as_of in response) | Backend includes `rates_as_of` in every cost-figure response; frontend reads and renders — Phase 13 is backend-only per ROADMAP, frontend caption lands in Phase 14 |

## Standard Stack

### Core (already in `backend/pyproject.toml` — version-verified 2026-05-03)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sqlalchemy` | 2.0.49 [VERIFIED: pyproject.toml] | ORM + Numeric type with SQLite quirks well-documented | Already pinned; `Numeric(precision, scale, asdecimal=True)` returns `Decimal` |
| `sqlmodel` | 0.0.38 [VERIFIED: pyproject.toml] | Pydantic-flavored SQLAlchemy models | Project-wide convention — every other table uses it (`OtelEvent`, `Session`, etc.) |
| `alembic` | 1.18.4 [VERIFIED: pyproject.toml] | Schema migrations, batch mode for SQLite | Already configured with `render_as_batch=True` at `migrations/env.py:34` |
| `aiosqlite` | 0.22.1 [VERIFIED: pyproject.toml] | Async SQLite driver | Project default; `AsyncSession` flow used everywhere |
| `pydantic` | 2.13.3 [VERIFIED: pyproject.toml] | Request/response models with Decimal support | v2 has built-in `Decimal` field type — serializes as **string by default** to preserve precision (see CITED below) |
| `decimal` (stdlib) | py3.13 | `Decimal` arithmetic, `getcontext()`, `quantize`, `ROUND_HALF_EVEN` | **Must be used** per ANLY-01 — no float ever appears in cost math |
| `fastapi` | 0.136.1 [VERIFIED: pyproject.toml] | API layer | Project default |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `recharts` | 3.8.1 [VERIFIED: frontend/package.json:32] | Chart primitives for cost dashboard | Already pinned at the version STATE.md flagged as a Phase 13 verification gate. **VERIFIED CURRENT**: latest published is also 3.8.1 (npm registry, last-published ~2026-04). No bump needed. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `compute_cost` in `cmc/pricing.py` | Existing money library (`py-moneyed`, `prices`) | Locked by STATE.md decision: hand-rolled. ~30 LOC of stdlib `Decimal` math is cheaper than a money lib's currency/locale machinery, and the dimensional vector here is fixed (six token kinds, one currency, one model dimension). Reject. |
| `pricing` table with `effective_from`/`effective_until` | Single current-rate JSON file, no DB row | Locked by STATE.md decision: table. Required for ANLY-03's self-correcting historical totals — pure JSON cannot self-correct because old rows would lose their old rate. Reject. |
| `(session_id, otel_event_id)` UNIQUE | Soft dedup via `(session_id, ts)` window | Locked by REQUIREMENTS.md INGST-13. `event.sequence` (int per-session) is the only OTEL field that gives a hard deduplication key; ts collisions are possible at sub-ms. Accept. |
| `INSERT OR IGNORE` SQL | `ON CONFLICT (session_id, otel_event_id) DO NOTHING` | Equivalent in SQLite ≥ 3.24; the SQLAlchemy idiom is `pg_insert(...).on_conflict_do_nothing()` for PG, but for SQLite the existing repo pattern at `cmc/ingest/repository.py:79` uses `sqlite_dialect.insert(...).on_conflict_do_update`. Use `on_conflict_do_nothing` for INGST-13 to mirror that style. |

**Installation:** No new pip dependencies required. All needed packages are already pinned in `backend/pyproject.toml`. `decimal` is stdlib.

**Version verification (2026-05-03):**
- `recharts` latest: `3.8.1` published 2026-04 [VERIFIED: npm registry via WebSearch] — matches frontend/package.json pin, no bump required.
- `sqlalchemy 2.0.49`, `alembic 1.18.4`, `pydantic 2.13.3`, `sqlmodel 0.0.38`: pinned in pyproject.toml [VERIFIED: read]. No phase-13-driven need to bump.

## Architecture Patterns

### System Architecture Diagram

```
                                  ┌───────────────────────┐
                                  │ data/pricing.json     │
                                  │ (manually seeded,     │
                                  │  freeze-dated)        │
                                  └───────────┬───────────┘
                                              │ (loader at app boot)
                                              ▼
┌──────────────┐                      ┌───────────────────┐
│ Claude Code  │  POST /v1/logs       │ FastAPI ingest    │
│ 2.1.116      │ ─────OTLP/JSON──────▶│ cmc/api/routes/   │
│ (skill_act-  │                      │ ingest.py         │
│  ivated      │                      │                   │
│  emission)   │                      │ extract_mcp_attrs │
└──────────────┘                      │ +extract_skill_attr│
       │                              │ (NEW Phase 13)    │
       │                              │ + extract_seq_id  │
       │                              │ (NEW Phase 13)    │
       │ assistant turn               └─────────┬─────────┘
       │ (writes JSONL)                         │ INSERT OR IGNORE
       ▼                                        │ ON CONFLICT
┌──────────────────┐                            ▼
│ ~/.claude/       │                  ┌──────────────────┐
│ projects/<sess>/ │                  │ otel_events      │
│ <sess>.jsonl     │                  │ (+attrs_skill_name│
│                  │                  │  +otel_event_id   │
│ message.usage.   │                  │  +UNIQUE constr.) │
│ cache_creation.  │                  └──────────────────┘
│ ephemeral_5m/1h  │                            │
└────────┬─────────┘                            │
         │                                      │
         │ (Phase 14 SkillCostCard reads        │
         │  via request_id JOIN — Phase 13      │
         │  scope ends at the api_request       │
         │  aggregate columns)                  │
         ▼                                      ▼
┌────────────────────────────────────────────────┐
│ GET /api/cost/summary?range=                   │
│ GET /api/cost/breakdown?dim=model|skill|project│
│                                                │
│   token totals  ─JOIN─▶  pricing (effective_*) │
│           │                       │            │
│           └───── compute_cost() ──┘            │
│                       │                        │
│                       ▼                        │
│                  Decimal $                     │
│                  + rates_as_of                 │
└────────────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ cmc doctor      │
              │ (NEW check #9)  │
              │ — staleness     │
              │ — unpriced > 0  │
              └─────────────────┘
```

Component responsibilities (file/function-precision):

| Component | File | Responsibility |
|-----------|------|---------------|
| `compute_cost()` pure fn | `backend/cmc/pricing.py` (NEW) | Decimal-only math, takes (model, 6 token counts), returns `Decimal`; signature locked by ANLY-01 |
| `data/pricing.json` seed | `data/pricing.json` (NEW) | Static rate table with `published_at` + per-model rate dict; loader is idempotent |
| `pricing` table | `backend/cmc/db/models/pricing.py` (NEW) | SQLModel; columns: `id`, `model`, `input_per_mtok`, `output_per_mtok`, `cache_read_per_mtok`, `cache_create_5m_per_mtok`, `cache_create_1h_per_mtok`, `effective_from`, `effective_until`, `source_url`, `loaded_at` |
| Seed loader | `backend/cmc/pricing.py::load_seed()` (NEW) | Called from `cmc/app/lifespan.py` startup; UPSERTs from JSON; closes prior `effective_until` when adding a new row |
| Skill-attr extractor | `backend/cmc/ingest/otel_parser.py::extract_skill_attr()` (NEW) | Mirrors `extract_mcp_attrs`; reads attribute key `skill_name` (LOCK-2 candidate; fallback to `skill.name` then `name` per LOCK-2 TENTATIVE guidance) |
| Sequence-id extractor | `backend/cmc/ingest/otel_parser.py::extract_event_sequence()` (NEW) | Reads `event.sequence` intValue from attributes |
| Ingest call site | `backend/cmc/api/routes/ingest.py:97-148` (MODIFIED) | Adds new column writes; switches `session_id` read to `session.id` (BUG-B fix); switches insert to `on_conflict_do_nothing` against `(session_id, otel_event_id)` |
| Cost API | `backend/cmc/api/routes/cost.py` (NEW) | Two GET endpoints; calls `compute_cost()` per row; assembles `rates_as_of` from MAX(effective_from) of pricing rows used |
| Doctor check #9 | `backend/cmc/cli/doctor.py::_check_pricing_freshness` (NEW) | Loads pricing, asserts MAX(effective_from) > now-30d AND `unpriced_tokens` count == 0 |
| BUG-A fix | `backend/cmc/api/routes/observability.py:535` (MODIFIED) | Replace flat `json_extract(body, '$.tool_name')` with `json_each` pattern from SPIKE.md BUG-A example |

### Recommended Project Structure

```
backend/cmc/
├── pricing.py              # NEW — compute_cost(), load_seed(); pure Python + DB I/O
├── db/models/
│   └── pricing.py          # NEW — SQLModel
├── api/routes/
│   ├── cost.py             # NEW — /api/cost/summary, /api/cost/breakdown
│   ├── ingest.py           # MODIFIED — skill-attr + sequence-id + BUG-B fix
│   └── observability.py    # MODIFIED — BUG-A fix at line 535
├── ingest/
│   └── otel_parser.py      # MODIFIED — extract_skill_attr() + extract_event_sequence()
├── cli/
│   └── doctor.py           # MODIFIED — add _check_pricing_freshness as check #9

backend/migrations/versions/
└── 0002_v1_1_alerts_and_skills.py   # NEW — single revision, six concerns

data/
└── pricing.json            # NEW — manually seeded rates with published_at
```

### Pattern 1: Decimal arithmetic for money (ANLY-01)

**What:** Use `decimal.Decimal` exclusively; never `float`. Set context precision once at import time. Use `quantize` only at the *output* boundary (response serialization), not in intermediate math.

**When to use:** Every dollar calculation. The function signature is locked: `compute_cost(model: str, input: int, output: int, cache_read: int, cache_create_5m: int, cache_create_1h: int) -> Decimal`.

**Example:**
```python
# Source: https://docs.python.org/3/library/decimal.html (CITED)
from decimal import Decimal, getcontext, ROUND_HALF_EVEN

# Module-level: bankers' rounding default; precision wide enough for $/token math
getcontext().prec = 28
getcontext().rounding = ROUND_HALF_EVEN

_MTOK = Decimal("1000000")  # divide tokens by this to get per-Mtok rate denom

def compute_cost(
    model: str,
    input: int,
    output: int,
    cache_read: int,
    cache_create_5m: int,
    cache_create_1h: int,
    rates: dict[str, dict[str, Decimal]],  # passed in to keep fn pure
) -> Decimal:
    r = rates[model]
    return (
        Decimal(input)            * r["input_per_mtok"]            / _MTOK +
        Decimal(output)           * r["output_per_mtok"]           / _MTOK +
        Decimal(cache_read)       * r["cache_read_per_mtok"]       / _MTOK +
        Decimal(cache_create_5m)  * r["cache_create_5m_per_mtok"]  / _MTOK +
        Decimal(cache_create_1h)  * r["cache_create_1h_per_mtok"]  / _MTOK
    )

# Output-boundary quantize (only at the API response edge):
total = compute_cost(...)
total_for_display = total.quantize(Decimal("0.0001"), rounding=ROUND_HALF_EVEN)
```

Two cardinal rules: **(1) `Decimal(int)` constructor takes integers losslessly; never `Decimal(float_value)` — that imports the float's binary error.** The pricing.json values must be loaded as `Decimal(string_form)`, not `Decimal(float_from_json)`. **(2) `quantize` only at output** — quantizing in mid-math throws away precision needed for the next step.

### Pattern 2: SQLAlchemy `Numeric` on SQLite (ANLY-03)

**What:** Use `sa.Numeric(precision, scale, asdecimal=True)` for the per-Mtok rate columns. Be aware that SQLite has **no native DECIMAL type** — it stores values in NUMERIC affinity which falls back to TEXT or REAL. SQLAlchemy 2.0 no longer warns about this (the warning was removed because it's a platform constraint, not a driver bug). Practical limit: 15 significant decimal digits. Per-Mtok rates are at most $75 (Claude Opus 4.1 output) with 4-decimal-place precision — well within budget.

**When to use:** All `pricing.*_per_mtok` columns. Do NOT store the rate as a string — `Numeric` with `asdecimal=True` round-trips Decimals correctly within the 15-significant-digit window.

**Example:**
```python
# Source: https://docs.sqlalchemy.org/en/20/core/type_basics.html (CITED)
# Verified via Context7 /websites/sqlalchemy_en_20 query "SQLite Numeric storage TEXT decimal precision warning"
from decimal import Decimal
from sqlmodel import Field, SQLModel
from sqlalchemy import Column, Numeric

class PricingRow(SQLModel, table=True):
    __tablename__ = "pricing"
    id: int | None = Field(default=None, primary_key=True)
    model: str = Field(index=True)
    input_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    output_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_read_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_create_5m_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    cache_create_1h_per_mtok: Decimal = Field(sa_column=Column(Numeric(10, 4), nullable=False))
    # Effective-window pair — open at the high end means "still current"
    effective_from: datetime
    effective_until: datetime | None = None
    source_url: str
    loaded_at: datetime
```

### Pattern 3: Pydantic v2 Decimal serialization in FastAPI responses (ANLY-04)

**What:** Pydantic v2 serializes `Decimal` as a JSON **string** by default. This is the right behavior for money — JSON's number type is IEEE-754 double, which silently truncates to 15-16 sig figs. Strings preserve the full Decimal.

**When to use:** Every response model in `cost.py` that exposes a dollar amount. Mark fields `cost_usd: Decimal`, not `cost_usd: float`.

**Example:**
```python
# Source: https://docs.pydantic.dev/2.13/api/types/#pydantic.types.Decimal (CITED)
# WebSearch verification: pydantic Decimal -> JSON string serialization is documented behavior
from decimal import Decimal
from pydantic import BaseModel

class CostSummaryResponse(BaseModel):
    range: str
    rates_as_of: date
    total_usd: Decimal              # serializes as "0.0247" (string)
    by_model: list["CostByModelRow"]

class CostByModelRow(BaseModel):
    model: str
    tokens_input: int
    tokens_output: int
    tokens_cache_read: int
    tokens_cache_create_5m: int
    tokens_cache_create_1h: int
    cost_usd: Decimal
```

**Critical caveat:** `fastapi.encoders.jsonable_encoder()` converts `Decimal -> float` (precision loss). NEVER pipe Decimals through `jsonable_encoder` before the response — let FastAPI's response_model machinery do the serialization directly. [CITED: https://github.com/fastapi/fastapi/discussions/12050]

### Pattern 4: Alembic batch_alter_table for SQLite ADD COLUMN + index (INGST-12)

**What:** SQLite doesn't support most ALTER TABLE forms natively, so Alembic's `batch_alter_table` recreates the table when needed. This project already uses `render_as_batch=True` globally (`migrations/env.py:34`), so all subsequent revisions get batch mode automatically. For a simple `ADD COLUMN` + index, batch mode performs an inexpensive ALTER TABLE ADD COLUMN followed by CREATE INDEX (no recreate triggered).

**When to use:** This phase's single migration. **Do not split into multiple revisions** — STATE.md decision locks "one Alembic migration adds otel_events.attrs_skill_name index + alert tables together (mirrors existing attrs_mcp_* pattern)."

**Example:**
```python
# Source: https://alembic.sqlalchemy.org/en/latest/batch.html (CITED via Context7)
# Mirrors the existing pattern used in 0001_initial.py for otel_events index creation
"""v1.1 alerts + skills — adds attrs_skill_name + otel_event_id + pricing/alert tables.

Revision ID: 0002_v1_1_alerts_and_skills
Revises: 0001_initial
Create Date: 2026-05-XX
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel

revision = "0002_v1_1_alerts_and_skills"
down_revision = "0001_initial"

def upgrade() -> None:
    # 1. otel_events: ADD COLUMN attrs_skill_name + otel_event_id + index + UNIQUE
    with op.batch_alter_table("otel_events") as batch_op:
        batch_op.add_column(sa.Column("attrs_skill_name",
                                       sqlmodel.sql.sqltypes.AutoString(),
                                       nullable=True))
        batch_op.add_column(sa.Column("otel_event_id", sa.Integer(), nullable=True))
        batch_op.create_index("idx_otel_events_attrs_skill_name",
                              ["attrs_skill_name"], unique=False)
        batch_op.create_index("uq_otel_events_session_seq",
                              ["session_id", "otel_event_id"],
                              unique=True,
                              # NULL session_id rows from soft-FK fallback path stay
                              # un-deduped — that is INTENTIONAL because they cannot
                              # collide on (NULL, X) under SQLite UNIQUE semantics.
                              )
    # 2. pricing
    op.create_table("pricing", ...)
    # 3. alert_rules
    op.create_table("alert_rules", ...)  # Phase 15 ALRT-01 schema
    # 4. alert_state
    op.create_table("alert_state", ...)  # Phase 15 ALRT-02 schema
    # 5. BUG-B backfill: copy session_id from body for the 6,392 production rows
    op.execute("""
        UPDATE otel_events
        SET session_id = (
            SELECT json_extract(value, '$.value.stringValue')
            FROM json_each(json_extract(body, '$.record.attributes'))
            WHERE json_extract(value, '$.key') = 'session.id'
            LIMIT 1
        )
        WHERE session_id IS NULL
          AND body IS NOT NULL
    """)

def downgrade() -> None:
    # Reverse order; UNIQUE drops before column drops
    op.drop_table("alert_state")
    op.drop_table("alert_rules")
    op.drop_table("pricing")
    with op.batch_alter_table("otel_events") as batch_op:
        batch_op.drop_index("uq_otel_events_session_seq")
        batch_op.drop_index("idx_otel_events_attrs_skill_name")
        batch_op.drop_column("otel_event_id")
        batch_op.drop_column("attrs_skill_name")
    # NOTE: BUG-B backfill is NOT reversed (session_id was always NULL pre-migration;
    # leaving it populated post-downgrade is a strict improvement).
```

### Pattern 5: OTLP attribute extraction mirroring `attrs_mcp_*` (INGST-11)

**What:** `cmc/ingest/otel_parser.py` already exposes the canonical pattern in `extract_mcp_attrs()` at line 56. Phase 13 adds two siblings: `extract_skill_attr(record) -> str | None` and `extract_event_sequence(record) -> int | None`. Both use the same `iter_attrs(record.get("attributes"))` walk.

**Example:**
```python
# Source: backend/cmc/ingest/otel_parser.py:56-80 (existing pattern verified)
# SPIKE.md LOCK-2 dictates the attribute key "skill_name" with TENTATIVE confidence
# (Wave 1 negative finding); fallback to "skill.name" then "name" is the safest contract.

def extract_skill_attr(record: dict) -> str | None:
    """Return skill_name attribute value for a skill_activated event, or None.

    SPIKE.md LOCK-1: filter on BARE event_name == "skill_activated" (post-prefix-strip).
    SPIKE.md LOCK-2: best-evidence key is "skill_name"; we try "skill.name" and "name"
    as fallbacks because Wave 1 produced no live verification at 2.1.116.
    """
    attrs = iter_attrs(record.get("attributes"))
    for key in ("skill_name", "skill.name", "name"):
        v = (attrs.get(key) or {}).get("stringValue")
        if v:
            return v
    return None

def extract_event_sequence(record: dict) -> int | None:
    """Return event.sequence intValue or None.

    Used as the per-session monotonic 'otel_event_id' for INGST-13 idempotency.
    Verified HIGH-confidence on api_request bodies (SPIKE.md Q13 line 727; intValue
    on the event.sequence attribute is canonical at 2.1.116).
    """
    attrs = iter_attrs(record.get("attributes"))
    seq = attrs.get("event.sequence") or {}
    val = seq.get("intValue")
    if val is None:
        return None
    try:
        return int(val)  # OTLP int64 may arrive as string
    except (TypeError, ValueError):
        return None
```

The ingest router at `cmc/api/routes/ingest.py:97-148` calls these alongside the existing `extract_mcp_attrs(record)` and the BUG-B-corrected `session.id` read.

### Anti-Patterns to Avoid

- **Storing dollar amounts in derived tables.** ANLY-03 forbids it. If you find yourself adding a `cost_usd` column to `sessions` or `token_usage`, stop. Tokens are stored; dollars are computed at read time. The OTEL `api_request.cost_usd` attribute (verified present in SPIKE.md Q13 line 433) is informational ONLY — Phase 13 reads tokens, not cost.
- **`Decimal(float_value)`.** Always `Decimal("3.00")` from string, or `Decimal(int_count)` from integer. `Decimal(3.00)` imports the binary float drift you're trying to avoid.
- **`jsonable_encoder()` on a Decimal.** Drops to float silently. Use FastAPI's `response_model=` on the endpoint signature so Pydantic v2 handles it. [CITED]
- **Quantizing inside `compute_cost`.** Lose precision unnecessarily. `quantize` belongs at the output boundary (response serialization or display formatting), not in math.
- **Stamping cost into otel_events at ingest time.** Forbidden by anti-feature in REQUIREMENTS.md ("Cost stamping at ingest time — read-time only"). `/v1/logs` MUST always return 200; pricing-edits would force backfill; price-lookup adds a failure surface.
- **Auto-fetching pricing from anthropic.com.** Forbidden by anti-feature ("Auto-fetch of model pricing from Anthropic page — manual seed + doctor warning only"). The pricing table is human-managed; the doctor warns when stale.
- **Hard cost caps in dispatcher logic.** Forbidden by anti-feature ("Hard cost caps that block invocation — alerts only, dashboard is a sensor not actuator"). Phase 13 only computes; Phase 15 alerts but never cancels.
- **Filtering on the prefixed event_name `claude_code.skill_activated`.** Per SPIKE.md LOCK-1 / Pitfall 3, the ingest at `cmc/api/routes/ingest.py:102` strips the prefix so the indexed `event_name` column carries the BARE form `skill_activated`. SQL queries against the column MUST use the bare form. (The full prefixed form lives at `body.record.body.stringValue` for raw inspection only.)
- **Ignoring BUG-A while adding `attrs_skill_name`.** They share the same anti-pattern (flat `json_extract(body, '$.X')` returns NULL silently for OTLP attribute arrays). Fixing them in one go is cheaper and aligns with the STATE.md "single migration" decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Money math primitives | Custom `MoneyValue` class wrapping float | `decimal.Decimal` (stdlib) | Stdlib has 30 years of maturity in IEEE-854 decimal; rolling our own is the textbook fintech footgun. Locked by ANLY-01 anyway. |
| SQLite ALTER TABLE schema rewrites | Manual `CREATE TABLE new_X; INSERT INTO new_X SELECT ... FROM X; DROP X; RENAME` | `op.batch_alter_table` (Alembic) | Already configured project-wide via `render_as_batch=True`. Manual table-recreate breaks indexes, FKs, and triggers silently. |
| OTLP attribute walking | New JSON-path parser for `body.record.attributes` | `iter_attrs()` (existing in `cmc/ingest/otel_parser.py:22`) | Already production-tested across 6,392 rows; SPIKE.md BUG-A is the cautionary tale of the alternative (flat `json_extract` silently returns NULL). |
| Cost rendering caption ("Rates as of …") | New i18n date formatter | Pass `rates_as_of: date` from API; format with `Intl.DateTimeFormat` in React | Date-fns and luxon are heavier than the platform `Intl` — and `Date.toLocaleDateString` is sufficient for ISO-format dates. |
| Idempotent OTLP re-ingest | Application-side dedup with hash sets | DB-level UNIQUE constraint with `ON CONFLICT DO NOTHING` | Already the existing `cmc/ingest/repository.py` pattern (line 79); guarantees correctness even under racing requests. |

**Key insight:** Every component Phase 13 needs already exists at the library/stdlib level. The phase is composition + schema migration + careful data flow, not invention. Hand-rolling here means re-creating the bugs that mature libraries have already solved.

## Runtime State Inventory

> Phase 13 is **mostly greenfield code addition**, but it does include one **data migration** (BUG-B backfill of `otel_events.session_id` for 6,392 rows). Including this section because the migration touches existing runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `otel_events.session_id` IS NULL for 6,392 production rows (verified by SPIKE.md BUG-B). The `session.id` value IS in the body JSON for every row. | **Data migration** — Alembic `op.execute("UPDATE otel_events SET session_id = json_extract(...) WHERE session_id IS NULL ...")` runs in the same revision; **AND** code edit at `cmc/api/routes/ingest.py:103` switches the read key from `session_id` to `session.id` (with underscore fallback for legacy smoke fixtures). |
| Stored data | `otel_events.otel_event_id` does not exist (new column). 6,392 production rows have NULL `otel_event_id` after migration. | NULL is acceptable for legacy rows; UNIQUE `(session_id, otel_event_id)` allows multiple NULLs under SQLite semantics. New rows post-migration MUST populate `otel_event_id`. No backfill of historical data needed because INGST-13 only requires forward idempotency. |
| Stored data | `pricing` table does not yet exist. | New table; seed loader populates from `data/pricing.json` on first app boot post-migration. |
| Live service config | None. Phase 13 is all in-process — no external services, queues, message brokers, or third-party APIs are reconfigured. | None. |
| OS-registered state | None. No new launchd jobs, cron entries, systemd units, or watched paths. (Phase 15's alert engine reuses the existing 120s dispatcher tick — STATE.md decision — but that's Phase 15's concern, not Phase 13's.) | None. |
| Secrets / env vars | None. No new env-var read sites; `Settings` schema unchanged. | None. |
| Build artifacts | The `cmc` Python package will export a new module path `cmc.pricing`. Anyone with a stale editable install (`pip install -e backend/`) will need to refresh after pulling. | Document in phase summary: `pip install -e backend/` after pulling. (No automation needed — pyproject.toml already declares `packages = ["cmc"]`.) |

**Cross-reference:** SPIKE.md BUG-A also mutates existing runtime state implicitly — fixing the flat `json_extract` at `observability.py:535` will cause `/api/tools/edit-decisions` results to change (1,406 rows that currently return NULL `tool_name` rows will start grouping correctly). This is a **behavior change**, not just a bug fix — operators may notice different daily counts. Plan must include a migration note.

## Common Pitfalls

### Pitfall 1: Float drift in pricing math

**What goes wrong:** Using `float` anywhere in the cost path produces $0.027847249999999997-shaped values (verbatim from SPIKE.md Q13 line 433 — that's what Anthropic's own `cost_usd` attribute looks like, and it's why we recompute). Aggregations of N float costs amplify the drift.

**Why it happens:** IEEE-754 binary doubles cannot exactly represent decimal fractions like 0.10. `0.1 + 0.2 == 0.3` is False in Python. JSON's number type is IEEE-754, so any field round-tripped through `float` loses precision.

**How to avoid:** `Decimal` in, `Decimal` out, `Decimal` everywhere in between. Pydantic v2 serializes `Decimal` as JSON **string** by default — that's the right call. The pricing seed must load JSON values via `Decimal(str(value_from_json))`, not `Decimal(value_from_json)` directly (the latter still drift-imports if json.load returned a float).

**Warning signs:** `total_cost` ending in `9999...` or `0001...` decimals, `0.1 + 0.2 != 0.3` in test assertions, mismatched cents between `/api/cost/summary` and `/api/cost/breakdown` for the same range.

### Pitfall 2: Cache TTL split is JSONL-only at 2.1.116

**What goes wrong:** Trying to read `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` from the OTEL `api_request.cache_creation_tokens` aggregate. They aren't there. SPIKE.md LOCK-4 verified across 849 production `api_request` rows that both keys are absent on the OTEL surface.

**Why it happens:** Claude Code 2.1.116 emits the cache TTL split only on the JSONL surface (`~/.claude/projects/<hash>/<session>.jsonl` → assistant row → `message.usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`). The OTEL `cache_creation_tokens` is a flat aggregate.

**How to avoid:** Phase 13's `compute_cost(...)` signature includes `cache_create_5m` and `cache_create_1h` as *separate* arguments. The /api/cost/* endpoints MUST decide where to source these values. Two options: (a) extend the JSONL parser at `cmc/ingest/jsonl_parser.py:200-213` to capture the split into new columns on `sessions` or `token_usage`, OR (b) read live from JSONL at query time. **Option (a) is the standard pattern** — sessions/token_usage tables already hold the aggregates. Adding two columns (`tokens_cache_create_5m`, `tokens_cache_create_1h`) requires schema migration AND parser change AND backfill of historical sessions. ⚠️ This is NOT in the current Phase 13 deliverables list as written; it's a hidden dependency. **Open Question O-3 below flags this.**

**Warning signs:** `/api/cost/summary` returns the same cost regardless of whether the user used 5m or 1h cache writes; integration tests with known-5m vs known-1h sessions show identical $.

### Pitfall 3: BUG-A and BUG-B silently masking skill events

**What goes wrong:** You ship `attrs_skill_name` extraction without fixing BUG-B. `cmc/api/routes/ingest.py:103` continues reading `session_id` (underscore) for new skill events too — so all skill rows have NULL `session_id`. Every Phase 14 query that joins skill events to sessions returns empty. No alarm — the column just stays empty.

**Why it happens:** The bug is a single-character mismatch (`session_id` vs `session.id`) that only shows symptoms when the indexed column is queried — and the code paths that query it return empty results indistinguishably from "no events of this type yet."

**How to avoid:** Fix BUG-B in the *same* commit as `attrs_skill_name`. Add an integration test that emits a synthetic OTLP body with `session.id` and asserts the resulting row has both `session_id` (FK column) and `attrs_skill_name` populated.

**Warning signs:** New skill events landing with NULL `session_id`, `/api/skills/*` returning empty lists despite OTEL events arriving, `SELECT COUNT(*) FROM otel_events WHERE event_name = 'skill_activated' AND session_id IS NULL` returning > 0.

### Pitfall 4: `(session_id, otel_event_id)` UNIQUE allows multiple NULLs in SQLite

**What goes wrong:** Operator assumes the UNIQUE constraint dedupes ALL re-ingested events, including ones with NULL `session_id` (which happens when the soft-FK retry path at `ingest.py:127-138` falls back to `session_id=None`). Under SQLite UNIQUE semantics, `(NULL, X)` is NOT considered a duplicate of another `(NULL, X)` — multiple NULLs are allowed.

**Why it happens:** SQL standard treats NULL as "unknown" so two NULLs are not equal. SQLite follows the standard here.

**How to avoid:** Document in the migration comment that NULL-session rows fall through dedup. For Phase 13's purposes this is acceptable — the soft-FK retry path is rare (events arriving before session row lands) and those rows are already labeled as orphans. If strict dedup is needed, consider a partial UNIQUE INDEX `WHERE session_id IS NOT NULL` (the project already uses partial unique indexes — see `0001_initial.py:352-358` for the HITL `uq_decisions_pending_dedup_key` example).

**Warning signs:** Duplicate skill events arriving in the API after a `/v1/logs` POST is retried on a session that hasn't been written yet.

### Pitfall 5: `cmc doctor` exits non-zero when pricing is just stale

**What goes wrong:** ANLY-05 says "warns when pricing rows are >30 days old or `unpriced_tokens > 0`." The existing `cmc/cli/doctor.py::main` exits 1 if any check has status `'fail'`. If the new check uses `'fail'` for stale pricing, every CI run after 30d will turn red.

**Why it happens:** Stale pricing is operational drift, not a runtime failure. The doctor.py status taxonomy distinguishes `'ok' | 'warn' | 'fail'` precisely for this case (see `doctor.py:42-49`).

**How to avoid:** Use `status='warn'` (yellow) for stale-pricing detection. Reserve `'fail'` for "pricing.json missing entirely" or "schema mismatch" — true unblockers.

**Warning signs:** CI starts failing exactly 30 days after a successful pricing seed.

### Pitfall 6: `event.sequence` collisions across session resumes

**What goes wrong:** A user resumes a session via `claude --resume`. The new process starts with `event.sequence` at a fresh 0 (or whatever Claude Code initializes to in 2.1.116). Two events with the same `(session_id, otel_event_id)` arrive in sequence — the second is dropped by `INSERT OR IGNORE`, but it's a *different* event.

**Why it happens:** OTLP sequence numbers are scoped to the emitter process, not the session. The `session.id` UUID is reused on resume; the sequence counter is not.

**How to avoid:** Verify with a live capture (Phase 13 follow-up to Wave 1's negative finding — STATE.md line 44) that `event.sequence` is monotonic across session resumes within Claude Code 2.1.116. If it is NOT, change the dedup key to `(session_id, ts, event.sequence)` or include `prompt.id` in the key. **Open Question O-2 below flags this.**

**Warning signs:** Skill activations missing from API panels after a user resumes a session and re-fires the same skill.

## Code Examples

### Loading pricing seed at app startup

```python
# Source: project-internal pattern; mirrors cmc/ingest/repository.py:79 upsert idiom
# File: backend/cmc/pricing.py
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from cmc.db.models.pricing import PricingRow
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

PRICING_JSON = Path(__file__).resolve().parent.parent.parent / "data" / "pricing.json"

async def load_seed(db: AsyncSession) -> None:
    """Idempotent seed loader. Called from cmc/app/lifespan.py startup hook."""
    payload = json.loads(PRICING_JSON.read_text())
    published_at = datetime.fromisoformat(payload["published_at"])
    for model_name, rates in payload["models"].items():
        # Decimal(str(...)) is critical — never Decimal(json_loaded_float)
        row = {
            "model": model_name,
            "input_per_mtok":            Decimal(str(rates["input"])),
            "output_per_mtok":           Decimal(str(rates["output"])),
            "cache_read_per_mtok":       Decimal(str(rates["cache_read"])),
            "cache_create_5m_per_mtok":  Decimal(str(rates["cache_create_5m"])),
            "cache_create_1h_per_mtok":  Decimal(str(rates["cache_create_1h"])),
            "effective_from":            published_at,
            "effective_until":           None,
            "source_url":                payload["source_url"],
            "loaded_at":                 datetime.utcnow(),
        }
        stmt = (
            sqlite_insert(PricingRow.__table__)
            .values(**row)
            .on_conflict_do_nothing(index_elements=["model", "effective_from"])
        )
        await db.execute(stmt)
    await db.commit()
```

### Cost summary endpoint (read-time compute)

```python
# Source: project-internal pattern; mirrors cmc/api/routes/observability.py
# File: backend/cmc/api/routes/cost.py
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.cost import CostSummaryResponse, CostByModelRow
from cmc.db import get_session
from cmc.pricing import compute_cost, load_rates

router = APIRouter(tags=["cost"])

_RANGE_TO_SINCE = {"today": "start of day", "7d": "-7 days", "30d": "-30 days"}

# Token totals per model from token_usage table; cache TTL split — see Pitfall 2 + O-3
_SUMMARY_SQL = text("""
    SELECT
      model,
      SUM(tokens_input)        AS tokens_input,
      SUM(tokens_output)       AS tokens_output,
      SUM(tokens_cache_read)   AS tokens_cache_read,
      0                         AS tokens_cache_create_5m,  -- O-3 unresolved
      SUM(tokens_cache_create) AS tokens_cache_create_1h    -- O-3 unresolved
    FROM token_usage
    WHERE day >= DATE('now', :since_clause, 'localtime')
    GROUP BY model
""")

@router.get("/cost/summary", response_model=CostSummaryResponse)
async def cost_summary(
    db: AsyncSession = Depends(get_session),
    range_: Literal["today", "7d", "30d"] = Query("7d", alias="range"),
):
    rates = await load_rates(db)
    rows = (await db.execute(_SUMMARY_SQL, {"since_clause": _RANGE_TO_SINCE[range_]})).mappings().all()
    items: list[CostByModelRow] = []
    total = Decimal(0)
    for r in rows:
        if r["model"] not in rates:
            continue  # unpriced_tokens — surfaced separately by doctor
        cost = compute_cost(
            r["model"],
            int(r["tokens_input"] or 0),
            int(r["tokens_output"] or 0),
            int(r["tokens_cache_read"] or 0),
            int(r["tokens_cache_create_5m"] or 0),
            int(r["tokens_cache_create_1h"] or 0),
            rates,
        )
        total += cost
        items.append(CostByModelRow(model=r["model"], cost_usd=cost, ...))
    rates_as_of = max((r["effective_from"] for r in rates.values()), default=None)
    return CostSummaryResponse(range=range_, rates_as_of=rates_as_of, total_usd=total, by_model=items)
```

### Doctor pricing-freshness check (new check #9)

```python
# Source: project-internal pattern; mirrors cmc/cli/doctor.py existing checks
# File: backend/cmc/cli/doctor.py (new function added to CHECKS list)
def _check_pricing_freshness() -> Check:
    """Phase 13 ANLY-05 / POLI-01: warn if pricing rows are >30d old or any unpriced tokens.

    Two distinct conditions:
      1. effective_from of newest row < now-30d  → 'warn' staleness
      2. SELECT COUNT(*) FROM token_usage WHERE model NOT IN pricing.model > 0 → 'warn' coverage
    """
    import sqlite3
    from cmc.config import load_settings
    settings = load_settings()
    try:
        conn = sqlite3.connect(str(settings.db_path))
        latest = conn.execute("SELECT MAX(effective_from) FROM pricing").fetchone()[0]
        unpriced = conn.execute("""
            SELECT COUNT(*) FROM token_usage
            WHERE model NOT IN (SELECT DISTINCT model FROM pricing)
        """).fetchone()[0]
        conn.close()
    except sqlite3.OperationalError as exc:
        return Check(9, "pricing freshness", "fail", f"DB error: {exc}")
    if latest is None:
        return Check(9, "pricing freshness", "fail",
                     "pricing table empty — seed not loaded",
                     "Reload data/pricing.json")
    age_days = (datetime.utcnow() - datetime.fromisoformat(latest)).days
    if age_days > 30:
        return Check(9, "pricing freshness", "warn",
                     f"newest rate is {age_days}d old",
                     "Refresh data/pricing.json from claude.com/pricing")
    if unpriced > 0:
        return Check(9, "pricing freshness", "warn",
                     f"{unpriced} token_usage rows reference unpriced models",
                     "Add missing model rates to data/pricing.json")
    return Check(9, "pricing freshness", "ok", f"newest rate is {age_days}d old; 0 unpriced rows")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `float` for money | `decimal.Decimal` | Forever (Python 2.4 introduced `decimal` in 2004) | Standard in fintech for 20+ years; Anthropic's own emitted `cost_usd` field exhibits float drift (SPIKE.md Q13: `"0.027847249999999997"`) — that's the cautionary tale we're recomputing past. |
| Storing computed cost in derived tables | Storing tokens, computing cost at read time | Project-specific decision (STATE.md line 46) | Allows historical totals to self-correct as new pricing rows land. The `effective_from`/`effective_until` window pattern is the textbook approach (slowly-changing-dimension type 2). |
| SQLAlchemy 1.x `Numeric` warning on SQLite | SQLAlchemy 2.0 removed the warning | SQLAlchemy 2.0 (2023) | The 15-significant-digit limit is documented as a SQLite platform constraint, not a driver bug. Per-Mtok rates fit comfortably. |
| Pydantic v1 `json_encoders={Decimal: str}` | Pydantic v2 default Decimal-as-string serialization | Pydantic 2.0 (2023) | One less boilerplate config block. Project is on 2.13.3 — modern path. |
| OTLP attribute extraction via flat `json_extract(body, '$.X')` | `json_each(json_extract(body, '$.record.attributes'))` then filter on `value.key` | OTEL spec stable; SPIKE.md Phase 12 made this a project-wide rule | Same fix as BUG-A. The flat pattern silently returns NULL for OTLP's `[{key, value}]` array shape. |

**Deprecated/outdated in our context:**
- `Decimal(float_value)` constructor: still supported by Python but considered antipattern for money math.
- `Numeric` warnings on SQLite in SQLAlchemy ≥ 2.0: removed. Old StackOverflow answers may still cite them.
- `model="claude-opus-4-7[1m]"` as an API parameter: NOT a valid Anthropic API model name. The `[1m]` suffix appears in Claude Code's system-prompt environment block as a label only. **This is a critical Phase 13 finding** — see Open Question O-1.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research that need user confirmation before becoming locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `[1m]` suffix on `claude-opus-4-7[1m]` and `claude-sonnet-4-6[1m]` does NOT correspond to a separate Anthropic API rate. Long-context (1M) is included at standard pricing for both models per platform.claude.com/docs/en/about-claude/pricing (verified 2026-05-03). | Open Question O-1 | If true: ANLY-02's "5 model SKUs" should collapse to 3 (drop `[1m]` variants OR alias them to base rates). If false: we need a separate column in `pricing` for >200k tier rates. **Most-likely outcome:** ANLY-02 is wrong as written — STACK.md §1 of the same research lineage assumed `[1m]` was a separate rate, which is not true at the API level today. |
| A2 | `event.sequence` is the natural fit for `otel_event_id` in INGST-13's `(session_id, otel_event_id)` UNIQUE constraint. | Open Question O-2 | If `event.sequence` resets across `claude --resume`, the dedup key collides on real (different) events. **Verifiable** by inspecting two assistant turns from a resumed session in production OTEL data — this is a Phase 13 spike. |
| A3 | The cache TTL split (5m vs 1h) MUST be plumbed through `cmc/ingest/jsonl_parser.py` into new `tokens_cache_create_5m` + `tokens_cache_create_1h` columns on `sessions` AND `token_usage` for `compute_cost()` to function with all-six-token-arg signature. Phase 13 deliverables as written do NOT include this schema/parser change. | Open Question O-3 | If true: phase needs an additional ~6 LOC in jsonl_parser + 2 columns in 2 tables + backfill of historical aggregates. If false: cache_create_5m/1h are always 0 in the API responses (incorrect cost figures for cache-heavy workloads). |
| A4 | The `0002_v1_1_alerts_and_skills.py` migration adding the Phase 15 alert tables is acceptable even though Phase 15's plan/research has not been authored. The schema columns required by ALRT-01 / ALRT-02 are explicit in REQUIREMENTS.md (verbatim list of columns). | Architecture Patterns / Pattern 4 | Low risk — REQUIREMENTS.md provides column-precision spec for both tables. STATE.md decision LOCKS the single-migration approach. |
| A5 | The skill_name attribute key emitted by Claude Code 2.1.116 is `skill_name` (underscore form). | Code Examples / Pattern 5 | TENTATIVE per SPIKE.md LOCK-2 — Wave 1 produced a negative finding (no live event). Phase 13 fallback strategy: try `skill_name`, then `skill.name`, then `name`. Phase 13 should ALSO re-run the live-invocation experiment from SPIKE.md re-run instructions step 4 to disambiguate. |
| A6 | `cmc/cli/doctor.py::main` should return exit code 0 for "stale pricing" warns (status='warn'); reserve exit 1 for missing-pricing-table (status='fail'). | Common Pitfalls / Pitfall 5 | If wrong, CI fails after 30d staleness. The existing doctor.py already behaves this way (line 382: `sys.exit(1 if fails else 0)`); Phase 13's new check just needs to use `'warn'` not `'fail'` for staleness. |
| A7 | Pricing rates fetched from platform.claude.com/docs are stable through the freeze date (today). The Anthropic page does not show a "last updated" date inline. | Data dump under Standard Stack | The page is the official API pricing source per the redirect chain `anthropic.com/pricing` → `claude.com/pricing` → `platform.claude.com/docs/en/about-claude/pricing`. Confidence is HIGH for current rates; LOW for "won't change tomorrow." Mitigation: doctor staleness warning at 30d. |

## Open Questions

1. **O-1: Are `claude-opus-4-7[1m]` and `claude-sonnet-4-6[1m]` separate API rate SKUs, or aliases of the base model?**
   - What we know: The official platform.claude.com/docs/en/about-claude/pricing table (verified 2026-05-03) lists ONE rate row each for `Claude Opus 4.7` ($5/$25 per Mtok) and `Claude Sonnet 4.6` ($3/$15) with no separate >200k tier. The "Long context pricing" section explicitly states "Opus 4.7 [...] and Sonnet 4.6 include the full 1M token context window at standard pricing." Production OTEL data carries `model = "claude-opus-4-7"` (not `[1m]`); JSONL `assistant.message.model` matches.
   - What's unclear: REQUIREMENTS.md ANLY-02 enumerates 5 SKUs including the `[1m]` variants as if they were distinct rate rows. STACK.md §1 line 90 (Phase 11 research) wrote `"claude-opus-4-7[1m]": { ... }` as a separate row with comment "1M-context tier (different, higher rate)" — that comment is incorrect at 2026-05-03 prices.
   - Recommendation: **escalate to user via `/gsd-discuss-phase 13` BEFORE planning starts.** Two viable paths: (a) drop `[1m]` SKUs entirely, seed only 3 model rates, and have `compute_cost` raise `KeyError` if an `[1m]` model string ever appears (it won't in production OTEL/JSONL today); (b) seed `[1m]` rows as aliases pointing at the same Decimal values, allowing future divergence if Anthropic ever introduces a long-context premium. Option (b) is forward-compatible at low cost — recommend it.

2. **O-2: Is `event.sequence` monotonic across `claude --resume` within a single `session.id`?**
   - What we know: SPIKE.md Q13 verified `event.sequence` is intValue on api_request bodies (line 727: `7349`); LOCK-9 says it's the per-session monotonic counter. SPIKE.md does not address the resume case.
   - What's unclear: When a session is resumed, does the new process continue from the prior sequence value or restart at 1? If the latter, `(session_id, event.sequence)` is NOT unique under re-ingest of a resumed session.
   - Recommendation: Add a 5-minute spike (similar to Phase 12 Wave 1) at the start of Phase 13 — resume a session, fire an api_request, check whether `event.sequence` continues or restarts. If it restarts, change INGST-13 dedup key to include `event.timestamp` or `prompt.id` for additional discrimination. STATE.md line 44 already flags a follow-up that includes this kind of disambiguation work.

3. **O-3: Does Phase 13 cover the cache TTL split JSONL parser change, or is that out of scope?**
   - What we know: `compute_cost` signature (ANLY-01) takes 6 token kinds INCLUDING `cache_create_5m` and `cache_create_1h` separately. SPIKE.md LOCK-4 verified the split is JSONL-only at 2.1.116. Current `cmc/ingest/jsonl_parser.py:200-213` aggregates `cache_creation_input_tokens` into a single `tokens_cache_create` column — the split is not captured.
   - What's unclear: Phase 13's deliverables list does not include "extend jsonl_parser to capture 5m/1h split" or "add new columns to sessions/token_usage". Without that change, `/api/cost/summary` returns either 0 or the full aggregate for both — neither is correct.
   - Recommendation: **planner adds an explicit deliverable** to extend `cmc/ingest/jsonl_parser.py:200-213` to capture `usage["cache_creation"]["ephemeral_5m_input_tokens"]` and `["ephemeral_1h_input_tokens"]` into two new columns on `sessions` (and corresponding daily rollups in `token_usage`). The migration `0002_v1_1_alerts_and_skills.py` adds those columns. Backfill of historical sessions is a Phase 13 task (re-run JSONL parser idempotently). Alternatively, **defer split-TTL accuracy to Phase 14** and use a single `cache_create` column in Phase 13, treating cache_create_5m and cache_create_1h as the same rate (which they are NOT — 1.25× vs 2× base input). The latter ships faster but is mathematically wrong; the former is correct.

4. **O-4: Should the seed loader run automatically in `lifespan.py`, or only via an explicit `cmc seed pricing` CLI command?**
   - What we know: Project pattern (e.g., `cmc/app/lifespan.py`) does some startup work but most data loading is on-demand. Auto-load on startup is invisible; explicit CLI is one extra step.
   - What's unclear: ANLY-02 says "User can verify all 5 model SKUs ... seeded" — doesn't mandate WHEN. CLAUDE.md was not present to consult for project conventions.
   - Recommendation: Default to lifespan auto-load. The loader is idempotent (`on_conflict_do_nothing(["model", "effective_from"])`), so repeat boots are no-ops. Add a `cmc seed pricing --force` CLI flag for re-seeding after manual `data/pricing.json` edits. Plan should include both code paths.

5. **O-5: Frontend — does Phase 13 ship the "Rates as of …" caption, or is that Phase 14?**
   - What we know: ROADMAP.md line 34: "Pricing module, `pricing` table, cost engine, cost API, skill-name ingest column **(backend-only, no UI)**" — Phase 13 is explicitly backend-only. ANLY-05 says "User can see 'Rates as of YYYY-MM-DD' caption render on every cost figure" which implies UI work.
   - What's unclear: ANLY-05 conflicts with the ROADMAP's "backend-only" framing.
   - Recommendation: Phase 13 ships the API contract (the `rates_as_of` field appears in every cost response) and the doctor warning. Phase 14 ships the React component that renders the caption. Plan must explicitly note this split so the verifier doesn't reject Phase 13 for "no caption visible in browser."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | All backend | ✓ | ≥3.13 [VERIFIED: pyproject.toml `requires-python = ">=3.13"`] | — |
| SQLite | Database storage | ✓ (built into Python via aiosqlite) | 3.51.0 [SPIKE.md verified] | — |
| `decimal` (stdlib) | Cost math | ✓ | py3.13 builtin | — |
| `data/pricing.json` | Seed loader | ✗ (file does NOT exist yet — Phase 13 deliverable) | — | Phase 13 task creates it |
| Anthropic pricing page | One-time rate fetch (manual) | ✓ | https://platform.claude.com/docs/en/about-claude/pricing — fetched 2026-05-03 | If page is unreachable, use cached rates from this RESEARCH.md (table below) |
| `~/.claude/projects/<hash>/<sess>.jsonl` | JSONL parser (cache TTL split — see O-3) | ✓ [VERIFIED: SPIKE.md Q7 file path exists for current cwd] | live | — |
| Live Claude Code 2.1.116 with skill firing | INGST-11 live verification (re-do Wave 1 from SPIKE.md) | ✓ (Wave 1 attempted, but produced negative finding — endpoint mis-config favored) | 2.1.116 | Phase 13 spike re-runs with explicit `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Existing 6,392 OTEL rows for BUG-B backfill | Migration data step | ✓ [SPIKE.md verified] | live | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `data/pricing.json` does not exist; Phase 13 creates it with rates fetched today (2026-05-03). Tabulated rates below for in-RESEARCH reference:

```json
{
  "published_at": "2026-05-03",
  "source_url": "https://platform.claude.com/docs/en/about-claude/pricing",
  "fetched_at": "2026-05-03T00:00:00Z",
  "models": {
    "claude-opus-4-7":   {"input": "5",    "output": "25",    "cache_create_5m": "6.25",  "cache_create_1h": "10",    "cache_read": "0.50"},
    "claude-sonnet-4-6": {"input": "3",    "output": "15",    "cache_create_5m": "3.75",  "cache_create_1h": "6",     "cache_read": "0.30"},
    "claude-haiku-4-5":  {"input": "1",    "output": "5",     "cache_create_5m": "1.25",  "cache_create_1h": "2",     "cache_read": "0.10"}
  }
}
```

**Confidence:** [VERIFIED: https://platform.claude.com/docs/en/about-claude/pricing fetched 2026-05-03 via WebFetch] for the 3 base models. The `[1m]` SKUs in REQUIREMENTS.md ANLY-02 are NOT a separate rate at the API level (Open Question O-1).

## Validation Architecture

> nyquist_validation key absent from `.planning/config.json`; per researcher contract, treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `pytest 9.x` + `pytest-asyncio 0.24` [VERIFIED: backend/pyproject.toml] |
| Config file | `backend/pyproject.toml [tool.pytest.ini_options]` |
| Quick run command | `cd backend && pytest tests/test_pricing.py tests/test_ingest.py -x` |
| Full suite command | `cd backend && pytest -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANLY-01 | `compute_cost(model, …) -> Decimal` returns Decimal, no float drift | unit | `pytest tests/test_pricing.py::test_compute_cost_decimal_no_float_drift -x` | ❌ Wave 0 |
| ANLY-01 | `compute_cost` raises KeyError for unpriced model | unit | `pytest tests/test_pricing.py::test_compute_cost_unpriced_raises -x` | ❌ Wave 0 |
| ANLY-02 | All 5 (or 3 — see O-1) model SKUs round-trip from `data/pricing.json` | unit | `pytest tests/test_pricing.py::test_seed_loader_round_trip -x` | ❌ Wave 0 |
| ANLY-03 | `pricing` table effective_from/until window math: adding a row backdates `effective_until` of prior row | unit | `pytest tests/test_pricing.py::test_pricing_window_self_correcting -x` | ❌ Wave 0 |
| ANLY-04 | `GET /api/cost/summary?range=7d` returns Decimal-as-string in JSON, valid against schema | integration | `pytest tests/test_cost_router.py::test_cost_summary_returns_decimal_strings -x` | ❌ Wave 0 |
| ANLY-04 | `GET /api/cost/breakdown?dim=model` matches summary total within rounding | integration | `pytest tests/test_cost_router.py::test_breakdown_sums_to_summary -x` | ❌ Wave 0 |
| ANLY-05 | doctor check #9 returns 'warn' for >30d-old pricing | unit | `pytest tests/test_doctor.py::test_pricing_freshness_warn_at_30d -x` | ❌ Wave 0 (no test_doctor.py exists yet) |
| ANLY-05 | doctor check #9 returns 'warn' when unpriced_tokens > 0 | unit | `pytest tests/test_doctor.py::test_pricing_unpriced_warn -x` | ❌ Wave 0 |
| INGST-11 | OTLP `/v1/logs` populates `attrs_skill_name` from synthetic `skill_activated` body | integration | `pytest tests/test_ingest.py::test_otlp_logs_extracts_skill_name -x` | ❌ Wave 0 (test_ingest.py exists; new test case to add) |
| INGST-11 | OTLP `/v1/logs` populates `session_id` from `session.id` (BUG-B fix) | integration | `pytest tests/test_ingest.py::test_otlp_logs_session_id_dotted_key -x` | ❌ Wave 0 |
| INGST-12 | Migration `0002` upgrades cleanly from `0001_initial` | integration | `pytest tests/test_migrations.py::test_0002_upgrade -x` | ❌ Wave 0 (no test_migrations.py exists) |
| INGST-12 | Migration `0002` downgrades cleanly back to `0001_initial` | integration | `pytest tests/test_migrations.py::test_0002_downgrade -x` | ❌ Wave 0 |
| INGST-13 | Re-POSTing the same OTLP body twice creates exactly 1 row (UNIQUE constraint) | integration | `pytest tests/test_ingest.py::test_otlp_logs_idempotent_session_seq -x` | ❌ Wave 0 |
| (BUG-A) | `/api/tools/edit-decisions` correctly groups by tool_name post-fix | integration | `pytest tests/test_observability_router.py::test_edit_decisions_otel_uses_json_each -x` | ✅ test_observability_router.py exists; new case to add |

### Sampling Rate
- **Per task commit:** `cd backend && pytest tests/test_pricing.py tests/test_ingest.py tests/test_cost_router.py -x -q` (target: <30s)
- **Per wave merge:** `cd backend && pytest -q` (full suite, target: <2min)
- **Phase gate:** Full suite green; manual smoke: `python -c "from cmc.pricing import compute_cost, load_rates; ..."` REPL session per success criterion #1; `curl http://127.0.0.1:8765/api/cost/summary?range=7d` per success criterion #2.

### Wave 0 Gaps
- [ ] `backend/tests/test_pricing.py` — new file; covers ANLY-01, ANLY-02, ANLY-03
- [ ] `backend/tests/test_cost_router.py` — new file; covers ANLY-04
- [ ] `backend/tests/test_doctor.py` — new file; covers POLI-01 / ANLY-05 (also covers existing 8 doctor checks under coverage extension)
- [ ] `backend/tests/test_migrations.py` — new file; covers INGST-12 upgrade/downgrade (uses ephemeral SQLite tmp file)
- [ ] New test cases in existing `backend/tests/test_ingest.py`: `test_otlp_logs_extracts_skill_name`, `test_otlp_logs_session_id_dotted_key`, `test_otlp_logs_idempotent_session_seq`
- [ ] New test case in existing `backend/tests/test_observability_router.py`: `test_edit_decisions_otel_uses_json_each` (BUG-A)
- [ ] Test fixture: synthetic `skill_activated` OTLP body in `backend/tests/fixtures/` mirroring SPIKE.md Q13 representative `api_request` shape but with `event.name = "skill_activated"` and a `skill_name` attribute. Construct from SPIKE LOCK-1/LOCK-2/LOCK-5 references — defensive of TENTATIVE-confidence locks.

## Security Domain

> security_enforcement key absent from `.planning/config.json`; per researcher contract, treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | Phase 13 endpoints inherit `cmc/auth/dependencies.py` from the existing `/api` router prefix mount at `cmc/app/factory.py:140` (`auth_enabled` toggle); no new auth surfaces |
| V3 Session Management | no | No sessions or cookies introduced; cost endpoints are stateless reads |
| V4 Access Control | no | All `/api/cost/*` endpoints have the same access control as existing `/api/*` (single-user local dashboard; no per-resource ACL) |
| V5 Input Validation | yes | `range_: Literal["today", "7d", "30d"]` and `dim: Literal["model", "skill", "project"]` enforced by FastAPI `Query` typing (existing project pattern); rejects out-of-enum input at the framework boundary |
| V6 Cryptography | no | No crypto operations in this phase; pricing data is non-sensitive (it's published on a public page) |
| V7 Errors and Logging | yes | `/v1/logs` MUST always return 200 (locked anti-feature); per-record errors go to `log.exception` with `otel.log_record_skip` event name (existing pattern at `ingest.py:141`) — NEVER include user data or auth tokens in log lines |
| V8 Data Protection | partial | `data/pricing.json` is non-sensitive. The `pricing` table has no PII. Token counts are operational telemetry; existing `otel_events` row-level retention applies (no Phase 13 change) |

### Known Threat Patterns for Python + SQLite + FastAPI + OTLP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via dynamic SQL in `/api/cost/breakdown` `dim` parameter | Tampering | `dim: Literal[...]` parameter typing; whitelist-mapped to a safe SQL fragment (existing `_RANGE_TO_SINCE` pattern in `observability.py:64`); never f-string the user value into SQL |
| Float drift causing money math errors visible to user | Repudiation (calculation discrepancy) | `Decimal`-only math with `getcontext().prec = 28`; Pydantic v2 string serialization preserves precision over JSON wire |
| Rate-limit bypass on `/api/cost/*` (heavy aggregate queries) | Denial of Service | Existing `cmc/middleware/rate_limit.py` already mounted on `/api/*` paths; Phase 13 adds no new bypass |
| OTLP body bomb via `/v1/logs` causing OOM | Denial of Service | Existing `Settings.otlp_max_body_bytes` cap enforced at `cmc/api/routes/ingest.py:49-65`; Phase 13's column adds increase per-row insert cost negligibly |
| Unique-constraint violation feedback leaking session IDs | Information Disclosure | The savepoint pattern already in use at `ingest.py:115-139` swallows IntegrityError silently and falls back to NULL session_id row insert; INGST-13 extends with `on_conflict_do_nothing` which doesn't even raise — leak surface unchanged |
| Pricing data tampering (operator edits `data/pricing.json` to manipulate cost reports) | Tampering | Out of scope (single-user local dashboard; the user IS the operator; `cmc doctor` warns on staleness but assumes operator integrity by design) |

## Sources

### Primary (HIGH confidence)
- **Anthropic API Pricing** — https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-05-03 via WebFetch). Authoritative for all 3 base model rates and the cache TTL multipliers (1.25× / 2× / 0.1×).
- **SQLAlchemy 2.0 Documentation** — Context7 `/websites/sqlalchemy_en_20`, queries: "SQLite Numeric Decimal TypeDecorator pattern lossless", "SQLite Numeric storage TEXT decimal precision warning". Authoritative for `Numeric(precision, scale, asdecimal=True)` SQLite behavior and `TypeDecorator` recipe (used here only as a fallback option).
- **Alembic Documentation** — Context7 `/websites/alembic_sqlalchemy`, query: "SQLite ADD COLUMN with index batch_alter_table create_index". Authoritative for `op.batch_alter_table` and SQLite recreate-style migration.
- **Python decimal module** — https://docs.python.org/3/library/decimal.html. Authoritative for `getcontext()`, `quantize()`, `ROUND_HALF_EVEN`, and the warnings against `Decimal(float_value)`.
- **Project SPIKE.md** — `.planning/research/SPIKE.md` (Phase 12 output). LOCK-1 through LOCK-10 + BUG-A + BUG-B drive Phase 13's INGST-11/12/13 contract and BUG fixes. SPIKE.md cross-references map every lock to a specific Phase 13 consuming artifact at file:line precision.
- **Project source files** — `backend/cmc/api/routes/ingest.py`, `backend/cmc/ingest/otel_parser.py`, `backend/cmc/db/models/otel_events.py`, `backend/migrations/versions/0001_initial.py`, `backend/cmc/cli/doctor.py`, `backend/pyproject.toml`, `frontend/package.json`. All read directly during research.

### Secondary (MEDIUM confidence)
- **Pydantic Decimal serialization** — WebSearch query "FastAPI Pydantic Decimal serialization JSON response money precision" cross-referenced with the Pydantic v2 changelog (`Decimal` defaults to JSON string in v2). Authoritative behavior; not directly fetched from Pydantic docs but consistent across multiple secondary sources including official issue trackers (https://github.com/fastapi/fastapi/discussions/12050).
- **recharts version current as of 2026-05-03** — WebSearch "recharts npm latest version 2026 changelog 3.8" returned `3.8.1` as latest. Confidence MEDIUM — not directly fetched from npm registry, but multiple secondary sources agree.
- **`event.sequence` semantics** — SPIKE.md Q13 verified the field exists with intValue type at 2.1.116; semantic claim that it's a "per-session monotonic counter" is consistent across SPIKE.md text but not separately verified against Anthropic docs (which do not document the field). Mark as MEDIUM and verify under Open Question O-2.

### Tertiary (LOW confidence — flagged for validation)
- **`[1m]` model SKU non-existence** — Three independent signals: (1) Anthropic page makes no mention; (2) live OTEL data carries bare model strings; (3) JSONL `assistant.message.model` carries bare strings. Yet REQUIREMENTS.md ANLY-02 lists `[1m]` SKUs. Marked LOW confidence about the ROADMAP's intent — needs Open Question O-1 resolution via discuss-phase.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every library version is read directly from `pyproject.toml`/`package.json`; Decimal/SQLAlchemy/Alembic patterns from official docs.
- Architecture: **HIGH** — direct mirroring of an existing `attrs_mcp_*` pattern that has been running in production for 6,392 rows; new components (pricing.py, cost.py) are pure additions.
- Pitfalls: **HIGH** — five of the six pitfalls are anchored on either SPIKE.md verified locks/bugs OR official documentation (Decimal/SQLite). Pitfall 6 (event.sequence cross-resume) is the only TENTATIVE one — flagged in Open Question O-2.
- Pricing rates: **HIGH** for the 3 base models (live fetch from official page); **MEDIUM** for the [1m] SKUs (Open Question O-1 — likely don't need to exist as separate rates).
- Skill-event runtime shape: **TENTATIVE** for LOCK-1/2/3/7/8 (per SPIKE.md changelog) — Phase 13 should re-run live invocation per SPIKE.md "Re-run instructions" step 4 to disambiguate.

**Research date:** 2026-05-03
**Valid until:** 2026-06-02 (30 days for stable stack components; pricing valid until either claude.com/pricing changes OR 2026-06-02 — whichever comes first; doctor warning auto-detects staleness past then)

**Phase 12 cross-reference:** SPIKE.md is the upstream contract for INGST-11/12/13 — every lock that Phase 13 consumes is listed in SPIKE.md's cross-references table. Phase 13 plans MUST cite SPIKE locks (e.g., `[SPIKE.md#lock-2]`) per STATE.md hard-gate convention rather than paraphrase.
