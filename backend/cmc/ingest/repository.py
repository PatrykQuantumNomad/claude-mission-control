"""Idempotent SQLAlchemy upsert helpers for Phase 2 ingestion.

Per research §4 + Open Question 4 (locked: Option B):
  - Sessions: upsert on PK session_id; immutable fields (started_at) are NOT
    overwritten; mutable fields (totals, ended_at, synced_at, jsonl_mtime) are.
  - Tools: upsert on the unique constraint tool_use_id; pending → ok/error
    transition without creating a duplicate.
  - Token usage: Option B subtract-then-add per (day, model, source). Each call
    accepts the SESSION's previous totals (or None on first parse) so re-parses
    don't double-count.

Caveat (Phase 2 v1 simplification, see 02-04-PLAN.md interfaces block):
  Sessions are attributed to a SINGLE primary (day, model) bucket on re-parse
  (the latest sync date in the system tz). Multi-day sessions therefore land
  their tokens under the latest day they were observed; small smear is
  acceptable for v1 — revisit in Phase 3+ if multi-day flows become common.

All functions DO NOT commit. The caller wraps the unit-of-work in a single
commit (sync_once does this per file).
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from datetime import date as _date
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.db.models.sessions import Session as SessionModel
from cmc.db.models.token_usage import TokenUsage
from cmc.db.models.tools import ToolCall


async def get_existing_session_for_path(
    db: AsyncSession, jsonl_path: Path | str
) -> SessionModel | None:
    """Look up an existing session by jsonl_path.

    Used by sync_once to decide whether to skip (no mtime change) or re-parse
    (mtime newer). Returns None if no row matches.
    """
    stmt = (
        select(SessionModel)
        .where(SessionModel.jsonl_path == str(jsonl_path))
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# Mutable session columns: copied from `excluded.*` on conflict.
# `started_at` is intentionally OMITTED — it's set on first insert only.
_SESSION_MUTABLE_COLS = (
    "ended_at", "synced_at", "jsonl_mtime", "jsonl_path",
    "cwd", "project_hash", "model", "source", "outcome",
    "tokens_input", "tokens_output", "tokens_cache_read",
    "tokens_cache_create", "tool_call_count", "message_count",
    "error_message",
)


async def upsert_session(db: AsyncSession, **fields) -> None:
    """Insert or update a sessions row keyed on session_id.

    Mutable cols (totals, timestamps, model, etc.) are taken from `excluded.*`
    on conflict; immutable started_at is NOT overwritten by ON CONFLICT.

    Caller passes column names as kwargs (matches SessionModel column names so
    the parser-emitted session dict can be splatted directly).
    """
    stmt = insert(SessionModel).values(**fields)
    update_cols = {
        col: getattr(stmt.excluded, col)
        for col in _SESSION_MUTABLE_COLS
        if col in fields
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["session_id"],
        set_=update_cols,
    )
    await db.execute(stmt)


async def upsert_tools(
    db: AsyncSession, session_id: str, tool_calls: Sequence[dict]
) -> None:
    """Upsert each tool call on the unique tool_use_id constraint.

    Pending → ok/error transitions update the existing row in place (no dup).
    Caller is responsible for setting the FK target session row first.
    """
    for tc in tool_calls:
        row = {
            "session_id": session_id,
            "tool_use_id": tc["tool_use_id"],
            "tool_name": tc["tool_name"],
            "started_at": tc["started_at"],
            "ended_at": tc.get("ended_at"),
            "duration_ms": tc.get("duration_ms"),
            "status": tc["status"],
            "mcp_server_name": tc.get("mcp_server_name"),
            "mcp_tool_name": tc.get("mcp_tool_name"),
            "input_summary": tc.get("input_summary"),
        }
        stmt = insert(ToolCall).values(**row)
        stmt = stmt.on_conflict_do_update(
            index_elements=["tool_use_id"],
            set_={
                "ended_at": stmt.excluded.ended_at,
                "duration_ms": stmt.excluded.duration_ms,
                "status": stmt.excluded.status,
                "mcp_server_name": stmt.excluded.mcp_server_name,
                "mcp_tool_name": stmt.excluded.mcp_tool_name,
                "input_summary": stmt.excluded.input_summary,
            },
        )
        await db.execute(stmt)


async def accumulate_token_usage(
    db: AsyncSession,
    session_id: str,
    previous_totals: dict | None,
    new_buckets: Sequence[dict],
    primary_day: _date | None,
    primary_model: str | None,
) -> None:
    """Apply Option B (subtract previous, add new) per (day, model, source).

    Args:
      session_id: identifies the session whose contribution is being adjusted.
        Reserved for future per-session bucket tracking; unused in Phase 2 v1.
      previous_totals: None on first parse; otherwise a dict with keys
        tokens_input/output/cache_read/cache_create representing what the
        existing session row ALREADY contributed to the rollup.
      new_buckets: the per-(day, model) dicts emitted by parse_session_file.
        Each dict has keys: day, model, source, tokens_input, tokens_output,
        tokens_cache_read, tokens_cache_create.
      primary_day, primary_model: identify the (day, model, source='claude-code')
        bucket that should have previous_totals subtracted (Phase 2 v1
        simplification — see module docstring).

    Effect:
      - First parse: all new buckets are added; sessions_count incremented by 1
        for each unique bucket contribution.
      - Re-parse: previous_totals subtracted from the primary bucket FIRST, then
        new buckets added. sessions_count is NOT incremented again.
    """
    # Step 1: subtract previous contribution from primary bucket, if applicable.
    if previous_totals and primary_day and primary_model:
        await _adjust_bucket(
            db,
            day=primary_day, model=primary_model, source="claude-code",
            tokens_input=-int(previous_totals.get("tokens_input", 0)),
            tokens_output=-int(previous_totals.get("tokens_output", 0)),
            tokens_cache_read=-int(previous_totals.get("tokens_cache_read", 0)),
            tokens_cache_create=-int(previous_totals.get("tokens_cache_create", 0)),
            sessions_count_delta=0,  # session count unchanged on re-parse
        )

    # Step 2: add new buckets.
    is_new_session = previous_totals is None
    for b in new_buckets:
        await _adjust_bucket(
            db,
            day=b["day"],
            model=b["model"],
            source=b.get("source") or "claude-code",
            tokens_input=int(b.get("tokens_input", 0)),
            tokens_output=int(b.get("tokens_output", 0)),
            tokens_cache_read=int(b.get("tokens_cache_read", 0)),
            tokens_cache_create=int(b.get("tokens_cache_create", 0)),
            sessions_count_delta=1 if is_new_session else 0,
        )


async def _adjust_bucket(
    db: AsyncSession, *,
    day: _date, model: str, source: str,
    tokens_input: int, tokens_output: int,
    tokens_cache_read: int, tokens_cache_create: int,
    sessions_count_delta: int,
) -> None:
    """Insert or update a token_usage row, ADDING the deltas to existing values.

    Negative deltas are valid (used by Option B subtract step). Pattern:
      1. UPDATE ... SET col = col + :delta WHERE (day, model, source) match.
      2. If rowcount == 0, INSERT a fresh row with the deltas as the values.
         (For Phase 2's single-writer scheduler we don't need an ON CONFLICT
         retry — the loop is single-writer per cycle.)
    """
    upd = (
        update(TokenUsage)
        .where(
            (TokenUsage.day == day)
            & (TokenUsage.model == model)
            & (TokenUsage.source == source)
        )
        .values(
            tokens_input=TokenUsage.tokens_input + tokens_input,
            tokens_output=TokenUsage.tokens_output + tokens_output,
            tokens_cache_read=TokenUsage.tokens_cache_read + tokens_cache_read,
            tokens_cache_create=(
                TokenUsage.tokens_cache_create + tokens_cache_create
            ),
            sessions_count=TokenUsage.sessions_count + sessions_count_delta,
            updated_at=datetime.now(UTC),
        )
    )
    result = await db.execute(upd)
    if result.rowcount and result.rowcount > 0:
        return

    # Row didn't exist: insert it. Use ON CONFLICT DO UPDATE as a safety net in
    # case a concurrent insert raced us (ignored under single-writer Phase 2,
    # but cheap insurance).
    stmt = insert(TokenUsage).values(
        day=day, model=model, source=source,
        tokens_input=tokens_input, tokens_output=tokens_output,
        tokens_cache_read=tokens_cache_read,
        tokens_cache_create=tokens_cache_create,
        sessions_count=sessions_count_delta,
        updated_at=datetime.now(UTC),
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["day", "model", "source"],
        set_={
            "tokens_input": TokenUsage.tokens_input + stmt.excluded.tokens_input,
            "tokens_output": TokenUsage.tokens_output + stmt.excluded.tokens_output,
            "tokens_cache_read": (
                TokenUsage.tokens_cache_read + stmt.excluded.tokens_cache_read
            ),
            "tokens_cache_create": (
                TokenUsage.tokens_cache_create + stmt.excluded.tokens_cache_create
            ),
            "sessions_count": (
                TokenUsage.sessions_count + stmt.excluded.sessions_count
            ),
            "updated_at": stmt.excluded.updated_at,
        },
    )
    await db.execute(stmt)
