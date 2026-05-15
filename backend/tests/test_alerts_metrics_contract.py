"""Phase 27 TDBT-02 — API-layer drift guard.

Replaces backend/tests/test_alerts_metrics_sync.py (deleted 2026-05-15
in commit before this file landed). The old test grepped the frontend
AlertRuleForm.tsx source file for a FALLBACK_KNOWN_METRICS array
literal and asserted parity with backend _SCOPE_EXTRACTORS. That
constant is gone — Phase 27 TDBT-02 made useAlertMetrics the SOLE
frontend source of the metric vocabulary, so a build-time string-
matching guard rooted in a frontend file no longer makes sense.

This test asserts the genuine architectural invariant: the keys of
the backend `_SCOPE_EXTRACTORS` dict exactly match the metrics list
returned by `GET /api/alerts/metrics`. Any divergence — a new
extractor added without exposing through the route handler, or vice
versa — fails this test. The cross-language drift the old test was
trying to catch is now caught by the runtime contract that the
frontend hook (`useAlertMetrics`) consumes directly.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from cmc.alerts.scopes import _SCOPE_EXTRACTORS


@pytest.mark.asyncio
async def test_alerts_metrics_response_matches_scope_extractors(
    client: AsyncClient,
) -> None:
    """GET /api/alerts/metrics returns exactly sorted(_SCOPE_EXTRACTORS.keys()).

    This is the API-layer contract: the route handler is supposed to
    return `sorted(_SCOPE_EXTRACTORS.keys())` (see
    cmc/api/routes/alerts.py::list_metrics). If a future commit
    forgets to thread a new extractor through, or returns the raw
    dict view in a non-deterministic order, this test fails fast.
    """
    resp = await client.get("/api/alerts/metrics")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "metrics" in body, f"response missing 'metrics' field: {body}"
    api_metrics = sorted(body["metrics"])
    extractor_keys = sorted(_SCOPE_EXTRACTORS.keys())
    assert api_metrics == extractor_keys, (
        "drift detected — /api/alerts/metrics returned "
        f"{api_metrics} but _SCOPE_EXTRACTORS dict has "
        f"{extractor_keys}. A new extractor was added without "
        "exposing through the route handler, or the handler emits "
        "a metric not backed by an extractor."
    )


@pytest.mark.asyncio
async def test_alerts_metrics_response_is_non_empty(
    client: AsyncClient,
) -> None:
    """Smoke check: at least the 3 v1.1 metrics are exposed.

    Guards against an accidental empty-vocab regression
    (`_SCOPE_EXTRACTORS = {}` or a handler bug that drops the dict
    view); the frontend disabled "No metrics available" branch
    would otherwise mask the regression behind a friendly UI.
    """
    resp = await client.get("/api/alerts/metrics")
    body = resp.json()
    assert len(body["metrics"]) >= 3, (
        f"expected at least 3 metrics, got {len(body['metrics'])}"
    )
