"""Alembic environment for async SQLAlchemy + SQLite.

Supports two invocation modes:
1. Standalone CLI: `alembic upgrade head` — creates its own async engine.
2. Shared connection: lifespan injects a connection via `config.attributes['connection']`
   so migrations run against the same engine the app uses.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

import cmc.db.models  # noqa: F401  (populates metadata)

# Import the models package so SQLModel.metadata is populated.
# cmc/db/models/__init__.py imports every model module for side effects.
from cmc.db.base import SQLModel

target_metadata = SQLModel.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # SQLite ALTER TABLE workaround
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Standalone CLI path: build our own async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point: shared connection if injected, else standalone async engine."""
    connectable = config.attributes.get("connection")
    if connectable is None:
        asyncio.run(run_async_migrations())
    else:
        do_run_migrations(connectable)


if context.is_offline_mode():
    raise RuntimeError("Offline mode unsupported for this app")
else:
    run_migrations_online()
