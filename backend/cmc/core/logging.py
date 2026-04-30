"""structlog + stdlib logging configuration."""

import logging
import sys
from typing import TYPE_CHECKING

import structlog
from pythonjsonlogger.json import JsonFormatter

if TYPE_CHECKING:
    # Type-only import avoids circular dependency:
    # cmc.config -> cmc.core.paths -> cmc.core/__init__.py -> cmc.core.logging -> cmc.config
    from cmc.config import Settings


def configure_logging(settings: "Settings") -> None:
    """Configure structlog + stdlib logging once at app startup."""
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    if settings.log_format == "json":
        handler.setFormatter(
            JsonFormatter(
                "%(asctime)s %(levelname)s %(name)s %(message)s",
                rename_fields={
                    "asctime": "timestamp",
                    "levelname": "level",
                    "name": "logger",
                },
            )
        )
    else:
        handler.setFormatter(logging.Formatter("%(message)s"))
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
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
