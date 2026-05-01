"""HITL router tests — HITL-01..07.

All HITL-* tests live here. Tests below cover decisions and inbox endpoints.

Pitfall awareness:
  - r.json()["error"] (NOT "detail") — the error handler emits {error: ...}.
  - tz-aware UTC datetimes when seeding (Pitfall 4).
  - HITL-03 / HITL-07 file-then-DB ordering: file write FIRST, then DB UPDATE.
  - Queue paths under repo_root() / .tmp/mission-control-queue/{decisions,inbox}/{id}.jsonl
    are .gitignore'd; tests clean up to avoid leakage between runs.
"""

import json
from datetime import UTC, datetime, timedelta

import pytest

from cmc.api.schemas.hitl import DecisionCreate, InboxReplyRequest
from cmc.core.paths import repo_root
from cmc.db.models.decisions import Decision
from cmc.db.models.inbox import InboxMessage

from .conftest import make_decision_row, make_inbox_row

# ---------- Schema smoke ----------


def test_hitl_schemas_smoke():
    d = DecisionCreate(dedup_key="dk-1", prompt="test")
    assert d.dedup_key == "dk-1"
    r = InboxReplyRequest(reply="yes")
    assert r.reply == "yes"


# ---------- Helpers ----------


async def _seed_decision(client_fixture, **overrides) -> int:
    """Insert a Decision row via the app's sessionmaker; return the new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_decision_row(**overrides)
    async with sessionmaker() as db:
        d = Decision(**row)
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return d.id


async def _seed_inbox(client_fixture, **overrides) -> int:
    """Insert an InboxMessage row via the app's sessionmaker; return the new id."""
    sessionmaker = client_fixture._transport.app.state.sessions
    row = make_inbox_row(**overrides)
    async with sessionmaker() as db:
        m = InboxMessage(**row)
        db.add(m)
        await db.commit()
        await db.refresh(m)
        return m.id


def _decisions_queue_file(decision_id: int):
    return (
        repo_root() / ".tmp" / "mission-control-queue" / "decisions"
        / f"{decision_id}.jsonl"
    )


def _inbox_queue_file(inbox_id: int):
    return (
        repo_root() / ".tmp" / "mission-control-queue" / "inbox"
        / f"{inbox_id}.jsonl"
    )


# ---------- HITL-01: GET /api/decisions ----------


@pytest.mark.asyncio
async def test_hitl01_list_default_returns_all_statuses(client) -> None:
    """No filter -> both pending and answered rows returned."""
    await _seed_decision(client, dedup_key="dk-pending", status="pending")
    await _seed_decision(
        client,
        dedup_key="dk-answered",
        status="answered",
        answer="yes",
        answered_at=datetime.now(UTC),
        answered_by="dashboard",
    )

    r = await client.get("/api/decisions")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_hitl01_list_filtered_pending(client) -> None:
    await _seed_decision(client, dedup_key="dk-p", status="pending")
    await _seed_decision(
        client,
        dedup_key="dk-a",
        status="answered",
        answer="yes",
        answered_at=datetime.now(UTC),
        answered_by="dashboard",
    )

    r = await client.get("/api/decisions?status=pending")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "pending"
    assert body["items"][0]["dedup_key"] == "dk-p"


@pytest.mark.asyncio
async def test_hitl01_list_filtered_answered(client) -> None:
    await _seed_decision(client, dedup_key="dk-p", status="pending")
    await _seed_decision(
        client,
        dedup_key="dk-a",
        status="answered",
        answer="yes",
        answered_at=datetime.now(UTC),
        answered_by="dashboard",
    )

    r = await client.get("/api/decisions?status=answered")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["status"] == "answered"
    assert body["items"][0]["dedup_key"] == "dk-a"


# ---------- HITL-02: POST /api/decisions ----------


@pytest.mark.asyncio
async def test_hitl02_create_returns_201(client) -> None:
    payload = {
        "dedup_key": "dk-new",
        "prompt": "approve deploy?",
        "options": ["yes", "no"],
    }
    r = await client.post("/api/decisions", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["dedup_key"] == "dk-new"
    assert body["prompt"] == "approve deploy?"
    assert body["options"] == ["yes", "no"]
    assert isinstance(body["id"], int)

    # Verify in DB
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (
            (await db.execute(_sel(Decision).where(Decision.dedup_key == "dk-new")))
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].status == "pending"


@pytest.mark.asyncio
async def test_hitl02_create_duplicate_pending_returns_existing(client) -> None:
    """INSERT OR IGNORE: re-POST same dedup_key while pending -> 200 + same id."""
    payload = {
        "dedup_key": "dk-dup",
        "prompt": "dup test",
        "options": [],
    }
    r1 = await client.post("/api/decisions", json=payload)
    assert r1.status_code == 201, r1.text
    first_id = r1.json()["id"]

    r2 = await client.post("/api/decisions", json=payload)
    # Conflict path returns 200 (NOT 201) — "already exists, here's the existing row"
    assert r2.status_code == 200, r2.text
    assert r2.json()["id"] == first_id

    # Verify: only ONE row in DB with this dedup_key
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (
            (await db.execute(_sel(Decision).where(Decision.dedup_key == "dk-dup")))
            .scalars()
            .all()
        )
        assert len(rows) == 1


@pytest.mark.asyncio
async def test_hitl02_create_after_answer_creates_new_row(client) -> None:
    """Partial-unique scope = pending only — once answered, same dedup_key can re-insert."""
    payload = {
        "dedup_key": "dk-recycle",
        "prompt": "recycle test",
        "options": [],
    }
    r1 = await client.post("/api/decisions", json=payload)
    assert r1.status_code == 201, r1.text
    first_id = r1.json()["id"]

    # Answer it
    r_ans = await client.post(
        f"/api/decisions/{first_id}/answer",
        json={"answer": "yes", "answered_by": "dashboard"},
    )
    assert r_ans.status_code == 200, r_ans.text
    # cleanup queue file from this answer
    qf = _decisions_queue_file(first_id)
    if qf.exists():
        qf.unlink()

    # POST again with same dedup_key — should create a NEW pending row
    r2 = await client.post("/api/decisions", json=payload)
    assert r2.status_code == 201, r2.text
    second_id = r2.json()["id"]
    assert second_id != first_id

    # Verify: TWO rows in DB with same dedup_key (one answered, one pending)
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (await db.execute(
            _sel(Decision).where(Decision.dedup_key == "dk-recycle")
        )).scalars().all()
        assert len(rows) == 2
        statuses = sorted(r.status for r in rows)
        assert statuses == ["answered", "pending"]


# ---------- HITL-03: POST /api/decisions/{id}/answer ----------


@pytest.mark.asyncio
async def test_hitl03_answer_writes_queue_file_first_then_updates_db(client) -> None:
    decision_id = await _seed_decision(client, dedup_key="dk-ans", status="pending")
    qf = _decisions_queue_file(decision_id)
    if qf.exists():
        qf.unlink()

    try:
        r = await client.post(
            f"/api/decisions/{decision_id}/answer",
            json={"answer": "yes", "answered_by": "dashboard"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["answered"] is True
        assert body["decision_id"] == decision_id
        assert body["queue_path"].endswith(
            f".tmp/mission-control-queue/decisions/{decision_id}.jsonl"
        )

        # (a) queue file exists and has 1 record
        assert qf.exists()
        lines = qf.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec["decision_id"] == decision_id
        assert rec["answer"] == "yes"
        assert rec["answered_by"] == "dashboard"
        assert "ts" in rec
        # ISO-8601 sanity check
        datetime.fromisoformat(rec["ts"])

        # (b) DB row updated
        sessionmaker = client._transport.app.state.sessions
        from sqlalchemy import select as _sel
        async with sessionmaker() as db:
            row = (await db.execute(
                _sel(Decision).where(Decision.id == decision_id)
            )).scalar_one()
            assert row.status == "answered"
            assert row.answer == "yes"
            assert row.answered_by == "dashboard"
            assert row.answered_at is not None
    finally:
        if qf.exists():
            qf.unlink()


@pytest.mark.asyncio
async def test_hitl03_answer_404_when_decision_missing(client) -> None:
    r = await client.post(
        "/api/decisions/999999/answer",
        json={"answer": "yes", "answered_by": "dashboard"},
    )
    assert r.status_code == 404
    assert r.json()["error"] == "decision not found"


@pytest.mark.asyncio
async def test_hitl03_answer_409_when_already_answered(client) -> None:
    decision_id = await _seed_decision(
        client,
        dedup_key="dk-already",
        status="answered",
        answer="yes",
        answered_at=datetime.now(UTC),
        answered_by="dashboard",
    )
    qf = _decisions_queue_file(decision_id)
    pre_existed = qf.exists()

    r = await client.post(
        f"/api/decisions/{decision_id}/answer",
        json={"answer": "no", "answered_by": "dashboard"},
    )
    assert r.status_code == 409
    assert r.json()["error"] == "decision already answered"

    # No queue file should be written from this call (if file pre-existed, leave it).
    if not pre_existed and qf.exists():
        qf.unlink()
        pytest.fail("409 path wrote a queue file — file-then-DB invariant violated")


# ---------- HITL-04: GET /api/inbox ----------


@pytest.mark.asyncio
async def test_hitl04_inbox_list_default(client) -> None:
    await _seed_inbox(client, body="msg-read", read=True, read_at=datetime.now(UTC))
    await _seed_inbox(client, body="msg-unread", read=False)

    r = await client.get("/api/inbox")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2


@pytest.mark.asyncio
async def test_hitl04_inbox_list_unread_filter(client) -> None:
    await _seed_inbox(client, body="msg-read", read=True, read_at=datetime.now(UTC))
    await _seed_inbox(client, body="msg-unread", read=False)

    r = await client.get("/api/inbox?unread=true")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["read"] is False
    assert body["items"][0]["body"] == "msg-unread"


@pytest.mark.asyncio
async def test_hitl04_inbox_list_max_age_days(client) -> None:
    """?max_age_days=5 returns only messages newer than 5 days."""
    sessionmaker = client._transport.app.state.sessions
    old_row = make_inbox_row(body="old-msg")
    old_row["created_at"] = datetime.now(UTC) - timedelta(days=10)
    new_row = make_inbox_row(body="new-msg")  # default created_at = now
    async with sessionmaker() as db:
        db.add(InboxMessage(**old_row))
        db.add(InboxMessage(**new_row))
        await db.commit()

    r = await client.get("/api/inbox?max_age_days=5")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["body"] == "new-msg"


# ---------- HITL-05: POST /api/inbox ----------


@pytest.mark.asyncio
async def test_hitl05_create_inbox(client) -> None:
    payload = {
        "subject": "Heads up",
        "body": "agent finished step 3",
    }
    r = await client.post("/api/inbox", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["subject"] == "Heads up"
    assert body["body"] == "agent finished step 3"
    assert body["read"] is False
    assert body["reply"] is None
    assert isinstance(body["id"], int)

    # Verify in DB
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        rows = (
            (await db.execute(_sel(InboxMessage).where(InboxMessage.id == body["id"])))
            .scalars()
            .all()
        )
        assert len(rows) == 1


# ---------- HITL-06: POST /api/inbox/{id}/read ----------


@pytest.mark.asyncio
async def test_hitl06_mark_read(client) -> None:
    inbox_id = await _seed_inbox(client, body="unread-msg", read=False)

    r = await client.post(f"/api/inbox/{inbox_id}/read")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == inbox_id
    assert body["read"] is True
    assert body["read_at"] is not None

    # DB row updated
    sessionmaker = client._transport.app.state.sessions
    from sqlalchemy import select as _sel
    async with sessionmaker() as db:
        row = (await db.execute(
            _sel(InboxMessage).where(InboxMessage.id == inbox_id)
        )).scalar_one()
        assert row.read is True
        assert row.read_at is not None
        first_read_at_db = row.read_at  # source of truth (DB row)

    # Idempotency: second call returns the SAME read_at instant (no DB write).
    # Compare DB-side rather than JSON-side because SQLite strips tzinfo on
    # round-trip (Pitfall 4) — the first response was serialized from the
    # in-memory aware datetime, the second from the round-tripped naive one,
    # so JSON strings differ in the trailing 'Z'/'+00:00' but represent the
    # same instant. The invariant under test is "no second DB write."
    r2 = await client.post(f"/api/inbox/{inbox_id}/read")
    assert r2.status_code == 200, r2.text
    async with sessionmaker() as db:
        row2 = (await db.execute(
            _sel(InboxMessage).where(InboxMessage.id == inbox_id)
        )).scalar_one()
        assert row2.read_at == first_read_at_db


@pytest.mark.asyncio
async def test_hitl06_mark_read_404(client) -> None:
    r = await client.post("/api/inbox/999999/read")
    assert r.status_code == 404
    assert r.json()["error"] == "inbox message not found"


# ---------- HITL-07: POST /api/inbox/{id}/reply ----------


@pytest.mark.asyncio
async def test_hitl07_reply_writes_queue_file_first_then_updates_db(client) -> None:
    inbox_id = await _seed_inbox(client, body="needs-reply", read=False)
    qf = _inbox_queue_file(inbox_id)
    if qf.exists():
        qf.unlink()

    try:
        r = await client.post(
            f"/api/inbox/{inbox_id}/reply",
            json={"reply": "got it"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["replied"] is True
        assert body["inbox_id"] == inbox_id
        assert body["queue_path"].endswith(
            f".tmp/mission-control-queue/inbox/{inbox_id}.jsonl"
        )

        # (a) queue file exists with 1 record
        assert qf.exists()
        lines = qf.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 1
        rec = json.loads(lines[0])
        assert rec["inbox_id"] == inbox_id
        assert rec["reply"] == "got it"
        assert "ts" in rec

        # (b) DB row updated
        sessionmaker = client._transport.app.state.sessions
        from sqlalchemy import select as _sel
        async with sessionmaker() as db:
            row = (await db.execute(
                _sel(InboxMessage).where(InboxMessage.id == inbox_id)
            )).scalar_one()
            assert row.reply == "got it"
            assert row.replied_at is not None
    finally:
        if qf.exists():
            qf.unlink()


@pytest.mark.asyncio
async def test_hitl07_reply_404(client) -> None:
    r = await client.post(
        "/api/inbox/999999/reply",
        json={"reply": "hi"},
    )
    assert r.status_code == 404
    assert r.json()["error"] == "inbox message not found"
