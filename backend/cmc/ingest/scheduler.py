"""Periodic JSONL sync orchestration.

Phase 2 contract:
  - `sync_once(sessionmaker, settings)` is the unit-of-work used by both
    cmc.app.lifespan (boot-time + periodic) and Plan 02-05's manual
    POST /api/sync route. Returns a summary dict for logs / API response.
  - `periodic_sync_loop(sessionmaker, settings, interval_s=120)` wraps
    sync_once in a never-ending while True loop with cancellation hygiene
    per research §3 + Pitfall 7: bare `except Exception` (NOT BaseException)
    so cancellation propagates while transient errors don't kill the loop.

Key rules (research §1, §3, §5 + Pitfalls 5/7):
  - Glob `*/*.jsonl` (ONE level) — never `**/*.jsonl` (would scoop subagents).
  - Heavy parsing offloaded via `await asyncio.to_thread(parse_session_file, p)`.
  - One AsyncSession per file (transaction boundary = one file's unit-of-work).
  - Skip-decision: if existing session is already `ended_at` AND the on-disk
    mtime hasn't moved forward, no reparse.
  - ended_at heuristic: `datetime.now() - mtime > idle_threshold` →
    set ended_at = parser._last_message_ts; else leave None ("still live").
"""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from cmc.config import Settings
from cmc.ingest.jsonl_parser import parse_session_file
from cmc.ingest.repository import (
    accumulate_token_usage,
    get_existing_session_for_path,
    upsert_session,
    upsert_tools,
)

log = logging.getLogger(__name__)


async def sync_once(sessionmaker: async_sessionmaker, settings: Settings) -> dict:
    """Run one full ingestion cycle.

    Walks `settings.jsonl_root.glob('*/*.jsonl')` and, for each file: opens
    a fresh AsyncSession, decides skip-vs-reparse, parses (off-thread), and
    upserts sessions/tools/token_usage with Option B token math.

    Returns:
      {"files_seen": int, "files_updated": int, "errors": int, "duration_ms": int}

    Tolerates:
      - missing jsonl_root (logs warning, returns zero summary)
      - corrupted JSONL lines (skipped by iter_jsonl, parse continues)
      - per-file errors (logged, counted in `errors`, loop continues)
    """
    loop = asyncio.get_running_loop()
    started_clock = loop.time()
    summary: dict = {"files_seen": 0, "files_updated": 0, "errors": 0}

    root = Path(settings.jsonl_root).expanduser()
    if not root.is_dir():
        log.warning("ingest.jsonl_root_missing path=%s", root)
        summary["duration_ms"] = 0
        return summary

    # ONE LEVEL ONLY — never **/*.jsonl (would scoop subagents per Pitfall 5).
    for jsonl_path in sorted(root.glob("*/*.jsonl")):
        summary["files_seen"] += 1
        try:
            updated = await _sync_one_file(sessionmaker, settings, jsonl_path)
            if updated:
                summary["files_updated"] += 1
        except Exception:
            log.exception("ingest.file_error path=%s", jsonl_path)
            summary["errors"] += 1

    summary["duration_ms"] = int((loop.time() - started_clock) * 1000)
    return summary


async def _sync_one_file(
    sessionmaker: async_sessionmaker,
    settings: Settings,
    jsonl_path: Path,
) -> bool:
    """Process a single JSONL file. Returns True if a row was upserted."""
    mtime = datetime.fromtimestamp(jsonl_path.stat().st_mtime, UTC)

    async with sessionmaker() as db:
        existing = await get_existing_session_for_path(db, jsonl_path)
        # Skip if existing session is already ended AND mtime hasn't moved.
        if (
            existing
            and existing.ended_at is not None
            and existing.jsonl_mtime is not None
            and existing.jsonl_mtime >= mtime
        ):
            return False

        # Heavy parsing happens off the event loop (research §5 / Pitfall 5).
        parsed = await asyncio.to_thread(parse_session_file, jsonl_path)
        sess = dict(parsed["session"])
        if not sess.get("session_id"):
            return False  # empty / unparseable file

        # ended_at decision via mtime heuristic (research §1).
        last_ts = sess.pop("_last_message_ts", None)
        idle = timedelta(minutes=settings.session_idle_minutes)
        is_stale = (datetime.now(UTC) - mtime) > idle
        sess["ended_at"] = last_ts if is_stale else None

        # Scheduler-supplied fields (parser doesn't know these).
        sess["jsonl_path"] = str(jsonl_path)
        sess["jsonl_mtime"] = mtime
        sess["synced_at"] = datetime.now(UTC)
        sess["source"] = sess.get("source") or "claude-code"
        # project_hash = the parent directory name (e.g. -Users-test-project).
        sess["project_hash"] = jsonl_path.parent.name

        # Compute Option B previous-totals BEFORE upsert (so we still have the
        # existing row's old values).
        previous_totals = None
        primary_day = None
        primary_model = None
        if existing:
            previous_totals = {
                "tokens_input": existing.tokens_input or 0,
                "tokens_output": existing.tokens_output or 0,
                "tokens_cache_read": existing.tokens_cache_read or 0,
                "tokens_cache_create": existing.tokens_cache_create or 0,
            }
            # Phase 2 v1 simplification: attribute previous-totals to the
            # latest sync-date in the system tz (see repository.py docstring).
            primary_day = (existing.synced_at or datetime.now(UTC)).date()
            primary_model = existing.model or "unknown"

        await upsert_session(db, **sess)
        await upsert_tools(db, sess["session_id"], parsed["tool_calls"])
        await accumulate_token_usage(
            db,
            session_id=sess["session_id"],
            previous_totals=previous_totals,
            new_buckets=parsed["token_usage_buckets"],
            primary_day=primary_day,
            primary_model=primary_model,
        )
        await db.commit()
        return True


async def periodic_sync_loop(
    sessionmaker: async_sessionmaker,
    settings: Settings,
    interval_s: int = 120,
) -> None:
    """Sleep then sync, forever. Lifespan-friendly cancellation.

    Sleeps FIRST so a boot-time sync_once call (in lifespan startup) isn't
    immediately duplicated by the loop's first iteration.

    Pitfall 7: catch Exception (NOT BaseException) so transient errors
    (DB lock, FS hiccup) don't kill the loop, while CancelledError
    propagates for clean shutdown.
    """
    while True:
        try:
            await asyncio.sleep(interval_s)
            summary = await sync_once(sessionmaker, settings)
            log.info("ingest.cycle %s", summary)
        except asyncio.CancelledError:
            log.info("ingest.cycle_cancelled")
            raise
        except Exception:
            log.exception("ingest.cycle_unexpected_error")
            continue
