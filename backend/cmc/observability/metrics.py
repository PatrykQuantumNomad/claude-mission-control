"""Optional Prometheus metrics setup."""

import contextlib
import platform

import fastapi
from fastapi import FastAPI

METRICS_PATH = "/metrics"


def configure_metrics(app: FastAPI, settings) -> None:
    """Attach Prometheus middleware and scrape endpoint when enabled."""
    if not settings.metrics_enabled:
        return

    from prometheus_client import REGISTRY, Info
    from starlette_exporter import PrometheusMiddleware, handle_metrics
    from starlette_exporter.optional_metrics import request_body_size, response_body_size

    with contextlib.suppress(KeyError):
        REGISTRY.unregister(REGISTRY._names_to_collectors["fastapi_app_info_info"])

    app_info = Info("fastapi_app_info", "FastAPI application information")
    app_info.info(
        {
            "app_name": settings.app_name,
            "app_version": settings.app_version,
            "python_version": platform.python_version(),
            "fastapi_version": fastapi.__version__,
        }
    )

    app.add_middleware(
        PrometheusMiddleware,
        app_name=settings.app_name,
        prefix=settings.metrics_prefix,
        group_paths=False,
        optional_metrics=[response_body_size, request_body_size],
        skip_paths=[
            settings.health_check_path,
            settings.readiness_check_path,
            METRICS_PATH,
            "/favicon.ico",
        ],
        skip_methods=["OPTIONS"],
    )
    app.add_route(METRICS_PATH, handle_metrics)
