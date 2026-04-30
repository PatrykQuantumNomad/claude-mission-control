"""Production chassis alignment tests."""

import httpx
import pytest

from cmc.auth import build_test_jwt


def test_chassis_builder_exposes_fluent_setup_methods(test_settings_with_static) -> None:
    from fastapi import FastAPI

    from cmc.app.factory import FastAPIAppBuilder

    builder = FastAPIAppBuilder(settings=test_settings_with_static)
    assert builder.setup_logging() is builder
    assert builder.setup_settings() is builder
    assert builder.setup_error_handlers() is builder
    assert builder.setup_observability() is builder
    assert builder.setup_middleware() is builder
    assert builder.setup_routes() is builder
    assert builder.setup_static() is builder
    assert isinstance(builder.build(), FastAPI)


@pytest.mark.asyncio
async def test_chassis_readiness_and_security_headers(client) -> None:
    response = await client.get("/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["application"]["healthy"] is True
    assert body["checks"]["database"]["healthy"] is True
    assert body["checks"]["auth"]["healthy"] is True
    assert "detail" not in body["checks"]["database"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-request-id"]
    assert response.headers["x-correlation-id"]


@pytest.mark.asyncio
async def test_chassis_body_size_limit(test_settings_with_static) -> None:
    from cmc.app.factory import create_app

    settings = test_settings_with_static.model_copy(
        update={
            "jsonl_root": test_settings_with_static.db_path.parent / "no-jsonl-here",
            "max_request_body_bytes": 5,
        }
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            response = await client.post("/v1/logs", content=b"too large")

    assert response.status_code == 413
    assert response.json()["error"] == "request_too_large"


@pytest.mark.asyncio
async def test_chassis_rate_limit_opt_in(test_settings_with_static) -> None:
    from cmc.app.factory import create_app

    settings = test_settings_with_static.model_copy(
        update={
            "jsonl_root": test_settings_with_static.db_path.parent / "no-jsonl-here",
            "rate_limit_enabled": True,
            "rate_limit_requests": 1,
            "rate_limit_window_seconds": 60,
        }
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            first = await client.get("/api/health")
            second = await client.get("/api/health")

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"] == "rate_limited"


@pytest.mark.asyncio
async def test_chassis_optional_jwt_protects_application_routes(test_settings_with_static) -> None:
    from cmc.app.factory import create_app

    secret = "x" * 32
    settings = test_settings_with_static.model_copy(
        update={
            "jsonl_root": test_settings_with_static.db_path.parent / "no-jsonl-here",
            "auth_enabled": True,
            "auth_jwt_secret": secret,
        }
    )
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            health = await client.get("/api/health")
            missing_token = await client.get("/api/system/state")
            token = build_test_jwt(subject="tester", secret=secret)
            authorized = await client.get(
                "/api/system/state",
                headers={"Authorization": f"Bearer {token}"},
            )

    assert health.status_code == 200
    assert missing_token.status_code == 401
    assert authorized.status_code == 200
