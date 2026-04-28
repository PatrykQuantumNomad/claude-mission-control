"""Phase 9 unit tests — telegram primitives, plist render, notifications router.

Convention note: subsequent Phase 9 plans add their own per-concern files
(test_phase9_notifier.py, test_phase9_handler.py, test_phase9_setup.py)
rather than appending here. Plan boundaries are larger this phase, so
co-locating tests with their plan owner keeps merge surface clean.
"""
from __future__ import annotations

import json

import httpx
import pytest
from httpx import MockTransport, Response

from cmc.telegram import api, dash_router, messages


# ---------- api.py ----------


def test_api_no_parse_mode_argument():
    """Pitfall P3: send_message MUST NOT accept parse_mode — grep gate."""
    import inspect

    sig = inspect.signature(api.send_message)
    assert "parse_mode" not in sig.parameters


@pytest.mark.asyncio
async def test_send_message_posts_plain_text():
    captured: dict = {}

    def handler(req: httpx.Request) -> Response:
        captured["url"] = str(req.url)
        captured["json"] = json.loads(req.content) if req.content else None
        return Response(
            200,
            json={"ok": True, "result": {"message_id": 99, "chat": {"id": 1}}},
        )

    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        res = await api.send_message("TKN", "1", "hello", client=client)
    assert res["message_id"] == 99
    assert "/botTKN/sendMessage" in captured["url"]
    assert "parse_mode" not in (captured["json"] or {})
    assert captured["json"]["text"] == "hello"
    assert captured["json"]["chat_id"] == "1"


@pytest.mark.asyncio
async def test_send_message_includes_reply_markup_when_provided():
    captured: dict = {}

    def handler(req: httpx.Request) -> Response:
        captured["json"] = json.loads(req.content) if req.content else None
        return Response(200, json={"ok": True, "result": {"message_id": 1}})

    kb = {"inline_keyboard": [[{"text": "Yes", "callback_data": "y"}]]}
    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        await api.send_message("TKN", "1", "hi", reply_markup=kb, client=client)
    assert captured["json"]["reply_markup"] == kb


@pytest.mark.asyncio
async def test_get_me_returns_result():
    def handler(req: httpx.Request) -> Response:
        return Response(200, json={"ok": True, "result": {"username": "mc_bot"}})

    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        res = await api.get_me("TKN", client=client)
    assert res["username"] == "mc_bot"


@pytest.mark.asyncio
async def test_get_updates_returns_list():
    def handler(req: httpx.Request) -> Response:
        return Response(
            200,
            json={
                "ok": True,
                "result": [{"update_id": 1, "message": {"text": "hi"}}],
            },
        )

    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        res = await api.get_updates("TKN", offset=0, timeout=1, client=client)
    assert len(res) == 1
    assert res[0]["update_id"] == 1


@pytest.mark.asyncio
async def test_answer_callback_query_posts_id():
    captured: dict = {}

    def handler(req: httpx.Request) -> Response:
        captured["url"] = str(req.url)
        captured["json"] = json.loads(req.content) if req.content else None
        return Response(200, json={"ok": True, "result": True})

    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        await api.answer_callback_query("TKN", "cbq-1", "ok", client=client)
    assert "/botTKN/answerCallbackQuery" in captured["url"]
    assert captured["json"] == {"callback_query_id": "cbq-1", "text": "ok"}


@pytest.mark.asyncio
async def test_edit_message_reply_markup_strips_buttons_by_default():
    captured: dict = {}

    def handler(req: httpx.Request) -> Response:
        captured["json"] = json.loads(req.content) if req.content else None
        return Response(200, json={"ok": True, "result": True})

    async with httpx.AsyncClient(transport=MockTransport(handler)) as client:
        await api.edit_message_reply_markup("TKN", "1", "99", client=client)
    # Empty dict = strip buttons
    assert captured["json"]["reply_markup"] == {}


# ---------- messages.py ----------


def test_format_decision_returns_plain_text_and_kb():
    class D:
        id = 7
        prompt = "Continue?"
        session_id = "abc"

    text, kb = messages.format_decision(D())
    assert "❓" in text
    # Plain text — no MarkdownV2 escapes
    assert "\\" not in text
    assert "Continue?" in text
    assert kb["inline_keyboard"][0][0]["callback_data"] == "answer_decision:7:yes"
    assert kb["inline_keyboard"][0][1]["callback_data"] == "answer_decision:7:no"
    assert kb["inline_keyboard"][1][0]["callback_data"] == "snooze:decision:7:30m"


def test_format_failure_truncates_long_error():
    class T:
        id = 9
        title = "fail"
        error_message = "x" * 1000

    text, kb = messages.format_failure(T())
    # Sliced at 500 in the formatter
    assert text.count("x") == 500
    assert kb["inline_keyboard"][0][0]["callback_data"] == "rerun_task:9"


def test_format_overdue_includes_cron():
    class S:
        id = 3
        name = "nightly"
        cron = "0 9 * * *"

    text, kb = messages.format_overdue(S())
    assert "nightly" in text
    assert "0 9 * * *" in text
    assert kb["inline_keyboard"][0][0]["callback_data"] == "snooze:overdue_schedule:3:30m"


def test_format_test_returns_no_keyboard():
    text, kb = messages.format_test()
    assert "Mission Control" in text
    assert kb is None


# ---------- dash_router.py ----------


def test_decode_callback_simple():
    v, a = dash_router.decode_callback("approve_task:42")
    assert v == "approve_task"
    assert a == ["42"]


def test_decode_callback_compound():
    v, a = dash_router.decode_callback("snooze:overdue_schedule:7:30m")
    assert v == "snooze"
    assert a == ["overdue_schedule", "7", "30m"]


def test_decode_callback_no_args():
    v, a = dash_router.decode_callback("estop")
    assert v == "estop"
    assert a == []


def test_decode_callback_empty_raises():
    with pytest.raises(dash_router.CallbackParseError):
        dash_router.decode_callback("")


def test_route_approve_task():
    method, path, body = dash_router.route("approve_task", ["42"])
    assert (method, path) == ("POST", "/api/tasks/42/approve")
    assert body == {}


def test_route_answer_decision():
    method, path, body = dash_router.route("answer_decision", ["7", "yes"])
    assert (method, path) == ("POST", "/api/decisions/7/answer")
    assert body == {"answer": "yes"}


def test_route_estop():
    method, path, body = dash_router.route("estop", [])
    assert (method, path) == ("POST", "/api/system/emergency-stop")
    assert body == {"reason": "telegram"}


def test_route_unknown_verb_raises():
    with pytest.raises(dash_router.CallbackParseError):
        dash_router.route("delete_universe", [])


def test_route_snooze_resolves_first():
    method, path, body = dash_router.route(
        "snooze", ["overdue_schedule", "7", "30m"]
    )
    assert method == "RESOLVE_THEN_PATCH"
    assert path == "/api/notifications/_resolve/overdue_schedule/7"
    assert body == {"duration": "30m"}


def test_route_reply_inbox_is_noop():
    method, path, body = dash_router.route("reply_inbox", ["12"])
    assert method == "NOOP"
    assert path == "/api/inbox/12"


# ---------- plist_render.py ----------


def test_plist_render_notifier_substitutes_paths(tmp_path):
    """Use tmp_path so Path.resolve() doesn't follow real symlinks (e.g.
    /opt/homebrew/bin/python3.13 -> Cellar/...) which would defeat the
    substring assertion. Mirrors Phase 8 dispatcher render_plist tests.
    """
    from cmc.telegram.plist_render import render_plist

    py = tmp_path / "venv" / "bin" / "python"
    py.parent.mkdir(parents=True)
    py.write_text("")
    repo = tmp_path / "repo"
    repo.mkdir()

    out = render_plist("notifier", py, repo)
    assert str(py.resolve()) in out
    assert "<integer>30</integer>" in out
    assert "com.cmc.telegram-notifier" in out
    assert str(repo.resolve()) in out
    # python_path_dir derived correctly: appears in PATH override
    assert f"{py.parent.resolve()}:/usr/bin:/bin" in out


def test_plist_render_handler_has_keep_alive(tmp_path):
    from cmc.telegram.plist_render import render_plist

    py = tmp_path / "venv" / "bin" / "python"
    py.parent.mkdir(parents=True)
    py.write_text("")
    repo = tmp_path / "repo"
    repo.mkdir()

    out = render_plist("handler", py, repo)
    assert "<key>KeepAlive</key>" in out
    assert "<true/>" in out
    assert "com.cmc.telegram-handler" in out
    # No StartInterval on long-running daemon
    assert "<key>StartInterval</key>" not in out
    # ThrottleInterval prevents thrash on KeepAlive=true
    assert "<key>ThrottleInterval</key>" in out


def test_plist_render_unknown_variant_raises():
    from cmc.telegram.plist_render import render_plist

    with pytest.raises(ValueError):
        render_plist("invalid", "/x", "/y")


def test_plist_render_well_formed_xml(tmp_path):
    """Both variants must produce parseable XML."""
    import xml.etree.ElementTree as ET

    from cmc.telegram.plist_render import render_plist

    py = tmp_path / "py"
    py.write_text("")
    for variant in ("notifier", "handler"):
        out = render_plist(variant, py, tmp_path)
        # Must not throw — the <plist version="1.0"> root must be well-formed.
        ET.fromstring(out)


def test_plist_render_no_secrets_in_environment(tmp_path):
    """Pitfall mirror of Phase 8 dispatcher: TELEGRAM_BOT_TOKEN must not be
    baked into the plist. install.sh writes it to ~/.command-centre/.env
    instead."""
    from cmc.telegram.plist_render import render_plist

    py = tmp_path / "py"
    py.write_text("")
    for variant in ("notifier", "handler"):
        out = render_plist(variant, py, tmp_path)
        assert "TELEGRAM_BOT_TOKEN" not in out
        assert "ANTHROPIC_API_KEY" not in out


# ---------- notifications router ----------


@pytest.mark.asyncio
async def test_notifications_list_orders_by_sent_at_desc(client, seeded_app):
    from datetime import datetime, timedelta, timezone

    from cmc.db.models.notification_log import NotificationLog

    app, _cm = seeded_app
    sessions = app.state.sessions
    async with sessions() as db:
        db.add(
            NotificationLog(
                kind="decision",
                entity_id="1",
                chat_id="999",
                sent_at=datetime.now(timezone.utc) - timedelta(minutes=5),
                status="sent",
            )
        )
        db.add(
            NotificationLog(
                kind="failure",
                entity_id="2",
                chat_id="999",
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
        )
        await db.commit()
    r = await client.get("/api/notifications")
    assert r.status_code == 200
    rows = r.json()["notifications"]
    assert len(rows) == 2
    assert rows[0]["entity_id"] == "2"  # newest first


@pytest.mark.asyncio
async def test_notifications_list_filters_by_kind(client, seeded_app):
    from datetime import datetime, timezone

    from cmc.db.models.notification_log import NotificationLog

    app, _cm = seeded_app
    sessions = app.state.sessions
    async with sessions() as db:
        db.add(
            NotificationLog(
                kind="decision",
                entity_id="11",
                chat_id="999",
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
        )
        db.add(
            NotificationLog(
                kind="failure",
                entity_id="22",
                chat_id="999",
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
        )
        await db.commit()
    r = await client.get("/api/notifications?kind=failure")
    assert r.status_code == 200
    rows = r.json()["notifications"]
    assert len(rows) == 1
    assert rows[0]["kind"] == "failure"


@pytest.mark.asyncio
async def test_snooze_sets_snoozed_until(client, seeded_app):
    from datetime import datetime, timezone

    from cmc.db.models.notification_log import NotificationLog

    app, _cm = seeded_app
    sessions = app.state.sessions
    async with sessions() as db:
        row = NotificationLog(
            kind="decision",
            entity_id="42",
            chat_id="999",
            sent_at=datetime.now(timezone.utc),
            status="sent",
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        nid = row.id
    r = await client.patch(f"/api/notifications/{nid}/snooze?duration=30m")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "snoozed"
    assert body["snoozed_until"] is not None


@pytest.mark.asyncio
async def test_snooze_invalid_duration_400(client):
    r = await client.patch("/api/notifications/1/snooze?duration=2y")
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_snooze_unknown_id_404(client):
    r = await client.patch("/api/notifications/99999/snooze?duration=30m")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_resolve_returns_id(client, seeded_app):
    from datetime import datetime, timezone

    from cmc.db.models.notification_log import NotificationLog

    app, _cm = seeded_app
    sessions = app.state.sessions
    async with sessions() as db:
        row = NotificationLog(
            kind="overdue_schedule",
            entity_id="7",
            chat_id="999",
            sent_at=datetime.now(timezone.utc),
            status="sent",
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
        nid = row.id
    r = await client.get(
        "/api/notifications/_resolve/overdue_schedule/7?chat_id=999"
    )
    assert r.status_code == 200
    assert r.json()["id"] == nid


@pytest.mark.asyncio
async def test_resolve_no_match_404(client):
    r = await client.get("/api/notifications/_resolve/decision/no-such-id")
    assert r.status_code == 404
