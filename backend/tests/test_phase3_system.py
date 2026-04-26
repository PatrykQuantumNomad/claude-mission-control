"""Phase 3 system-router tests (SAPI-*).

Phase 3 convention (declared here per RESEARCH Open Question 6 / A10): the
Phase 2 monolith `test_phase2_ingest.py` grew to 1156 lines, which made
navigation slow and rebases noisy. Phase 3 splits tests by router instead
of phase. Every SAPI-* test lives in this file. Sibling files own their
respective routers:

  - SESS-* tests  -> test_phase3_sessions.py
  - OBSV-* tests  -> test_phase3_observability.py
  - MCP-*  tests  -> test_phase3_mcp.py
  - SKILL-* tests -> test_phase3_skills.py

Wave 1 plans (03-02..03-05) APPEND their feature tests to the matching file;
they do NOT create additional test files for the same router.
"""
from __future__ import annotations


def test_system_schemas_importable() -> None:
    """Wave-0 smoke: SAPI response DTOs are importable from cmc.api.schemas.system."""
    from cmc.api.schemas.system import (  # noqa: F401
        AttentionItem,
        AttentionResponse,
        DaemonAge,
        FirehoseEvent,
        SystemHealthResponse,
        SystemStateResponse,
    )


def test_psutil_importable_and_alive() -> None:
    """Wave-0 smoke: psutil is installed and Process().memory_info() works.

    SAPI-02 calls psutil.Process().memory_info().rss for the health endpoint;
    if this assertion ever fails the dep was not installed correctly.
    """
    import psutil

    rss = psutil.Process().memory_info().rss
    assert rss > 0


def test_tail_otel_events_callable() -> None:
    """Wave-0 smoke: shared SSE helper is importable + callable.

    The full streaming behavior is covered by SAPI-05 / SESS-05 tests in
    Wave 1 — this test just guarantees the import contract for downstream
    plans that do `from cmc.api.sse import tail_otel_events`.
    """
    from cmc.api.sse import tail_otel_events

    assert callable(tail_otel_events)


def test_seeded_app_yields_tuple(seeded_app) -> None:
    """Wave-0 smoke: seeded_app fixture yields (app, lifespan_cm) tuple.

    Wave 1 plans pattern-match this shape as
        app, cm = seeded_app
        async with cm:
            ...
    so we lock the contract here.
    """
    assert isinstance(seeded_app, tuple)
    assert len(seeded_app) == 2
    app, cm = seeded_app
    # `cm` is an async context manager (lifespan_context returns one)
    assert hasattr(cm, "__aenter__")
    assert hasattr(cm, "__aexit__")
    # `app` carries the test settings
    assert app.state.settings is not None


async def test_client_health_endpoint_returns_200(client) -> None:
    """Wave-0 smoke: the `client` fixture properly enters the lifespan and
    routes /api/health through to the Phase 1 health router.

    This proves the full Phase 3 fixture chain works end-to-end:
      seeded_app -> create_app(settings) -> lifespan startup -> ASGITransport
      -> httpx.AsyncClient -> /api/health -> 200
    Future Phase 3 plans can rely on `client` for any endpoint test.
    """
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
