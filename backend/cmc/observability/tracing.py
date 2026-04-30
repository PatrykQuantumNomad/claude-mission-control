"""Optional OpenTelemetry tracing setup."""

from typing import Any

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from sqlalchemy.ext.asyncio import AsyncEngine

_provider_configured = False
_httpx_instrumented = False


def configure_tracing(settings) -> None:
    """Configure the global OpenTelemetry tracer provider once."""
    global _httpx_instrumented, _provider_configured

    if not settings.otel_enabled or _provider_configured:
        return

    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": settings.otel_service_name,
                "service.version": settings.otel_service_version,
                "deployment.environment": settings.otel_environment,
            }
        )
    )
    exporter = OTLPSpanExporter(
        endpoint=settings.otel_exporter_otlp_endpoint,
        headers=_parse_headers(settings.otel_exporter_otlp_headers),
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _provider_configured = True

    if not _httpx_instrumented:
        HTTPXClientInstrumentor().instrument()
        _httpx_instrumented = True


def instrument_fastapi_app(app: Any, settings) -> None:
    if not settings.otel_enabled:
        return
    FastAPIInstrumentor.instrument_app(
        app,
        excluded_urls=",".join(
            [
                settings.health_check_path,
                settings.readiness_check_path,
                "/metrics",
                "/favicon.ico",
            ]
        ),
    )


def instrument_database_engine(engine: AsyncEngine, settings) -> None:
    if settings.otel_enabled:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)


def _parse_headers(raw_headers: str) -> dict[str, str]:
    if not raw_headers:
        return {}
    headers: dict[str, str] = {}
    for item in raw_headers.split(","):
        key, _, value = item.partition("=")
        if key and value:
            headers[key.strip()] = value.strip()
    return headers
