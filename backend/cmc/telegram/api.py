"""Bot API wrapper. Plain text only — Pitfall P3.

CRITICAL: do NOT add a `parse_mode` parameter to send_message under any
circumstances. The DB content (decision prompts, error messages, schedule
names) contains unescaped backticks, asterisks, and underscores; sending
those as MarkdownV2 routinely produces 400 Bad Request from Telegram and
swallows the notification. A `test_api_no_parse_mode_argument` test in
test_phase9_telegram_unit.py asserts this contract via inspect.signature().
"""

from typing import Any

import httpx

BASE_URL = "https://api.telegram.org/bot{token}"


async def get_me(
    token: str,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Verify token. Returns the result dict on success; raises httpx.HTTPStatusError on failure."""
    url = BASE_URL.format(token=token) + "/getMe"
    if client is not None:
        r = await client.get(url)
        r.raise_for_status()
        return r.json().get("result", {})
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.json().get("result", {})


async def send_message(
    token: str,
    chat_id: str,
    text: str,
    *,
    reply_markup: dict[str, Any] | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Send plain text. NO parse_mode parameter (Pitfall P3).

    Returns the message dict (incl. message_id) so callers can persist it for
    later edit_message_reply_markup / strip-buttons calls.
    """
    url = BASE_URL.format(token=token) + "/sendMessage"
    body: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        body["reply_markup"] = reply_markup
    if client is not None:
        r = await client.post(url, json=body)
        r.raise_for_status()
        return r.json().get("result", {})
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(url, json=body)
        r.raise_for_status()
        return r.json().get("result", {})


async def answer_callback_query(
    token: str,
    callback_query_id: str,
    text: str = "",
    *,
    client: httpx.AsyncClient | None = None,
) -> None:
    """Must be called within 15s of receiving a callback (Telegram contract)."""
    url = BASE_URL.format(token=token) + "/answerCallbackQuery"
    body = {"callback_query_id": callback_query_id, "text": text}
    if client is not None:
        r = await client.post(url, json=body)
        r.raise_for_status()
        return
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json=body)
        r.raise_for_status()


async def edit_message_reply_markup(
    token: str,
    chat_id: str,
    message_id: str,
    reply_markup: dict[str, Any] | None = None,
    *,
    client: httpx.AsyncClient | None = None,
) -> None:
    """Strip inline keyboard after answer recorded so user can't double-press."""
    url = BASE_URL.format(token=token) + "/editMessageReplyMarkup"
    body: dict[str, Any] = {"chat_id": chat_id, "message_id": message_id}
    if reply_markup is None:
        body["reply_markup"] = {}  # empty inline_keyboard — strips buttons
    else:
        body["reply_markup"] = reply_markup
    if client is not None:
        r = await client.post(url, json=body)
        r.raise_for_status()
        return
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(url, json=body)
        r.raise_for_status()


async def get_updates(
    token: str,
    offset: int,
    timeout: int = 25,
    *,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Long-poll for updates starting from offset. timeout=25 fits inside launchd cycle."""
    url = BASE_URL.format(token=token) + "/getUpdates"
    params = {"offset": int(offset), "timeout": int(timeout)}
    # client timeout MUST exceed long-poll timeout (httpx default 5s would
    # hang up before Telegram responds when the queue is empty).
    if client is not None:
        r = await client.get(url, params=params)
        r.raise_for_status()
        return r.json().get("result", [])
    async with httpx.AsyncClient(timeout=timeout + 5) as c:
        r = await c.get(url, params=params)
        r.raise_for_status()
        return r.json().get("result", [])
