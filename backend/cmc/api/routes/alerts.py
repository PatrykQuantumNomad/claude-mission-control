"""Phase 15 Plan 02 — /api/alerts CRUD + events history + ack.

ALRT-09 — full CRUD on alert rules + GET events history + POST _ack.

Five resource endpoints under prefix '/alerts' (mounted /api):

  GET    /api/alerts/rules                  — paginated list, ORDER BY rule_id DESC
  POST   /api/alerts/rules                  — create rule (201)
  PATCH  /api/alerts/rules/{rule_id}        — partial update; clears alert_state
                                              when threshold-shaped fields are
                                              touched (D-02)
  DELETE /api/alerts/rules/{rule_id}        — 204; cascade-delete alert_state
  GET    /api/alerts/events?range=          — recent firing history with
                                              rule_name joined in Python
  POST   /api/alerts/_ack                   — sets acked_until = now+1h on the
                                              alert_state row matching
                                              sha256(scope_key)[:8]

ALRT-12 invariant: this module MUST NOT import cmc.dispatcher.tasks. The
test_alerts_router.py suite plus the shared ALRT-12 tests in
test_alerts_dispatcher.py guard the contract.

PATCH state-clear policy (D-02):
  Touching ANY of {threshold_fire, threshold_clear, min_dwell_seconds,
  min_samples, cooldown_seconds} in the patch body deletes all alert_state
  rows for the rule_id — next tick re-evaluates from a clean state.
  Patching only {name, enabled, params_json} preserves alert_state.

Events join strategy:
  SQLite has no SPLIT_PART. Native SUBSTR + INSTR works but is fragile.
  Strategy: SELECT decisions matching dedup_key LIKE 'alert:%' in Python,
  parse rule_id out of the dedup_key, then bulk-fetch matching alert_rules.
  Speed budget: events ≤500/day in v1.0 — Python join cost is negligible.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy import update as _upd
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.alerts import (
    AlertAckRequest,
    AlertEvent,
    AlertEventsResponse,
    AlertRange,
    AlertRuleCreate,
    AlertRuleListResponse,
    AlertRulePatch,
    AlertRuleRow,
)
from cmc.db import get_session
from cmc.db.models.alert_rules import AlertRule
from cmc.db.models.alert_state import AlertState
from cmc.db.models.decisions import Decision

router = APIRouter(tags=["alerts"])


# Range conversion COPIED from cost.py — keeps router files independent
# (each Phase 14/15 router copies the constant verbatim per Phase 14 P02
# precedent). Single source of truth for the range vocabulary itself is
# the AlertRange Literal in schemas/alerts.py.
_RANGE_TO_DAYS: dict[str, int] = {"1d": 1, "7d": 7, "14d": 14, "30d": 30}


def _range_start(range_: str) -> datetime:
    """Inclusive lower bound for the range filter (UTC, naive)."""
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(
        days=_RANGE_TO_DAYS[range_]
    )


def _utcnow_naive() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# Threshold-shaped fields whose mutation invalidates the alert_state machine
# (D-02). Patching any of these clears alert_state rows for the rule.
_STATE_INVALIDATING_FIELDS = frozenset(
    {
        "threshold_fire",
        "threshold_clear",
        "min_dwell_seconds",
        "min_samples",
        "cooldown_seconds",
    }
)


# ---------- GET /api/alerts/rules ------------------------------------------


@router.get("/alerts/rules", response_model=AlertRuleListResponse)
async def list_rules(
    db: AsyncSession = Depends(get_session),
    limit: int = Query(200, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> AlertRuleListResponse:
    """Paginated list of alert rules ordered rule_id DESC.

    `total` is the table-wide count (no filters in v1).
    """
    q = (
        select(AlertRule)
        .order_by(AlertRule.rule_id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(q)).scalars().all()
    total = (
        await db.execute(select(func.count(AlertRule.rule_id)))
    ).scalar_one()
    return AlertRuleListResponse(
        items=[AlertRuleRow.model_validate(r) for r in rows],
        total=total,
    )


# ---------- POST /api/alerts/rules -----------------------------------------


@router.post("/alerts/rules", response_model=AlertRuleRow, status_code=201)
async def create_rule(
    payload: AlertRuleCreate,
    db: AsyncSession = Depends(get_session),
) -> AlertRuleRow:
    """Create an alert rule.

    Validators run in AlertRuleCreate (Pydantic v2 model_validator):
      - threshold rules require threshold_fire
      - threshold_clear < threshold_fire when both set
      - is_known_metric(metric)

    Returns 201 + the created row.
    """
    now = _utcnow_naive()
    r = AlertRule(
        name=payload.name,
        kind=payload.kind,
        metric=payload.metric,
        threshold_fire=payload.threshold_fire,
        threshold_clear=payload.threshold_clear,
        min_dwell_seconds=payload.min_dwell_seconds,
        min_samples=payload.min_samples,
        cooldown_seconds=payload.cooldown_seconds,
        enabled=payload.enabled,
        spec_version=payload.spec_version,
        params_json=payload.params_json,
        created_at=now,
        updated_at=now,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return AlertRuleRow.model_validate(r)


# ---------- PATCH /api/alerts/rules/{rule_id} ------------------------------


@router.patch("/alerts/rules/{rule_id}", response_model=AlertRuleRow)
async def patch_rule(
    rule_id: int,
    payload: AlertRulePatch,
    db: AsyncSession = Depends(get_session),
) -> AlertRuleRow:
    """Partial update with D-02 state-clear policy.

    PATCH that touches any threshold-shaped field deletes all alert_state
    rows for the rule (next tick re-evaluates clean). PATCH that touches only
    name / enabled / params_json preserves alert_state.

    422 on threshold_clear >= threshold_fire (validator on AlertRulePatch).
    404 on unknown rule_id.
    """
    row = (
        await db.execute(
            select(AlertRule).where(AlertRule.rule_id == rule_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="alert rule not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        # No-op patch — return the row unchanged.
        return AlertRuleRow.model_validate(row)

    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = _utcnow_naive()

    if _STATE_INVALIDATING_FIELDS & updates.keys():
        # Clear alert_state rows for this rule (D-02).
        await db.execute(
            delete(AlertState).where(AlertState.rule_id == rule_id)
        )

    await db.commit()
    await db.refresh(row)
    return AlertRuleRow.model_validate(row)


# ---------- DELETE /api/alerts/rules/{rule_id} -----------------------------


@router.delete("/alerts/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_session),
) -> Response:
    """Delete the rule + all its alert_state rows (explicit cascade).

    SQLModel default FK behavior is RESTRICT (no auto-cascade); explicit
    delete-then-delete keeps the contract obvious in the SQL layer.
    """
    row = (
        await db.execute(
            select(AlertRule).where(AlertRule.rule_id == rule_id)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="alert rule not found")
    await db.execute(
        delete(AlertState).where(AlertState.rule_id == rule_id)
    )
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)


# ---------- GET /api/alerts/events?range= ----------------------------------


def _parse_dedup_key(dedup_key: str) -> tuple[int | None, str]:
    """Parse 'alert:{rule_id}:{scope_key}' -> (rule_id, scope_key).

    Returns (None, dedup_key) if the format doesn't match (defensive — a
    malformed key shouldn't crash the events endpoint; the row is still
    surfaced with rule_id=None and the raw key as scope_key).
    """
    if not dedup_key.startswith("alert:"):
        return None, dedup_key
    rest = dedup_key[len("alert:") :]
    sep = rest.find(":")
    if sep < 0:
        return None, rest
    rule_id_str, scope_key = rest[:sep], rest[sep + 1 :]
    try:
        return int(rule_id_str), scope_key
    except ValueError:
        return None, scope_key


@router.get("/alerts/events", response_model=AlertEventsResponse)
async def list_events(
    db: AsyncSession = Depends(get_session),
    range_: AlertRange = Query("7d", alias="range"),
    limit: int = Query(500, ge=1, le=2000),
) -> AlertEventsResponse:
    """Recent alert decisions, ordered created_at DESC, joined to rule_name.

    Python-side join: SELECT alert decisions, parse rule_id out of dedup_key,
    bulk-fetch alert_rules, then merge. Cheap because v1.0 caps events
    ≤500/day per the soft-cap in Pitfall 10.
    """
    since = _range_start(range_)
    decision_rows = (
        await db.execute(
            select(Decision)
            .where(Decision.dedup_key.like("alert:%"))
            .where(Decision.created_at >= since)
            .order_by(Decision.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    if not decision_rows:
        return AlertEventsResponse(range=range_, items=[], total=0)

    # Parse dedup_keys, collect rule_ids needed for the rule_name join.
    parsed: list[tuple[Decision, int | None, str]] = []
    needed_rule_ids: set[int] = set()
    for d in decision_rows:
        rule_id, scope_key = _parse_dedup_key(d.dedup_key)
        parsed.append((d, rule_id, scope_key))
        if rule_id is not None:
            needed_rule_ids.add(rule_id)

    rule_name_by_id: dict[int, str] = {}
    if needed_rule_ids:
        rule_rows = (
            await db.execute(
                select(AlertRule).where(
                    AlertRule.rule_id.in_(needed_rule_ids)
                )
            )
        ).scalars().all()
        rule_name_by_id = {r.rule_id: r.name for r in rule_rows}

    items: list[AlertEvent] = []
    for d, rule_id, scope_key in parsed:
        items.append(
            AlertEvent(
                decision_id=d.id,
                rule_id=rule_id or 0,
                rule_name=rule_name_by_id.get(rule_id or -1, "<deleted>"),
                scope_key=scope_key,
                fired_at=d.created_at,
                cleared_at=d.answered_at if d.status == "answered" else None,
                status=d.status,
                last_value=None,  # Plan 03 may surface state.last_value at join time.
            )
        )
    return AlertEventsResponse(range=range_, items=items, total=len(items))


# ---------- POST /api/alerts/_ack ------------------------------------------


@router.post("/alerts/_ack", status_code=200)
async def ack_alert(
    payload: AlertAckRequest,
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Resolve scope_hash to scope_key and stamp acked_until = now + 1h.

    Plan 03 wires the Telegram inline callback that hits this endpoint with
    the truncated hash because Telegram callback_data is capped at 64 bytes
    (Pitfall 9). SQLite has no native SHA256 — we compute the hash in Python
    over each candidate scope_key for the rule_id and pick the match.

    404 if no alert_state row matches (rule_id missing OR hash doesn't match
    any scope_key for that rule).
    """
    now = _utcnow_naive()
    rows = (
        await db.execute(
            select(AlertState).where(AlertState.rule_id == payload.rule_id)
        )
    ).scalars().all()
    target: AlertState | None = None
    for r in rows:
        if (
            hashlib.sha256(r.scope_key.encode()).hexdigest()[:8]
            == payload.scope_hash
        ):
            target = r
            break
    if target is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"no alert_state matching rule_id={payload.rule_id} "
                f"scope_hash={payload.scope_hash}"
            ),
        )
    await db.execute(
        _upd(AlertState)
        .where(AlertState.id == target.id)
        .values(acked_until=now + timedelta(hours=1))
    )
    await db.commit()
    return {
        "ok": True,
        "acked_until": (now + timedelta(hours=1)).isoformat(),
    }
