"""FastAPI authentication dependencies."""

from collections.abc import Callable
from typing import cast

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from cmc.auth.models import Principal
from cmc.auth.service import AuthenticationError, JWTAuthService

bearer_scheme = HTTPBearer(auto_error=False)


def get_auth_service(request: Request) -> JWTAuthService:
    return cast(JWTAuthService, request.app.state.auth_service)


async def get_optional_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal | None:
    if credentials is None:
        return None
    auth_service = get_auth_service(request)
    try:
        return await auth_service.authenticate_token(credentials.credentials)
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_principal(
    principal: Principal | None = Depends(get_optional_principal),
) -> Principal:
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def require_scopes(*required_scopes: str) -> Callable[..., Principal]:
    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        missing = [scope for scope in required_scopes if scope not in principal.scopes]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scopes: {', '.join(missing)}",
            )
        return principal

    return dependency


def require_roles(*required_roles: str) -> Callable[..., Principal]:
    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        missing = [role for role in required_roles if role not in principal.roles]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required roles: {', '.join(missing)}",
            )
        return principal

    return dependency
