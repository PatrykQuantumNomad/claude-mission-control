"""Saved-views CRUD router.

Phase 25 / VIEW-03. Mirrors backend/cmc/api/routes/tasks.py end-to-end.
state_json is stored opaquely (no shape validation backend-side per VIEW-02).

Five handlers:
  GET    /views           — list (optional ?route= filter; ordered updated_at DESC)
  POST   /views           — create (201); enforces VIEW_CAP_PER_ROUTE; rejects
                            UNIQUE (route, name) collision with 400 + {error: ...}
  GET    /views/{id}      — get one (404 if missing)
  PATCH  /views/{id}      — partial update; state_json REPLACED wholesale; route
                            is NOT patchable (intrinsic to view identity)
  DELETE /views/{id}      — 204 No Content (404 if missing)

Error contract — the app HTTPException handler emits {error: detail}, NOT
the FastAPI default {detail: ...}. Plan 03 tests must use r.json()["error"].
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.views import (
    SavedViewCreate,
    SavedViewListItem,
    SavedViewListResponse,
    SavedViewUpdate,
)
from cmc.core.time import now_utc
from cmc.db import get_session
from cmc.db.models.saved_views import SavedView

router = APIRouter(tags=["views"])

VIEW_CAP_PER_ROUTE = 50
"""Per-route cap on saved views. Enforced application-side in the POST handler.
ROADMAP.md Phase 25 success criterion 5; REQUIREMENTS.md milestone summary.
Single-user local product; race window is academic (Research Pitfall 5)."""


@router.get("/views", response_model=SavedViewListResponse)
async def list_views(
    route: str | None = Query(default=None, max_length=200),
    db: AsyncSession = Depends(get_session),
) -> SavedViewListResponse:
    """List saved views. Optional `route` filter; without it, returns ALL
    views across all routes (supports Cmd+K cross-route surfacing).

    Ordering: updated_at DESC (most-recently-touched first).
    """
    q = select(SavedView).order_by(SavedView.updated_at.desc())
    if route is not None:
        q = q.where(SavedView.route == route)
    rows = (await db.execute(q)).scalars().all()
    return SavedViewListResponse(
        items=[SavedViewListItem.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post("/views", response_model=SavedViewListItem, status_code=201)
async def create_view(
    payload: SavedViewCreate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    """Create a saved view. Enforces VIEW_CAP_PER_ROUTE application-side
    (count-then-insert; single-user race window is academic per Research
    Pitfall 5). UNIQUE (route, name) collisions return 400 via the
    IntegrityError translation below.
    """
    # 50-per-route cap (Pitfall 5: count-then-insert race acceptable in single-user)
    existing_count = (
        await db.execute(
            select(func.count(SavedView.id)).where(SavedView.route == payload.route)
        )
    ).scalar_one()
    if existing_count >= VIEW_CAP_PER_ROUTE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"saved view cap reached for route {payload.route!r} "
                f"(max {VIEW_CAP_PER_ROUTE})"
            ),
        )

    now = now_utc()
    view = SavedView(
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(view)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # UNIQUE (route, name) collision
        raise HTTPException(
            status_code=400,
            detail=(
                f"saved view with name {payload.name!r} already exists "
                f"on route {payload.route!r}"
            ),
        ) from exc
    await db.refresh(view)
    return SavedViewListItem.model_validate(view)


@router.get("/views/{view_id}", response_model=SavedViewListItem)
async def get_view(
    view_id: int,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    """Fetch a single saved view by id. 404 if missing."""
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    return SavedViewListItem.model_validate(row)


@router.patch("/views/{view_id}", response_model=SavedViewListItem)
async def patch_view(
    view_id: int,
    payload: SavedViewUpdate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    """Partial update. Only fields explicitly set are touched
    (model_dump(exclude_unset=True)). state_json is REPLACED wholesale on
    update (no deep merge). `route` is NOT in SavedViewUpdate so it can never
    be modified — view-to-route identity is intrinsic.

    Bumps `updated_at` on every successful patch. Rename collisions (renaming
    to a sibling's name on the same route) return 400 via IntegrityError.
    """
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")

    updates = payload.model_dump(exclude_unset=True)
    # Capture route BEFORE setattr loop so the error message survives a
    # rollback-induced expiry (SQLAlchemy expires attrs on rollback even when
    # the sessionmaker is configured expire_on_commit=False).
    row_route = row.route
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = now_utc()
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=(
                f"saved view name {payload.name!r} already exists "
                f"on route {row_route!r}"
            ),
        ) from exc
    await db.refresh(row)
    return SavedViewListItem.model_validate(row)


@router.delete("/views/{view_id}", status_code=204)
async def delete_view(
    view_id: int,
    db: AsyncSession = Depends(get_session),
) -> Response:
    """Delete a saved view by id. 204 No Content on success, 404 if missing.

    204 chosen over 200+{ok:true} for REST idiom and to match tasks.py:165-182.
    """
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)
