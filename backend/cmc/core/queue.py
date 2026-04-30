"""File-based queue writer — RESEARCH §Pattern 5.

Single source of truth for `repo_root() / .tmp/mission-control-queue/`
writes. SESS-06 (Plan 03-03) writes to `messages/`; HITL-03 / HITL-07
write to `decisions/` / `inbox/`. This module owns the path layout so a
future change edits one file, not three routers.

Phase 8 dispatcher reads from these directories — Phase 4 is the writer.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

from cmc.core.paths import repo_root

QUEUE_ROOT_REL = ".tmp/mission-control-queue"


def queue_path(sub: str, key: str) -> Path:
    """Return the JSONL queue path for {sub}/{key}.jsonl, creating parents.

    Caller MUST sanitize `key` (cast to int from a Pydantic int field, or
    UUID-validate) — this helper does NOT path-traversal-check.
    """
    qdir = repo_root() / QUEUE_ROOT_REL / sub
    qdir.mkdir(parents=True, exist_ok=True)
    return qdir / f"{key}.jsonl"


def _append_jsonl(path: Path, record: dict) -> None:
    line = json.dumps(record, separators=(",", ":")) + "\n"
    with path.open("a", encoding="utf-8") as f:
        f.write(line)


def write_decision_answer(decision_id: int, answer: str, answered_by: str) -> Path:
    """Append answer record to .tmp/mission-control-queue/decisions/{id}.jsonl."""
    p = queue_path("decisions", str(int(decision_id)))
    _append_jsonl(p, {
        "ts": datetime.now(UTC).isoformat(),
        "decision_id": int(decision_id),
        "answer": answer,
        "answered_by": answered_by,
    })
    return p


def write_inbox_reply(inbox_id: int, reply: str) -> Path:
    """Append reply record to .tmp/mission-control-queue/inbox/{id}.jsonl."""
    p = queue_path("inbox", str(int(inbox_id)))
    _append_jsonl(p, {
        "ts": datetime.now(UTC).isoformat(),
        "inbox_id": int(inbox_id),
        "reply": reply,
    })
    return p
