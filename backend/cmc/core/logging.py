"""structlog + stdlib logging configuration."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    # Type-only import avoids circular dependency:
    # cmc.config -> cmc.core.paths -> cmc.core/__init__.py -> cmc.core.logging -> cmc.config
    from cmc.config import Settings


def configure_logging(settings: "Settings") -> None:
    """Configure structlog + stdlib logging once at app startup."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(colors=False),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )
