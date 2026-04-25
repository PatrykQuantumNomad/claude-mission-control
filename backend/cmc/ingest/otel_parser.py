"""OTLP/HTTP JSON helpers — pure functions for use by cmc.api.routes.ingest.

INGST-08: MCP attribute extraction has TWO paths:
  1. `tool_parameters` attribute (only set when client-side OTEL_LOG_TOOL_DETAILS=1)
     contains a JSON-stringified blob with `mcp_server_name` and `mcp_tool_name` keys.
  2. Fallback: split `tool_name` on `__` (works without OTEL_LOG_TOOL_DETAILS=1)
     using cmc.ingest.jsonl_parser.split_mcp (Plan 02-02).

These helpers are deliberately pure: no DB, no FastAPI, no async. They make
the router layer trivial to unit-test without a TestClient.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from cmc.ingest.jsonl_parser import split_mcp  # reuse Plan 02-02 helper

log = logging.getLogger(__name__)


def iter_attrs(attrs_list: list | None) -> dict[str, dict]:
    """Convert OTLP `[{key, value}]` attribute list to {key: value_dict}.

    Returns empty dict for None or non-list input. Skips list items that
    aren't dicts or that lack a "key". The returned value dicts preserve the
    OTLP shape (e.g. `{"stringValue": "foo"}`) so callers can pick the right
    typed accessor.
    """
    out: dict[str, dict] = {}
    if not attrs_list:
        return out
    for a in attrs_list:
        if isinstance(a, dict) and "key" in a:
            out[a["key"]] = a.get("value") or {}
    return out


def parse_unix_nano(s: str | int | None) -> datetime | None:
    """Convert OTLP nanosecond-string timestamp -> aware UTC datetime.

    Returns None for None / unparseable input (callers fall back to "now").
    Accepts both string ("1745601281385000000") and int forms — the OTLP
    spec uses string for protobuf int64 wire safety, but JSON also allows
    raw ints.
    """
    if s is None:
        return None
    try:
        ns = int(s)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(ns / 1_000_000_000, tz=timezone.utc)


def extract_mcp_attrs(record: dict) -> tuple[str | None, str | None]:
    """Return (mcp_server, mcp_tool) for an OTLP log record, or (None, None).

    Strategy (research §2 + INGST-08):
      1. Read `tool_name` attribute. If it doesn't start with `mcp__`, return (None, None).
      2. Try `tool_parameters` attribute (JSON-stringified) — present only when
         the client-side env var `OTEL_LOG_TOOL_DETAILS=1` is set. Pull
         `mcp_server_name` + `mcp_tool_name` from that JSON if present.
      3. Fallback: split `tool_name` on `__` via Plan 02-02's split_mcp helper.
    """
    attrs = iter_attrs(record.get("attributes"))
    tool_name = (attrs.get("tool_name") or {}).get("stringValue") or ""
    if not tool_name.startswith("mcp__"):
        return None, None
    params_raw = (attrs.get("tool_parameters") or {}).get("stringValue")
    if params_raw:
        try:
            p = json.loads(params_raw)
            srv = p.get("mcp_server_name")
            tl = p.get("mcp_tool_name")
            if srv or tl:
                return srv, tl
        except json.JSONDecodeError:
            pass
    return split_mcp(tool_name)
