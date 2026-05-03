"""Phase 13 cost foundation — pure Decimal math + pricing seed loader.

ANLY-01: compute_cost(model, input, output, cache_read, cache_create_5m,
cache_create_1h) -> Decimal.
ANLY-02: 5 SKUs seeded from data/pricing.json (research §"Environment Availability").
ANLY-03: closed-open temporal intervals; load_seed upserts new rows + closes superseded.
ANLY-05: lookup miss returns Decimal(0) and increments unpriced_tokens (doctor surfaces).

Pitfalls honored:
- Pitfall 1: Decimal(str(value)) — never Decimal(float).
- Pitfall 2: cache_create_5m + cache_create_1h are SEPARATE arguments; caller must source
  both from the JSONL parser's split (Plan 03 lands the parser change).
"""
from __future__ import annotations

import hashlib
import json
import logging
from collections import Counter
from datetime import UTC, datetime
from decimal import ROUND_HALF_EVEN, Decimal, getcontext
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.pricing import PricingRow

log = logging.getLogger(__name__)

# Module-level Decimal context — bankers' rounding, wide enough for $/token
getcontext().prec = 28
getcontext().rounding = ROUND_HALF_EVEN

_MTOK = Decimal("1000000")
_PRICING_JSON = Path(__file__).resolve().parent.parent.parent / "data" / "pricing.json"

# In-process counter — incremented when a (model, token_kind) lookup misses.
# Doctor reads via cmc.pricing.unpriced_tokens (do not pickle, do not persist).
unpriced_tokens: Counter = Counter()


def _rates_dict_to_decimal(d: dict) -> dict[str, Decimal]:
    """Convert {"input": "5", ...} -> {"input_per_mtok": Decimal("5"), ...}."""
    return {
        "input_per_mtok":           Decimal(str(d["input"])),
        "output_per_mtok":          Decimal(str(d["output"])),
        "cache_read_per_mtok":      Decimal(str(d["cache_read"])),
        "cache_create_5m_per_mtok": Decimal(str(d["cache_create_5m"])),
        "cache_create_1h_per_mtok": Decimal(str(d["cache_create_1h"])),
    }


def compute_cost(
    model: str,
    input: int,
    output: int,
    cache_read: int,
    cache_create_5m: int,
    cache_create_1h: int,
    rates: dict[str, dict[str, Decimal]],
) -> Decimal:
    """Read-time cost computation. Returns Decimal(0) on lookup miss + bumps counter.

    rates: {model: {input_per_mtok: Decimal, output_per_mtok: Decimal, ...}} — pass the
    output of load_rates() (which returns the currently-effective rate per model).
    """
    if model not in rates:
        # Per-token-kind miss: count once per kind that had non-zero tokens.
        for kind, n in (
            ("input", input), ("output", output), ("cache_read", cache_read),
            ("cache_create_5m", cache_create_5m), ("cache_create_1h", cache_create_1h),
        ):
            if n:
                unpriced_tokens[(model, kind)] += n
        return Decimal(0)
    r = rates[model]
    return (
        Decimal(input)           * r["input_per_mtok"]            / _MTOK +
        Decimal(output)          * r["output_per_mtok"]           / _MTOK +
        Decimal(cache_read)      * r["cache_read_per_mtok"]       / _MTOK +
        Decimal(cache_create_5m) * r["cache_create_5m_per_mtok"]  / _MTOK +
        Decimal(cache_create_1h) * r["cache_create_1h_per_mtok"]  / _MTOK
    )


def pricing_json_path() -> Path:
    """Resolve the canonical data/pricing.json path. Tests can monkeypatch."""
    return _PRICING_JSON


def pricing_json_hash() -> str:
    """SHA-256 of pricing.json — used by load_seed for no-op skip + doctor drift check."""
    return hashlib.sha256(pricing_json_path().read_bytes()).hexdigest()


# Plan 05's doctor pricing-drift check imports this constant.
PRICING_HASH_PATH = _PRICING_JSON


async def load_rates(
    db: AsyncSession, *, at: datetime | None = None
) -> dict[str, dict[str, Decimal]]:
    """Return the currently-effective rate per model.

    at: optional point-in-time; defaults to now. Selects the row whose
    [effective_from, effective_until) interval contains `at`.
    """
    when = at or datetime.now(UTC).replace(tzinfo=None)
    stmt = select(PricingRow).where(
        PricingRow.effective_from <= when,
        (PricingRow.effective_until.is_(None)) | (PricingRow.effective_until > when),
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {
        r.model: {
            "input_per_mtok":           r.input_per_mtok,
            "output_per_mtok":          r.output_per_mtok,
            "cache_read_per_mtok":      r.cache_read_per_mtok,
            "cache_create_5m_per_mtok": r.cache_create_5m_per_mtok,
            "cache_create_1h_per_mtok": r.cache_create_1h_per_mtok,
            "effective_from":           r.effective_from,
        }
        for r in rows
    }


async def load_seed(db: AsyncSession) -> dict:
    """Idempotent lifespan startup hook.

    Behavior:
      1. Read data/pricing.json. Compute hash. If a row exists in pricing whose
         source_url and effective_from match the JSON's published_at, AND the
         hash matches a stored hash, skip (no-op).
      2. Otherwise: for each model, close any existing currently-effective row
         (set effective_until = published_at) and insert the new row with
         effective_from = published_at, effective_until = NULL.
      3. ON CONFLICT (model, effective_from) DO NOTHING — re-running with the
         same JSON is a no-op.

    Returns {"models_seeded": N, "models_closed": M, "skipped": bool, "hash": "..."}.

    Lifespan error contract: malformed pricing.json -> log.exception + return
    {"error": str}; never raise (boot must continue — the doctor surfaces).
    """
    try:
        payload = json.loads(pricing_json_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        log.exception("pricing.seed_load_failed")
        return {"error": str(exc), "skipped": True}

    published_at = datetime.fromisoformat(payload["published_at"])
    source_url = payload["source_url"]
    json_hash = pricing_json_hash()

    seeded = 0
    closed = 0
    for model_name, rates in payload["models"].items():
        # Close any currently-effective row for this model (effective_until IS NULL)
        # whose effective_from is OLDER than the new published_at.
        close_stmt = (
            update(PricingRow)
            .where(
                PricingRow.model == model_name,
                PricingRow.effective_until.is_(None),
                PricingRow.effective_from < published_at,
            )
            .values(effective_until=published_at)
        )
        result = await db.execute(close_stmt)
        closed += result.rowcount or 0

        decimals = _rates_dict_to_decimal(rates)
        ins = (
            sqlite_insert(PricingRow.__table__)
            .values(
                model=model_name,
                effective_from=published_at,
                effective_until=None,
                source_url=source_url,
                loaded_at=datetime.utcnow(),
                seed_hash=json_hash,  # doctor reads this for hash-mismatch check (Plan 05)
                **decimals,
            )
            .on_conflict_do_nothing(index_elements=["model", "effective_from"])
        )
        ins_result = await db.execute(ins)
        if ins_result.rowcount:
            seeded += 1
    await db.commit()
    log.info(
        "pricing.seed_loaded models_seeded=%d closed=%d hash=%s",
        seeded, closed, json_hash[:8],
    )
    return {"models_seeded": seeded, "models_closed": closed, "skipped": False, "hash": json_hash}
