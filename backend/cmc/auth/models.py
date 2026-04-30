"""Authentication models."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class Principal:
    """Authenticated JWT principal."""

    subject: str
    issuer: str | None
    audience: list[str]
    scopes: list[str]
    roles: list[str]
    claims: dict[str, Any]
