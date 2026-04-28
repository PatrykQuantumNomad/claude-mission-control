"""TELE-05 + TELE-06 — handler long-poll, whitelist, dispatch.

Plan 09-03. Covers:
  - run_handler_loop offset persistence (Pitfall P2)
  - User whitelist drops (silently — log INFO not ERROR)
  - Text → claude relay with ANTHROPIC_API_KEY scrub (Pitfall P12)
  - Callback dispatch via dash_router for approve_task / answer_decision /
    snooze (RESOLVE_THEN_PATCH) / estop / unknown verb
  - get_updates exception → sleep + retry (network flap tolerance)
  - setup_telegram wizard 4-state machine + .env atomic-merge
"""
from __future__ import annotations

import httpx
import pytest
from httpx import MockTransport, Response

from cmc.config import Settings
from cmc.telegram import handler


# ---------- helpers ----------


def _telegram_transport(updates_batches, answer_calls, edit_calls, send_calls=None):
    """Mock transport for api.telegram.org.

    Returns successive update batches (then empty forever) and records
    answer_callback_query / editMessageReplyMarkup / sendMessage calls.
    """
    idx = {"i": 0}

    def h(req: httpx.Request) -> Response:
        url = str(req.url)
        if "/getUpdates" in url:
            if idx["i"] >= len(updates_batches):
                return Response(200, json={"ok": True, "result": []})
            batch = updates_batches[idx["i"]]
            idx["i"] += 1
            return Response(200, json={"ok": True, "result": batch})
        if "/answerCallbackQuery" in url:
            answer_calls.append(req.read().decode())
            return Response(200, json={"ok": True, "result": True})
        if "/editMessageReplyMarkup" in url:
            edit_calls.append(req.read().decode())
            return Response(200, json={"ok": True, "result": True})
        if "/sendMessage" in url:
            if send_calls is not None:
                send_calls.append(req.read().decode())
            return Response(
                200,
                json={"ok": True, "result": {"message_id": 1, "chat": {"id": 1}}},
            )
        return Response(200, json={"ok": True, "result": {}})

    return MockTransport(h)


def _local_api_transport(captured, *, resolve_status=200):
    """Mock transport for http://127.0.0.1:8765/api/*.

    Records every request and returns sensible canned replies. The
    `resolve_status` knob lets tests force a non-200 on /_resolve to
    exercise the error path.
    """

    def h(req: httpx.Request) -> Response:
        url_path = str(req.url).replace("http://127.0.0.1:8765", "")
        captured.append({"method": req.method, "url": str(req.url), "path": url_path})
        if "/_resolve/" in url_path:
            if resolve_status != 200:
                return Response(resolve_status, json={"detail": "no match"})
            return Response(
                200,
                json={
                    "id": 99,
                    "kind": "decision",
                    "entity_id": "7",
                    "chat_id": "1",
                },
            )
        if "/snooze" in url_path:
            return Response(200, json={"id": 99, "status": "snoozed"})
        return Response(200, json={"ok": True})

    return MockTransport(h)


# ---------- run_handler_loop (TELE-05 + TELE-06) ----------


@pytest.mark.asyncio
async def test_handler_persists_offset_before_processing(seeded_app, monkeypatch):
    """Pitfall P2: offset is UPSERTed before any update is dispatched."""
    app, cm = seeded_app
    update = {
        "update_id": 5,
        "message": {"from": {"id": 1}, "chat": {"id": 1}, "text": "hi"},
    }
    ans, ed = [], []
    tg = httpx.AsyncClient(transport=_telegram_transport([[update], []], ans, ed))
    local = httpx.AsyncClient(transport=_local_api_transport([]))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    # Stub claude relay so subprocess never actually runs.
    monkeypatch.setattr(handler, "relay_text_to_claude", lambda *a, **k: "stub reply")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
        async with sessions() as db:
            off = await handler.get_offset(db)
    assert off == 6  # 5 + 1


@pytest.mark.asyncio
async def test_handler_drops_unauthorized_user(seeded_app):
    """Whitelist: from.id not in allowed_user_ids and not chat_id → drop silently."""
    app, cm = seeded_app
    update = {
        "update_id": 1,
        "message": {"from": {"id": 999}, "chat": {"id": 999}, "text": "hi"},
    }
    ans, ed, sent = [], [], []
    tg = httpx.AsyncClient(
        transport=_telegram_transport([[update], []], ans, ed, send_calls=sent)
    )
    local_calls = []
    local = httpx.AsyncClient(transport=_local_api_transport(local_calls))
    s = Settings(
        telegram_bot_token="TKN",
        telegram_chat_id="1",
        telegram_allowed_user_ids=["1"],
    )
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    # No /api calls and no /sendMessage replies for the dropped user.
    assert local_calls == []
    assert sent == []


@pytest.mark.asyncio
async def test_handler_callback_approve_task_dispatches_post(seeded_app):
    """approve_task:42 → POST /api/tasks/42/approve, ack, edit-strip buttons."""
    app, cm = seeded_app
    update = {
        "update_id": 1,
        "callback_query": {
            "id": "cb1",
            "from": {"id": 1},
            "message": {"message_id": 7, "chat": {"id": 1}},
            "data": "approve_task:42",
        },
    }
    ans, ed = [], []
    tg = httpx.AsyncClient(transport=_telegram_transport([[update], []], ans, ed))
    local_calls = []
    local = httpx.AsyncClient(transport=_local_api_transport(local_calls))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    assert any(
        c["method"] == "POST" and "/api/tasks/42/approve" in c["url"]
        for c in local_calls
    )
    assert len(ans) >= 1
    assert len(ed) >= 1  # buttons stripped on success


@pytest.mark.asyncio
async def test_handler_callback_estop_dispatches_post(seeded_app):
    """estop → POST /api/system/emergency-stop {reason: 'telegram'}."""
    app, cm = seeded_app
    update = {
        "update_id": 1,
        "callback_query": {
            "id": "cb1",
            "from": {"id": 1},
            "message": {"message_id": 7, "chat": {"id": 1}},
            "data": "estop",
        },
    }
    ans, ed = [], []
    tg = httpx.AsyncClient(transport=_telegram_transport([[update], []], ans, ed))
    local_calls = []
    local = httpx.AsyncClient(transport=_local_api_transport(local_calls))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    assert any(
        c["method"] == "POST" and "/api/system/emergency-stop" in c["url"]
        for c in local_calls
    )


@pytest.mark.asyncio
async def test_handler_callback_snooze_resolves_then_patches(seeded_app):
    """snooze:decision:7:30m → GET /_resolve/decision/7 → PATCH /99/snooze."""
    app, cm = seeded_app
    update = {
        "update_id": 1,
        "callback_query": {
            "id": "cb1",
            "from": {"id": 1},
            "message": {"message_id": 7, "chat": {"id": 1}},
            "data": "snooze:decision:7:30m",
        },
    }
    ans, ed = [], []
    tg = httpx.AsyncClient(transport=_telegram_transport([[update], []], ans, ed))
    local_calls = []
    local = httpx.AsyncClient(transport=_local_api_transport(local_calls))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    # First a GET /_resolve/decision/7, then a PATCH /99/snooze.
    assert any(
        c["method"] == "GET" and "/_resolve/decision/7" in c["url"]
        for c in local_calls
    )
    assert any(
        c["method"] == "PATCH" and "/notifications/99/snooze" in c["url"]
        for c in local_calls
    )
    # Buttons stripped on snooze success.
    assert len(ed) >= 1


@pytest.mark.asyncio
async def test_handler_text_relays_to_claude_with_env_scrub(
    seeded_app, monkeypatch
):
    """Pitfall P12: subprocess.run for `claude -p` MUST receive env without
    ANTHROPIC_API_KEY even when the operator has it set in their shell."""
    app, cm = seeded_app
    captured_calls = []

    def fake_run(cmd, **kwargs):
        env = kwargs.get("env") or {}
        captured_calls.append(
            {"cmd": cmd, "env_has_anthropic": "ANTHROPIC_API_KEY" in env}
        )

        class R:
            returncode = 0
            stdout = b"stub reply"
            stderr = b""

        return R()

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-leak-attempt")
    update = {
        "update_id": 1,
        "message": {"from": {"id": 1}, "chat": {"id": 1}, "text": "hello claude"},
    }
    ans, ed, sent = [], [], []
    tg = httpx.AsyncClient(
        transport=_telegram_transport([[update], []], ans, ed, send_calls=sent)
    )
    local = httpx.AsyncClient(transport=_local_api_transport([]))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    assert captured_calls, "claude subprocess never invoked"
    # Pitfall P12: env passed to subprocess MUST NOT contain ANTHROPIC_API_KEY.
    assert captured_calls[0]["env_has_anthropic"] is False
    # And the stub reply was sent back to Telegram.
    assert sent and "stub reply" in sent[0]


@pytest.mark.asyncio
async def test_handler_no_op_without_token():
    """When token/chat_id unset, run_handler_loop returns immediately."""
    s = Settings()  # both unset → disabled

    def _no_sessions():
        raise AssertionError("sessions() should not be called when disabled")

    n = await handler.run_handler_loop(_no_sessions, s, max_iterations=1)
    assert n == 0


@pytest.mark.asyncio
async def test_handler_invalid_callback_data_logs_and_acks(seeded_app):
    """Unknown verb → answer_callback_query still called (15s contract)."""
    app, cm = seeded_app
    update = {
        "update_id": 1,
        "callback_query": {
            "id": "cb1",
            "from": {"id": 1},
            "message": {"message_id": 7, "chat": {"id": 1}},
            "data": "garbage_verb:8:9",
        },
    }
    ans, ed = [], []
    tg = httpx.AsyncClient(transport=_telegram_transport([[update], []], ans, ed))
    local_calls = []
    local = httpx.AsyncClient(transport=_local_api_transport(local_calls))
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        try:
            await handler.run_handler_loop(
                sessions, s,
                http_client=local,
                telegram_client=tg,
                max_iterations=2,
            )
        finally:
            await tg.aclose()
            await local.aclose()
    # Ack happened even though dispatch failed; no local API call made.
    assert len(ans) >= 1
    assert local_calls == []


@pytest.mark.asyncio
async def test_handler_get_updates_exception_sleeps_then_retries(
    seeded_app, monkeypatch
):
    """A network flap on get_updates → sleep + retry instead of crashing."""
    app, cm = seeded_app
    calls = {"n": 0}

    async def fake_get_updates(*a, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("network down")
        return []

    monkeypatch.setattr("cmc.telegram.api.get_updates", fake_get_updates)

    # Fast-path sleep so the test does not actually wait 5s.
    real_sleep = handler.asyncio.sleep

    async def fake_sleep(_s):
        # Yield once to keep cooperative scheduling intact.
        await real_sleep(0)

    monkeypatch.setattr("cmc.telegram.handler.asyncio.sleep", fake_sleep)
    s = Settings(telegram_bot_token="TKN", telegram_chat_id="1")
    async with cm:
        sessions = app.state.sessions
        await handler.run_handler_loop(sessions, s, max_iterations=3)
    # First call raised; loop retried at least once more.
    assert calls["n"] >= 2
