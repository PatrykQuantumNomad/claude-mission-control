"""DISP-08 INBOX → POST /api/inbox via httpx.

Why HTTP (not direct DB INSERT): preserves Pydantic validation on the inbox
endpoint AND any future side effects such as push notifications or fan-out.

Localhost-only call (the dispatcher and the API run in the same trust domain).
Tolerates connection errors so a dead/restarting server doesn't kill the stream
loop — a missed inbox marker is far less bad than a crashed run_stream.

Note on the `source` field: the InboxCreate schema accepts `{session_id,
task_id, subject, body}`. Pydantic v2's default extra-fields
behavior is to ignore unknown keys, so sending `source: 'agent_marker'`
alongside `body` is silently dropped server-side. The marker payload still
preserves the agent_marker provenance in `body`. If a future migration adds
a `source` column the wire shape stays compatible.
"""

import logging

import httpx

log = logging.getLogger(__name__)


async def post_inbox_marker(
    body: str,
    *,
    port: int,
    host: str = "127.0.0.1",
) -> int | None:
    """POST /api/inbox with {source: 'agent_marker', body}; return inbox id or None.

    Args:
        body: The marker payload (everything after `INBOX:` up to newline).
        port: API server port (Settings.port — default 8765).
        host: Bind host (default 127.0.0.1; localhost-only by design).

    Returns:
        The inbox row id (int) on 200/201; None on connection error or non-2xx.
        Never raises — failures are logged and swallowed (DISP-08 must NOT
        abort the stream loop if /api/inbox is unreachable).
    """
    url = f"http://{host}:{int(port)}/api/inbox"
    payload = {"source": "agent_marker", "body": body}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
        if resp.status_code in (200, 201):
            data = resp.json()
            if isinstance(data, dict) and "id" in data:
                return int(data["id"])
            return None
        log.warning(
            "dispatcher.inbox_post.unexpected_status",
            extra={"status": resp.status_code, "url": url},
        )
        return None
    except httpx.RequestError as exc:
        log.warning(
            "dispatcher.inbox_post.connection_error",
            extra={"url": url, "err": str(exc)},
        )
        return None
