"""OTLP/HTTP JSON ingest endpoints — POST /v1/logs and POST /v1/metrics.

CRITICAL CONTRACT (INGST-07/INGST-09 + Pitfalls.md Pitfall 4):
  These handlers ALWAYS return 200 with body `{}` once the request body has
  been read. Any 4xx/5xx causes Claude Code's OTLP exporter to drop the batch
  permanently and disable itself for the session — observability data is lost
  silently.

  The ONLY non-200 returned is 413 when Content-Length exceeds
  Settings.otlp_max_body_bytes, which is checked BEFORE reading the body —
  so 413 is fine because the body never made it into the parser anyway.

Per-record exceptions are logged and skipped (one bad record never blocks the
batch). DB commit failures are rolled back and we still return 200.

OTLP/HTTP supports both JSON and protobuf encodings; Phase 2 accepts JSON only.
A protobuf request (Content-Type: application/x-protobuf) will fail JSON
parsing here and return 200 anyway — supporting protobuf is deferred per
research §A3.
"""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from cmc.db import get_session
from cmc.db.models.otel_events import OtelEvent
from cmc.db.models.otel_metrics import OtelMetric
from cmc.ingest.otel_parser import extract_mcp_attrs, iter_attrs, parse_unix_nano

log = logging.getLogger(__name__)

router = APIRouter(tags=["otel"])


# Order matters: Each metric carries exactly ONE of these keys (research §2).
# We discriminate by which key is present and break after the first match.
_METRIC_KIND_KEYS: list[tuple[str, str]] = [
    ("counter", "sum"),
    ("gauge", "gauge"),
    ("histogram", "histogram"),
    ("summary", "summary"),
]


def _check_body_size(request: Request) -> JSONResponse | None:
    """Return a 413 response if Content-Length exceeds the configured cap.

    Uses Settings.otlp_max_body_bytes from app.state.settings (do NOT hardcode).
    A missing or unparseable Content-Length is allowed through — Starlette's
    body reader will raise on truly oversize bodies and we'll catch that
    upstream as a malformed body (still returns 200).
    """
    cap = request.app.state.settings.otlp_max_body_bytes
    cl = request.headers.get("content-length")
    if cl:
        try:
            if int(cl) > cap:
                return JSONResponse({}, status_code=413)
        except ValueError:
            pass
    return None


@router.post("/v1/logs")
async def otlp_logs(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """OTLP/HTTP JSON LogsService export endpoint.

    Walks resourceLogs[].scopeLogs[].logRecords[] and inserts one OtelEvent
    row per record. Always returns 200 once the body is read (per Pitfall 4).
    """
    if too_big := _check_body_size(request):
        return too_big
    try:
        payload = await request.json()
    except Exception:
        # Malformed JSON: per Pitfall 4 we still must return 200.
        return JSONResponse({}, status_code=200)
    if not isinstance(payload, dict):
        return JSONResponse({}, status_code=200)

    inserted = 0
    for rl in payload.get("resourceLogs") or []:
        if not isinstance(rl, dict):
            continue
        resource = rl.get("resource") or {}
        for sl in rl.get("scopeLogs") or []:
            if not isinstance(sl, dict):
                continue
            scope = sl.get("scope") or {}
            for record in sl.get("logRecords") or []:
                if not isinstance(record, dict):
                    continue
                try:
                    attrs = iter_attrs(record.get("attributes"))
                    event_name = (attrs.get("event.name") or {}).get("stringValue") or "unknown"
                    session_id = (attrs.get("session_id") or {}).get("stringValue")
                    ts = parse_unix_nano(
                        record.get("timeUnixNano") or record.get("observedTimeUnixNano")
                    )
                    mcp_server, mcp_tool = extract_mcp_attrs(record)
                    # Per-record savepoint so a single FK / constraint failure
                    # cannot abort the whole batch (truths #3 + research §2).
                    # If session_id refers to a sessions row that hasn't landed
                    # yet (events arrive BEFORE the JSONL scheduler discovers
                    # the session — soft FK contract on otel_events.session_id),
                    # we retry with session_id=None so the row still persists.
                    # The original id remains in `body.record` for later joining.
                    try:
                        async with db.begin_nested():
                            db.add(OtelEvent(
                                ts=ts or datetime.now(UTC),
                                event_name=event_name,
                                session_id=session_id,
                                body={"record": record, "resource": resource, "scope": scope},
                                attrs_mcp_server=mcp_server,
                                attrs_mcp_tool=mcp_tool,
                            ))
                            await db.flush()
                        inserted += 1
                    except IntegrityError:
                        # Savepoint already rolled back by the context manager.
                        async with db.begin_nested():
                            db.add(OtelEvent(
                                ts=ts or datetime.now(UTC),
                                event_name=event_name,
                                session_id=None,
                                body={"record": record, "resource": resource, "scope": scope},
                                attrs_mcp_server=mcp_server,
                                attrs_mcp_tool=mcp_tool,
                            ))
                            await db.flush()
                        inserted += 1
                except Exception:
                    log.exception("otel.log_record_skip")
                    continue
    try:
        await db.commit()
    except Exception:
        log.exception("otel.logs_commit_error inserted=%d", inserted)
        await db.rollback()
    return JSONResponse({}, status_code=200)


@router.post("/v1/metrics")
async def otlp_metrics(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """OTLP/HTTP JSON MetricsService export endpoint.

    Walks resourceMetrics[].scopeMetrics[].metrics[] and discriminates each
    metric's kind by which key is present (sum/gauge/histogram/summary).
    Inserts one OtelMetric row per dataPoint. Always returns 200.

    Value extraction:
      sum/gauge dataPoints: asInt (parsed int -> float) or asDouble.
      histogram dataPoints: dp.sum (research Assumption A8 — sum is the
        most useful single scalar for productivity rollups; bucket detail
        lives in the `attrs` JSON column).
    """
    if too_big := _check_body_size(request):
        return too_big
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({}, status_code=200)
    if not isinstance(payload, dict):
        return JSONResponse({}, status_code=200)

    inserted = 0
    for rm in payload.get("resourceMetrics") or []:
        if not isinstance(rm, dict):
            continue
        for sm in rm.get("scopeMetrics") or []:
            if not isinstance(sm, dict):
                continue
            for metric in sm.get("metrics") or []:
                if not isinstance(metric, dict):
                    continue
                try:
                    name = metric.get("name") or "unknown"
                    unit = metric.get("unit")
                    for kind, key in _METRIC_KIND_KEYS:
                        if key not in metric:
                            continue
                        kind_block = metric.get(key) or {}
                        for dp in kind_block.get("dataPoints") or []:
                            if not isinstance(dp, dict):
                                continue
                            try:
                                ts = parse_unix_nano(dp.get("timeUnixNano"))
                                if "asInt" in dp:
                                    # OTLP encodes int64 as string for protobuf
                                    # wire safety; parse via int -> float.
                                    value = float(int(dp["asInt"]))
                                elif "asDouble" in dp:
                                    value = float(dp["asDouble"])
                                elif kind == "histogram":
                                    value = float(dp.get("sum") or 0)
                                else:
                                    value = 0.0
                                attrs_dp = iter_attrs(dp.get("attributes"))
                                db.add(OtelMetric(
                                    ts=ts or datetime.now(UTC),
                                    metric_name=name,
                                    value=value,
                                    kind=kind,
                                    unit=unit,
                                    attrs={"data_point": dp, "metric_attrs": attrs_dp},
                                ))
                                inserted += 1
                            except Exception:
                                log.exception("otel.metric_point_skip name=%s", name)
                                continue
                        break  # only one kind per metric
                except Exception:
                    log.exception("otel.metric_skip")
                    continue
    try:
        await db.commit()
    except Exception:
        log.exception("otel.metrics_commit_error inserted=%d", inserted)
        await db.rollback()
    return JSONResponse({}, status_code=200)
