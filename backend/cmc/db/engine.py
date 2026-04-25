"""Async SQLAlchemy engine with SQLite-specific pragmas applied at connect time.

Per RESEARCH.md Pitfall 1, the `PRAGMA foreign_keys=ON` statement silently fails
to persist when the underlying sqlite3 connection is in transactional mode
(SQLAlchemy's default). The fix is to put the connection into autocommit mode
during pragma execution and restore the prior mode after.

When the dialect is `sqlite+aiosqlite`, the dbapi connection passed to the
connect-event listener is SQLAlchemy's `AsyncAdapt_aiosqlite_connection`
adapter. That adapter does NOT expose `.autocommit`; instead it exposes
`.isolation_level`. On the sqlite3 stdlib driver, `isolation_level=None`
is the autocommit equivalent, so we toggle `isolation_level` to None
across the pragma block and restore the prior value via try/finally.

Per RESEARCH.md Pitfall 4, WAL mode must be set on the FIRST connect — the
connect event ensures this.
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from cmc.config import Settings

_PRAGMAS = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA foreign_keys=ON",
    "PRAGMA busy_timeout=5000",
    "PRAGMA journal_size_limit=67108864",
    "PRAGMA synchronous=NORMAL",
)


def create_engine_for_settings(settings: Settings) -> AsyncEngine:
    """Create an AsyncEngine for the given Settings, with pragma listener attached."""
    # Ensure parent dir exists (data/) so SQLite can create the file
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{settings.db_path}",
        echo=settings.db_echo,
        future=True,
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        # Pitfall 1: foreign_keys pragma silently fails when sqlite3 is in
        # transactional mode. For sync sqlite3 the toggle is `.autocommit`;
        # for the aiosqlite adapter the equivalent toggle is `.isolation_level`
        # (None == autocommit on the underlying sqlite3 driver).
        prior_isolation = dbapi_connection.isolation_level
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        try:
            for pragma in _PRAGMAS:
                cursor.execute(pragma)
        finally:
            cursor.close()
            dbapi_connection.isolation_level = prior_isolation

    return engine
