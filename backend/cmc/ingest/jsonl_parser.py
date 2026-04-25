"""JSONL transcript parser — pure functions, no DB, no async, no I/O beyond reading the file.

Called by cmc.ingest.scheduler (Plan 02-04) inside asyncio.to_thread() so the
event loop stays responsive during a parse. Returns a dict whose keys match the
SQLModel column names in cmc.db.models.{sessions,tools,token_usage} so the
repository in Plan 02-04 can pass them as **kwargs to upsert helpers.

Per INGST-06 + research §1 Pitfall: corrupted JSONL lines must NEVER crash the
parser. iter_jsonl() catches JSONDecodeError per-line, logs a warning, and
continues so subsequent valid lines are still parsed.

Per research §5 + INGST-05: token_usage_buckets are bucketed by LOCAL date
(astimezone() with no arg honors the OS tz), not UTC date.

Per INGST-03 + research §3: paired tool_call durations are clamped at 10 minutes
(_TEN_MIN_MS) so unattended-tool outliers (sleep, long compile) cannot skew
downstream charts.

Returned dict shape (consumed by Plan 02-04's repository as **kwargs to upserts):

    {
      "session": {
        "session_id": str | None,
        "started_at": datetime (UTC, aware) | None,
        "cwd": str | None,
        "model": str | None,
        "tokens_input": int,
        "tokens_output": int,
        "tokens_cache_read": int,
        "tokens_cache_create": int,
        "message_count": int,
        "tool_call_count": int,
        "_last_message_ts": datetime (UTC) | None,  # popped by scheduler
      },
      "tool_calls": [
        {
          "tool_use_id": str,
          "tool_name": str,
          "started_at": datetime,
          "ended_at": datetime | None,
          "duration_ms": int | None,
          "status": "ok" | "error" | "pending",
          "mcp_server_name": str | None,
          "mcp_tool_name": str | None,
          "input_summary": str | None,
        },
        ...
      ],
      "token_usage_buckets": [
        {
          "day": datetime.date,
          "model": str,
          "source": "claude-code",
          "tokens_input": int,
          "tokens_output": int,
          "tokens_cache_read": int,
          "tokens_cache_create": int,
        },
        ...
      ],
    }

NOTE: parse_session_file does NOT decide session.ended_at — the scheduler in
Plan 02-04 does that based on file mtime + Settings.session_idle_minutes. The
parser exposes _last_message_ts for the scheduler to consume.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date as _date, datetime
from pathlib import Path
from typing import Iterator

log = logging.getLogger(__name__)

_TEN_MIN_MS = 600_000  # INGST-03 cap


def iter_jsonl(path: Path) -> Iterator[dict]:
    """Yield one parsed JSON object per non-empty line.

    Per INGST-06: a JSONDecodeError on any line is logged at WARNING and the
    line is skipped — iteration continues so valid lines after a corrupted
    line are still yielded. The parser MUST NEVER crash a sync cycle.
    """
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as e:
                log.warning(
                    "jsonl.parse_skip path=%s line=%d err=%s", path, lineno, e
                )
                continue


def parse_iso_z(ts: str) -> datetime:
    """Parse Anthropic's ISO-8601 'Z' timestamps -> aware UTC datetime.

    Python's fromisoformat does not accept the trailing 'Z' until 3.11+ in
    some flavors; replace it with the explicit +00:00 offset for portability.
    """
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def split_mcp(tool_name: str | None) -> tuple[str | None, str | None]:
    """Split `mcp__<server>__<tool>` into (server, tool); return (None, None) otherwise.

    maxsplit=2 ensures the tool component preserves any further `__`
    separators (e.g. `mcp__svc__do__a_thing` -> ("svc", "do__a_thing")).

    Returns (None, None) for:
      - None / empty string
      - names not starting with 'mcp__'
      - names with only one '__' separator (e.g. 'mcp__weird')
    """
    if not tool_name or not tool_name.startswith("mcp__"):
        return None, None
    parts = tool_name.split("__", 2)
    if len(parts) < 3:
        return None, None
    return parts[1], parts[2]


def _summarize_input(value) -> str | None:
    """Best-effort short string for tools.input_summary column. Truncate to 200 chars.

    Falls back to repr() when the value isn't JSON-serialisable so we never
    bubble an exception out of a parse.
    """
    if value is None:
        return None
    try:
        s = json.dumps(value, ensure_ascii=False)[:200]
    except (TypeError, ValueError):
        s = repr(value)[:200]
    return s


def parse_session_file(path: Path) -> dict:
    """Walk a session JSONL once; return aggregated upsert payloads.

    See module docstring for the returned dict shape.

    Implementation notes:
      - Single pass; tool_use and tool_result blocks are buffered and paired
        at the end so we don't depend on tool_use appearing before its result.
      - usage extraction: keys with `cache_*` shape inside the assistant
        message.usage block translate to `tokens_cache_*` in the returned
        session dict (matches sessions table column names — translation happens
        once, in the return-dict construction, not at each accumulation site).
      - INGST-05 daily bucket: bucket key uses .astimezone().date() (local tz),
        per the requirement.
    """
    session_id: str | None = None
    started_at: datetime | None = None
    last_ts: datetime | None = None
    cwd: str | None = None
    model: str | None = None
    tokens_input = 0
    tokens_output = 0
    tokens_cache_read = 0
    tokens_cache_create = 0
    message_count = 0
    tool_uses: dict[str, dict] = {}
    tool_results: dict[str, dict] = {}
    daily: dict[tuple[_date, str], dict] = defaultdict(
        lambda: {"input": 0, "output": 0, "cache_read": 0, "cache_create": 0}
    )

    for ev in iter_jsonl(path):
        if not isinstance(ev, dict):
            continue
        ev_type = ev.get("type")
        if ev_type not in ("user", "assistant"):
            continue
        if ev.get("isMeta"):
            continue
        ts_str = ev.get("timestamp")
        if not ts_str:
            continue
        try:
            ts = parse_iso_z(ts_str)
        except (ValueError, AttributeError):
            continue
        session_id = session_id or ev.get("sessionId")
        cwd = cwd or ev.get("cwd")
        started_at = started_at or ts
        last_ts = ts
        message_count += 1

        msg = ev.get("message") or {}
        if ev_type == "assistant":
            model = msg.get("model") or model
            usage = msg.get("usage") or {}
            tin = int(usage.get("input_tokens") or 0)
            tout = int(usage.get("output_tokens") or 0)
            tcr = int(usage.get("cache_read_input_tokens") or 0)
            tcc = int(usage.get("cache_creation_input_tokens") or 0)
            tokens_input += tin
            tokens_output += tout
            tokens_cache_read += tcr
            tokens_cache_create += tcc
            local_day = ts.astimezone().date()  # INGST-05: local-time bucket
            bucket = daily[(local_day, model or "unknown")]
            bucket["input"] += tin
            bucket["output"] += tout
            bucket["cache_read"] += tcr
            bucket["cache_create"] += tcc

        content = msg.get("content")
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    tool_uses[block.get("id")] = {
                        "tool_use_id": block.get("id"),
                        "tool_name": block.get("name"),
                        "started_at": ts,
                        "input_summary": _summarize_input(block.get("input")),
                    }
                elif btype == "tool_result":
                    tool_results[block.get("tool_use_id")] = {
                        "tool_use_id": block.get("tool_use_id"),
                        "ended_at": ts,
                        "is_error": bool(block.get("is_error")),
                    }

    paired: list[dict] = []
    for tid, use in tool_uses.items():
        result = tool_results.get(tid)
        if result and use["started_at"] and result["ended_at"]:
            raw_ms = int((result["ended_at"] - use["started_at"]).total_seconds() * 1000)
            duration_ms = max(0, min(raw_ms, _TEN_MIN_MS))  # INGST-03 cap
            status = "error" if result["is_error"] else "ok"
            ended_at = result["ended_at"]
        else:
            duration_ms = None
            status = "pending"
            ended_at = None
        srv, tl = split_mcp(use.get("tool_name") or "")
        paired.append({
            "tool_use_id": use["tool_use_id"],
            "tool_name": use["tool_name"],
            "started_at": use["started_at"],
            "ended_at": ended_at,
            "duration_ms": duration_ms,
            "status": status,
            "mcp_server_name": srv,
            "mcp_tool_name": tl,
            "input_summary": use["input_summary"],
        })

    return {
        "session": {
            "session_id": session_id,
            "started_at": started_at,
            "cwd": cwd,
            "model": model,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output,
            "tokens_cache_read": tokens_cache_read,
            "tokens_cache_create": tokens_cache_create,
            "message_count": message_count,
            "tool_call_count": len(paired),
            "_last_message_ts": last_ts,  # consumed by scheduler in Plan 02-04
        },
        "tool_calls": paired,
        "token_usage_buckets": [
            {
                "day": d,
                "model": m,
                "source": "claude-code",
                "tokens_input": v["input"],
                "tokens_output": v["output"],
                "tokens_cache_read": v["cache_read"],
                "tokens_cache_create": v["cache_create"],
            }
            for (d, m), v in daily.items()
        ],
    }
