"""Phase 15 Plan 02 — /api/alerts CRUD + events router tests.

Coverage:
  - GET    /api/alerts/rules                 — list (empty + paginated)
  - POST   /api/alerts/rules                 — create + 422 validators
  - PATCH  /api/alerts/rules/{rule_id}       — partial update + state-clear policy
  - DELETE /api/alerts/rules/{rule_id}       — cascade alert_state cleanup
  - GET    /api/alerts/events?range=         — alert decisions history
  - POST   /api/alerts/_ack                  — scope_hash → acked_until=now+1h

Pitfalls covered:
  - Error handler emits {error: ...} (NOT FastAPI default {detail: ...}) —
    422s from validators DO go through Pydantic's chain so they retain
    {detail: [...]} shape; we accept either by reading r.json() flexibly.
  - PATCH state-clear (D-02): only threshold-shaped fields clear alert_state;
    enabled/name/params_json preserve.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from cmc.api.schemas.alerts import AlertRuleCreate
from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision

# --------------------------------------------------------------------------
# Helpers — inline factory + DB peek.
# --------------------------------------------------------------------------


def _valid_threshold_payload(**overrides) -> dict:
    body = {
        "name": "test-rule",
        "kind": "threshold",
        "metric": "cost_usd_24h",
        "threshold_fire": 10.0,
        "threshold_clear": 5.0,
        "min_dwell_seconds": 0,
        "min_samples": 1,
        "cooldown_seconds": 0,
        "enabled": True,
        "spec_version": 1,
        "params_json": {},
    }
    body.update(overrides)
    return body


async def _post_rule(client, **overrides):
    payload = _valid_threshold_payload(**overrides)
    return await client.post("/api/alerts/rules", json=payload)


async def _seed_state(
    client,
    rule_id: int,
    scope_key: str = "model:foo",
    last_value: float | None = None,
) -> int:
    """Insert an AlertState row directly via the app's sessionmaker."""
    sm = client._transport.app.state.sessions
    async with sm() as db:
        s = AlertState(
            rule_id=rule_id,
            scope_key=scope_key,
            state="firing",
            last_value=last_value,
        )
        db.add(s)
        await db.commit()
        await db.refresh(s)
        return s.id


async def _count_states(client, rule_id: int) -> int:
    sm = client._transport.app.state.sessions
    from sqlalchemy import func

    async with sm() as db:
        return (
            await db.execute(
                select(func.count(AlertState.id)).where(
                    AlertState.rule_id == rule_id
                )
            )
        ).scalar_one()


async def _seed_alert_decision(
    client, rule_id: int, scope_key: str = "<global>", status: str = "pending"
) -> int:
    sm = client._transport.app.state.sessions
    async with sm() as db:
        d = Decision(
            dedup_key=f"alert:{rule_id}:{scope_key}",
            prompt=f"alert {rule_id}",
            options=[],
            status=status,
            answered_by="alert_engine" if status == "answered" else None,
            created_at=datetime.now(UTC),
        )
        db.add(d)
        await db.commit()
        await db.refresh(d)
        return d.id


# --------------------------------------------------------------------------
# (a) List empty.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_rules_empty(client) -> None:
    r = await client.get("/api/alerts/rules")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0


# --------------------------------------------------------------------------
# (b) Create valid threshold.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rule_valid_threshold(client) -> None:
    r = await _post_rule(client, name="cost-spike", metric="cost_usd_24h")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "cost-spike"
    assert body["kind"] == "threshold"
    assert body["metric"] == "cost_usd_24h"
    assert body["threshold_fire"] == 10.0
    assert body["threshold_clear"] == 5.0
    assert isinstance(body["rule_id"], int) and body["rule_id"] >= 1


# --------------------------------------------------------------------------
# (c) Unknown metric → 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rule_unknown_metric_422(client) -> None:
    r = await _post_rule(client, metric="nonexistent_metric_foo")
    assert r.status_code == 422, r.text
    txt = r.text.lower()
    assert "unknown metric" in txt or "nonexistent_metric_foo" in txt


# --------------------------------------------------------------------------
# (d) threshold without fire → 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rule_threshold_without_fire_422(client) -> None:
    r = await _post_rule(client, threshold_fire=None, threshold_clear=None)
    assert r.status_code == 422, r.text
    assert "threshold_fire" in r.text.lower()


# --------------------------------------------------------------------------
# (e) threshold_clear >= threshold_fire → 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rule_clear_above_fire_422(client) -> None:
    r = await _post_rule(client, threshold_fire=5.0, threshold_clear=10.0)
    assert r.status_code == 422, r.text
    assert "threshold_clear" in r.text.lower()


# --------------------------------------------------------------------------
# (f) Anomaly rule.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_rule_anomaly_valid(client) -> None:
    r = await _post_rule(
        client,
        kind="anomaly",
        metric="cost_usd_24h",
        threshold_fire=3.0,
        threshold_clear=None,
        min_samples=10,
        params_json={"window_n": 100},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "anomaly"
    assert body["min_samples"] == 10
    assert body["params_json"] == {"window_n": 100}


# --------------------------------------------------------------------------
# (g) Pagination.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_rules_paginated(client) -> None:
    for i in range(5):
        r = await _post_rule(client, name=f"rule-{i}")
        assert r.status_code == 201, r.text
    r = await client.get("/api/alerts/rules?limit=2&offset=2")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2


# --------------------------------------------------------------------------
# (h) PATCH enabled preserves state.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_rule_enabled_preserves_state(client) -> None:
    r = await _post_rule(client)
    rule_id = r.json()["rule_id"]
    await _seed_state(client, rule_id)
    assert await _count_states(client, rule_id) == 1

    r = await client.patch(
        f"/api/alerts/rules/{rule_id}", json={"enabled": False}
    )
    assert r.status_code == 200, r.text
    assert r.json()["enabled"] is False
    # State row preserved.
    assert await _count_states(client, rule_id) == 1


# --------------------------------------------------------------------------
# (i) PATCH threshold clears state.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_rule_threshold_clears_state(client) -> None:
    r = await _post_rule(client)
    rule_id = r.json()["rule_id"]
    await _seed_state(client, rule_id)
    assert await _count_states(client, rule_id) == 1

    r = await client.patch(
        f"/api/alerts/rules/{rule_id}", json={"threshold_fire": 99.0}
    )
    assert r.status_code == 200, r.text
    assert r.json()["threshold_fire"] == 99.0
    # State row cleared (D-02).
    assert await _count_states(client, rule_id) == 0


# --------------------------------------------------------------------------
# (j) PATCH validation 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_rule_threshold_validation_422(client) -> None:
    r = await _post_rule(client)
    rule_id = r.json()["rule_id"]
    r = await client.patch(
        f"/api/alerts/rules/{rule_id}",
        json={"threshold_fire": 5.0, "threshold_clear": 10.0},
    )
    assert r.status_code == 422, r.text


# --------------------------------------------------------------------------
# (k) PATCH 404.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_patch_rule_404_unknown(client) -> None:
    r = await client.patch("/api/alerts/rules/9999", json={"enabled": False})
    assert r.status_code == 404, r.text


# --------------------------------------------------------------------------
# (l) DELETE cascades.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_rule_cascades_state(client) -> None:
    r = await _post_rule(client)
    rule_id = r.json()["rule_id"]
    await _seed_state(client, rule_id)
    assert await _count_states(client, rule_id) == 1

    r = await client.delete(f"/api/alerts/rules/{rule_id}")
    assert r.status_code == 204, r.text

    # No rule row.
    sm = client._transport.app.state.sessions
    async with sm() as db:
        rows = (
            await db.execute(
                select(AlertRule).where(AlertRule.rule_id == rule_id)
            )
        ).scalars().all()
    assert rows == []
    # No state rows.
    assert await _count_states(client, rule_id) == 0


# --------------------------------------------------------------------------
# (m) Events: invalid range → 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_events_invalid_range_422(client) -> None:
    r = await client.get("/api/alerts/events?range=2d")
    assert r.status_code == 422, r.text


# --------------------------------------------------------------------------
# (n) Events: empty.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_events_empty(client) -> None:
    r = await client.get("/api/alerts/events?range=7d")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["range"] == "7d"
    assert body["items"] == []
    assert body["total"] == 0


# --------------------------------------------------------------------------
# (o) Events: returns alert decisions.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_events_returns_alert_decisions(client) -> None:
    r = await _post_rule(client, name="cost-spike", metric="cost_usd_24h")
    rule_id = r.json()["rule_id"]
    await _seed_alert_decision(client, rule_id, "model:opus", status="pending")
    await _seed_alert_decision(
        client, rule_id, "model:sonnet", status="answered"
    )

    r = await client.get("/api/alerts/events?range=7d")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 2
    rule_names = {item["rule_name"] for item in body["items"]}
    assert "cost-spike" in rule_names


@pytest.mark.asyncio
async def test_events_surfaces_last_value_from_alert_state(client) -> None:
    """BUG-1 regression: events endpoint MUST JOIN alert_state and surface
    last_value so AlertEventsList renders the firing magnitude (not '—')."""
    r = await _post_rule(client, name="cost-rule", metric="cost_usd_24h")
    rule_id = r.json()["rule_id"]
    await _seed_alert_decision(client, rule_id, "model:opus", status="pending")
    await _seed_state(client, rule_id, scope_key="model:opus", last_value=42.5)

    r = await client.get("/api/alerts/events?range=7d")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["last_value"] == 42.5


@pytest.mark.asyncio
async def test_events_serializes_fired_at_as_utc_with_z_suffix(client) -> None:
    """BUG-2 regression: datetime fields MUST serialize as ISO-8601 with `Z`
    suffix so JS `new Date(...)` parses as UTC instead of local time."""
    r = await _post_rule(client, name="cost-rule", metric="cost_usd_24h")
    rule_id = r.json()["rule_id"]
    await _seed_alert_decision(client, rule_id, "model:opus", status="pending")

    r = await client.get("/api/alerts/events?range=7d")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) == 1
    fired_at = items[0]["fired_at"]
    assert fired_at.endswith("Z"), f"expected UTC suffix, got {fired_at!r}"
    assert "+" not in fired_at  # Z, not +00:00


# --------------------------------------------------------------------------
# (p) Ack: sets acked_until.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ack_alert_sets_acked_until(client) -> None:
    r = await _post_rule(client, name="latency", metric="skill_p95_latency_ms")
    rule_id = r.json()["rule_id"]
    scope_key = "skill:foo"
    await _seed_state(client, rule_id, scope_key=scope_key)
    scope_hash = hashlib.sha256(scope_key.encode()).hexdigest()[:8]

    r = await client.post(
        "/api/alerts/_ack",
        json={"rule_id": rule_id, "scope_hash": scope_hash},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert "acked_until" in body

    # Reload state and verify.
    sm = client._transport.app.state.sessions
    async with sm() as db:
        row = (
            await db.execute(
                select(AlertState).where(
                    AlertState.rule_id == rule_id,
                    AlertState.scope_key == scope_key,
                )
            )
        ).scalar_one()
    assert row.acked_until is not None
    # Tolerate naive vs tz-aware datetimes from SQLite round-trip.
    acked = row.acked_until
    if acked.tzinfo is None:
        acked = acked.replace(tzinfo=UTC)
    delta = acked - datetime.now(UTC)
    assert timedelta(minutes=59) < delta < timedelta(minutes=61)


# --------------------------------------------------------------------------
# (q) Ack: unknown rule_id → 404.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ack_alert_unknown_rule_id_404(client) -> None:
    r = await client.post(
        "/api/alerts/_ack",
        json={"rule_id": 9999, "scope_hash": "a1b2c3d4"},
    )
    assert r.status_code == 404, r.text


# --------------------------------------------------------------------------
# (r) Ack: hash mismatch → 404.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ack_alert_hash_mismatch_404(client) -> None:
    r = await _post_rule(client)
    rule_id = r.json()["rule_id"]
    await _seed_state(client, rule_id, scope_key="real:scope")

    # Hash that won't match any state row.
    r = await client.post(
        "/api/alerts/_ack",
        json={"rule_id": rule_id, "scope_hash": "deadbeef"},
    )
    assert r.status_code == 404, r.text


# --------------------------------------------------------------------------
# (s) Ack: invalid hash format → 422.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ack_alert_invalid_hash_format_422(client) -> None:
    r = await client.post(
        "/api/alerts/_ack",
        json={"rule_id": 1, "scope_hash": "ZZZZ"},
    )
    assert r.status_code == 422, r.text

    r = await client.post(
        "/api/alerts/_ack",
        json={"rule_id": 1, "scope_hash": "abc"},  # too short
    )
    assert r.status_code == 422, r.text


# --------------------------------------------------------------------------
# Phase 21 Plan 02 — POST /api/alerts/parse-nl + GET /api/alerts/metrics.
# --------------------------------------------------------------------------
#
# Mirror tests/test_schedules_router.py:308-345 — bind-replace
# `cmc.api.routes.alerts.parse_alert_nl` at the import binding via
# monkeypatch.setattr (router-level integration), NOT the parser internals
# (those are covered by tests/test_alerts_nl_parser.py).
#
# Note: the app's HTTPException handler (cmc/core/errors.py) wraps detail
# into {"error": detail, "request_id": ...} — so we read r.json()["error"]
# (NOT "detail") on 503, mirroring test_schedules_router.py's pattern.


def _valid_anomaly_rule() -> AlertRuleCreate:
    """Build an AlertRuleCreate the parser would return on a happy-path Haiku call."""
    return AlertRuleCreate(
        name="haiku-p95",
        kind="anomaly",
        metric="skill_p95_latency_ms",
        threshold_fire=3.0,
        min_samples=50,
        params_json={"window_kind": "sliding", "window_n": 50},
    )


# (t) parse-nl happy path — 200 + echoed description.


@pytest.mark.asyncio
async def test_parse_nl_alert_happy_path_returns_200(client, monkeypatch) -> None:
    """Mocked parse_alert_nl returns AlertRuleCreate → 200 + echoed description."""
    monkeypatch.setattr(
        "cmc.api.routes.alerts.parse_alert_nl",
        AsyncMock(return_value=_valid_anomaly_rule()),
    )
    r = await client.post(
        "/api/alerts/parse-nl",
        json={"description": "alert me when haiku skill p95 exceeds 3 sigma"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rule"]["metric"] == "skill_p95_latency_ms"
    assert body["rule"]["kind"] == "anomaly"
    assert body["rule"]["threshold_fire"] == 3.0
    assert body["description"] == "alert me when haiku skill p95 exceeds 3 sigma"


# (u) parse-nl no API key — 503 + 'natural-language alerts unavailable'.


@pytest.mark.asyncio
async def test_parse_nl_alert_no_api_key_returns_503(client, monkeypatch) -> None:
    """Parser returns None (missing API key) → router emits 503 with V11 body."""
    monkeypatch.setattr(
        "cmc.api.routes.alerts.parse_alert_nl",
        AsyncMock(return_value=None),
    )
    r = await client.post(
        "/api/alerts/parse-nl",
        json={"description": "alert me when haiku skill p95 exceeds 3 sigma"},
    )
    assert r.status_code == 503, r.text
    assert r.json()["error"] == "natural-language alerts unavailable"


# (v) parse-nl invalid Haiku output — 503 (collapsed-failure-mode contract).


@pytest.mark.asyncio
async def test_parse_nl_alert_invalid_output_returns_503(client, monkeypatch) -> None:
    """Parser returns None (invalid Haiku output, e.g. hallucinated metric) → 503.

    Same response as no-API-key case — Pitfall 6 recommendation A / V11
    collapsed-failure-mode contract: a single 503 covers both failure modes.
    Test name documents the SEMANTIC distinction even though the wire shape
    is identical to test_parse_nl_alert_no_api_key_returns_503.
    """
    monkeypatch.setattr(
        "cmc.api.routes.alerts.parse_alert_nl",
        AsyncMock(return_value=None),
    )
    r = await client.post(
        "/api/alerts/parse-nl",
        json={"description": "garbled prompt that haiku rejects"},
    )
    assert r.status_code == 503, r.text
    assert r.json()["error"] == "natural-language alerts unavailable"


# (w) GET /api/alerts/metrics — 200 + sorted _SCOPE_EXTRACTORS keys.


@pytest.mark.asyncio
async def test_get_alert_metrics_returns_200_with_sorted_keys(client) -> None:
    """GET /api/alerts/metrics returns sorted(_SCOPE_EXTRACTORS.keys()).

    Sort makes ordering deterministic for Plan 21-03's CI drift-guard test
    (frontend KNOWN_METRICS must match this exact list verbatim).
    """
    r = await client.get("/api/alerts/metrics")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "metrics": [
            "cost_usd_24h",
            "dispatcher_failed_tasks_5m",
            "skill_p95_latency_ms",
        ]
    }
