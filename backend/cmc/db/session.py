"""Async session factory and FastAPI dependency."""
from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker


def make_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create the session factory bound to the given engine."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: yields a fresh AsyncSession per request.

    Reads the sessionmaker from app.state.sessions, which is populated by lifespan.
    """
    sessionmaker = request.app.state.sessions
    async with sessionmaker() as session:
        yield session
