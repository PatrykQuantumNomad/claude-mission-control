"""TELE-05 + TELE-06: long-poll Telegram updates, route text→claude,
callbacks→backend HTTP API.

Pitfall P2: persist telegram_offset BEFORE processing batch (crash safety
— if we crash mid-batch, the next launchd start will not re-deliver the
already-processed updates because Telegram's getUpdates contract is "give
me everything with update_id >= offset").

Pitfall P12 (Phase 11 update): shell-inherited ANTHROPIC_API_KEY is
scrubbed (untrusted); Settings-sourced ANTHROPIC_API_KEY is re-injected
(trusted). Trust boundary is Settings, not os.environ.

Pitfall P3: reply text is sent via api.send_message which deliberately
does NOT accept a parse_mode parameter (plain text only). Do not bypass
this by adding a parse_mode here.

The loop:
  1. Read system_state.telegram_offset (default 0).
  2. Long-poll api.get_updates(token, offset, timeout=25).
  3. For each non-empty batch:
       - Compute new_offset = max(update_id) + 1.
       - UPSERT it BEFORE processing the updates (Pitfall P2).
       - For each update:
           * if from.id not in allowed user_ids and != chat_id: drop.
           * if `text`: relay to `claude -p` (env-scrubbed); reply.
           * if `callback_query`: decode → route → POST/PATCH local API
             → answer_callback_query → edit_message_reply_markup
             (strip buttons so user can't double-press).
  4. On any exception in get_updates, sleep 5s and retry (network flap).

Designed to be run from cmc.telegram.oneshot_handler under launchd's
KeepAlive=true plist (see cmc.telegram.templates).
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.config import Settings
from cmc.core.paths import repo_root
from cmc.db.models.system_state import SystemState
from cmc.telegram import api, dash_router

log = logging.getLogger(__name__)

LOCAL_API = "http://127.0.0.1:8765"
CLAUDE_RELAY_TIMEOUT_S = 120
TELEGRAM_MESSAGE_CAP = 4000  # leave headroom under the 4096 hard cap


async def get_offset(db: AsyncSession) -> int:
    """Read system_state.telegram_offset. Returns 0 when unset or unparseable."""
    row = (await db.execute(
        select(SystemState).where(SystemState.key == "telegram_offset")
    )).scalar_one_or_none()
    try:
        return int(row.value) if row and row.value else 0
    except (TypeError, ValueError):
        return 0


async def set_offset(db: AsyncSession, offset: int) -> None:
    """UPSERT system_state.telegram_offset = offset. Pitfall P2: caller must
    invoke this BEFORE processing the batch so a crash mid-loop does not
    cause Telegram to redeliver already-handled updates on next start."""
    now = datetime.now(timezone.utc)
    await db.execute(
        sqlite_insert(SystemState)
        .values(key="telegram_offset", value=str(int(offset)), updated_at=now)
        .on_conflict_do_update(
            index_elements=["key"],
            set_={"value": str(int(offset)), "updated_at": now},
        )
    )
    await db.commit()


def is_user_allowed(from_id: int | str, settings: Settings) -> bool:
    """User whitelist gate.

    A from_id is allowed when it equals the configured chat_id OR it
    appears in telegram_allowed_user_ids. Comparison is done as strings
    so 123 and "123" both match.
    """
    sid = str(from_id)
    if sid == str(settings.telegram_chat_id or ""):
        return True
    return sid in {str(u) for u in (settings.telegram_allowed_user_ids or [])}


def relay_text_to_claude(text: str, settings: Settings) -> str:
    """Spawn `claude -p TEXT --bare --output-format text` synchronously.

    Pitfall P12 (Phase 11 trust-boundary refinement): shell-inherited
    ANTHROPIC_API_KEY values are scrubbed (untrusted source). Settings-sourced
    values (loaded from ~/.command-centre/.env via Settings.env_file tuple)
    are then re-injected because Settings IS the trust boundary. Dispatcher
    run_classic.py intentionally does NOT do this re-inject — it uses
    subscription auth via ~/.claude/, not API key.

    Returns the stdout text (or a friendly error string on
    timeout/non-zero exit). Always returns a string — never raises —
    because the caller sends the result back to Telegram regardless.
    """
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)            # scrub shell-inherited (untrusted)
    if settings.anthropic_api_key:                # surface from Settings (trusted)
        env["ANTHROPIC_API_KEY"] = settings.anthropic_api_key
    cmd = [
        str(settings.claude_bin), "-p", text, "--bare",
        "--output-format", "text",
        "--model", settings.claude_default_model,
    ]
    try:
        res = subprocess.run(
            cmd,
            cwd=str(repo_root()),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            timeout=CLAUDE_RELAY_TIMEOUT_S,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return f"(claude timed out after {CLAUDE_RELAY_TIMEOUT_S}s)"
    except FileNotFoundError as exc:
        return f"(claude binary missing: {exc})"
    if res.returncode != 0:
        err_tail = res.stderr.decode("utf-8", "replace")[:300] if res.stderr else ""
        return f"(claude error rc={res.returncode}: {err_tail})"
    out = res.stdout.decode("utf-8", "replace") if res.stdout else ""
    return out or "(empty reply)"


async def dispatch_callback(
    update: dict[str, Any],
    settings: Settings,
    http_client: httpx.AsyncClient,
    telegram_client: httpx.AsyncClient,
) -> None:
    """Decode callback_query.data via dash_router and dispatch to local API.

    Always calls answer_callback_query (Telegram's 15s contract — even on
    parse errors / unauthorized users) so the spinner in the user's
    Telegram UI clears. Strips buttons via edit_message_reply_markup on
    success so a user can't double-press.
    """
    cq = update["callback_query"]
    cq_id = cq["id"]
    from_id = cq["from"]["id"]
    if not is_user_allowed(from_id, settings):
        log.info("handler.callback.dropped_unauthorized", extra={"from": from_id})
        try:
            await api.answer_callback_query(
                settings.telegram_bot_token, cq_id,
                text="not authorized", client=telegram_client,
            )
        except Exception:
            log.info("handler.callback.answer_failed_ignore")
        return

    data = cq.get("data") or ""
    chat_id = str(cq["message"]["chat"]["id"])
    message_id = str(cq["message"]["message_id"])

    # Decode + route. Parse failures and unknown verbs both raise
    # CallbackParseError — collapse the two into one path.
    try:
        verb, args = dash_router.decode_callback(data)
        method, path, body = dash_router.route(verb, args)
    except dash_router.CallbackParseError as exc:
        log.warning(
            "handler.callback.parse_error",
            extra={"data": data, "err": str(exc)},
        )
        try:
            await api.answer_callback_query(
                settings.telegram_bot_token, cq_id,
                text="bad callback", client=telegram_client,
            )
        except Exception:
            log.info("handler.callback.answer_failed_ignore")
        return

    ack_text = "ok"
    success = False
    try:
        if method == "RESOLVE_THEN_PATCH":
            # snooze:<kind>:<entity>:<duration> — handler resolves
            # notif_id from (kind, entity_id, chat_id) before PATCH.
            r = await http_client.get(
                f"{LOCAL_API}{path}", params={"chat_id": chat_id},
            )
            if r.status_code != 200:
                ack_text = f"resolve failed {r.status_code}"
            else:
                notif_id = r.json().get("id")
                duration = body.get("duration", "30m")
                r2 = await http_client.patch(
                    f"{LOCAL_API}/api/notifications/{notif_id}/snooze",
                    params={"duration": duration},
                )
                if r2.status_code == 200:
                    ack_text = f"snoozed {duration}"
                    success = True
                else:
                    ack_text = f"snooze err {r2.status_code}"
        elif method == "NOOP":
            # reply_inbox: in v1 we don't capture reply state via Telegram
            # — direct the user back to the dashboard.
            ack_text = "reply via dashboard"
        else:
            r = await http_client.request(
                method, f"{LOCAL_API}{path}", json=body,
            )
            if r.status_code < 400:
                ack_text = f"ok ({r.status_code})"
                success = True
            else:
                ack_text = f"err {r.status_code}"
    except Exception as exc:
        log.warning(
            "handler.callback.dispatch_failed",
            extra={"verb": verb, "err": str(exc)},
        )
        ack_text = "dispatch failed"

    # Always ack within 15s (Telegram contract) — even on dispatch failures.
    try:
        await api.answer_callback_query(
            settings.telegram_bot_token, cq_id,
            text=ack_text, client=telegram_client,
        )
    except Exception:
        log.info("handler.callback.answer_failed_ignore")

    # Strip buttons on success so user can't double-press.
    if success:
        try:
            await api.edit_message_reply_markup(
                settings.telegram_bot_token, chat_id, message_id,
                client=telegram_client,
            )
        except Exception:
            log.info(
                "handler.callback.edit_failed_ignore",
                extra={"chat_id": chat_id, "msg": message_id},
            )


async def dispatch_text(
    update: dict[str, Any],
    settings: Settings,
    telegram_client: httpx.AsyncClient,
) -> None:
    """Relay a text message from a whitelisted user to `claude -p` and
    reply with the response (chunked at 4000 chars to fit Telegram's
    4096-byte cap)."""
    msg = update["message"]
    from_id = msg["from"]["id"]
    if not is_user_allowed(from_id, settings):
        log.info("handler.text.dropped_unauthorized", extra={"from": from_id})
        return
    text = msg.get("text", "")
    if not text.strip():
        return
    chat_id = str(msg["chat"]["id"])
    # Run blocking subprocess in thread executor to avoid blocking the loop.
    reply = await asyncio.to_thread(relay_text_to_claude, text, settings)
    if not reply:
        return
    for chunk_start in range(0, len(reply), TELEGRAM_MESSAGE_CAP):
        chunk = reply[chunk_start:chunk_start + TELEGRAM_MESSAGE_CAP]
        try:
            await api.send_message(
                settings.telegram_bot_token, chat_id, chunk,
                client=telegram_client,
            )
        except Exception as exc:
            log.warning(
                "handler.text.send_failed",
                extra={"err": str(exc), "chat_id": chat_id},
            )
            break


async def run_handler_loop(
    sessions,
    settings: Settings,
    *,
    http_client: Optional[httpx.AsyncClient] = None,
    telegram_client: Optional[httpx.AsyncClient] = None,
    max_iterations: Optional[int] = None,
) -> int:
    """Long-poll loop. Returns total updates processed.

    Args:
        sessions: async_sessionmaker (callable returning an AsyncSession
            via `async with sessions() as db`).
        settings: cmc.config.Settings.
        http_client: optional httpx.AsyncClient for local /api/* dispatch
            (tests inject MockTransport-backed clients; production
            constructs one internally).
        telegram_client: optional httpx.AsyncClient for Telegram Bot API
            calls. Same injection pattern.
        max_iterations: optional cap on the number of polling iterations
            — tests use this to break the loop. None = run forever.

    Disabled mode: if telegram_bot_token or telegram_chat_id is unset,
    log + return 0 immediately when max_iterations is set (test path),
    otherwise sleep 60s and return (production: launchd KeepAlive will
    re-spawn but throttle prevents thrash).
    """
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        log.info("handler.disabled — telegram_bot_token or telegram_chat_id unset")
        if max_iterations is not None:
            return 0
        await asyncio.sleep(60)
        return 0

    token = settings.telegram_bot_token
    owns_http = http_client is None
    owns_tg = telegram_client is None
    if owns_http:
        http_client = httpx.AsyncClient(timeout=20)
    if owns_tg:
        telegram_client = httpx.AsyncClient(
            timeout=settings.telegram_poll_timeout_s + 10,
        )

    processed = 0
    iterations = 0
    try:
        while True:
            async with sessions() as db:
                offset = await get_offset(db)
            try:
                updates = await api.get_updates(
                    token,
                    offset=offset,
                    timeout=settings.telegram_poll_timeout_s,
                    client=telegram_client,
                )
            except Exception as exc:
                log.error("handler.get_updates_failed", extra={"err": str(exc)})
                await asyncio.sleep(5)
                iterations += 1
                if max_iterations is not None and iterations >= max_iterations:
                    break
                continue

            if updates:
                new_offset = max(u["update_id"] for u in updates) + 1
                # Pitfall P2: persist offset BEFORE processing the batch.
                async with sessions() as db:
                    await set_offset(db, new_offset)
                for u in updates:
                    try:
                        if "callback_query" in u:
                            await dispatch_callback(
                                u, settings, http_client, telegram_client,
                            )
                        elif "message" in u and "text" in u.get("message", {}):
                            await dispatch_text(u, settings, telegram_client)
                        else:
                            log.info(
                                "handler.skipped_update_kind",
                                extra={"update_id": u.get("update_id")},
                            )
                        processed += 1
                    except Exception:
                        log.exception(
                            "handler.update_processing_failed",
                            extra={"update_id": u.get("update_id")},
                        )
            iterations += 1
            if max_iterations is not None and iterations >= max_iterations:
                break
    finally:
        if owns_http:
            await http_client.aclose()
        if owns_tg:
            await telegram_client.aclose()
    return processed
