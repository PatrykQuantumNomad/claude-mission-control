# Phase 25: Saved Views (Backend + Frontend) — Research

**Researched:** 2026-05-12
**Domain:** Backend SQLite+Alembic+FastAPI CRUD; frontend TanStack `validateSearch` adoption; AppShellHeader chrome wiring; Cmd+K group additions; sidebar pinned section; localStorage state.
**Confidence:** HIGH on every codebase-anchored claim (each fingerprint cites file:line). HIGH on stack/pattern recommendations (Radix versions installed, `validateSearch` reference at `routes/sessions_.compare.tsx`, `tasks.py` shape verified). MEDIUM on the 50-view-per-route enforcement location (POST-handler is the conventional place; no `CHECK` constraint precedent in this repo). MEDIUM on URL state divergence detection cheapness — TanStack normalizes search objects but stable structural equality on opaque JSON requires care.

## User Constraints (locked decisions)

No `25-CONTEXT.md` exists. Per orchestrator instruction, treat ROADMAP.md + REQUIREMENTS.md as Locked. There are no Claude's Discretion or Deferred Ideas sections; the locked set below is authoritative.

### Locked Decisions

**VIEW-01 — `validateSearch` adoption**
- Extend `validateSearch` to: `/`, `/activity`, `/skills`, `/skills/$name`, `/cost`, `/alerts`.
- `/sessions/compare` already has it (reference implementation; see `frontend/src/routes/sessions_.compare.tsx:32-38`).
- **Append-only schemas**: existing search params keep their existing shape; new params MUST default in a way that reproduces pre-change behavior (`docs/url-contract.md:21`).
- `schemaVersion` field on every route's search shape.

**VIEW-02 — `saved_views` SQLite table + Alembic migration `0004_saved_views`**
- Columns: `id`, `name`, `description`, `route`, `state_json`, `schema_version`, `created_at`, `updated_at`.
- Pattern mirrors `tasks.py` shape (see `backend/cmc/db/models/tasks.py`).
- One Alembic migration only (per REQUIREMENTS.md milestone constraint: "plus 1 Alembic migration (`0004_saved_views`)").

**VIEW-03 — 5 CRUD endpoints**
- `GET /api/views?route=<route>` (list filtered by route).
- `POST /api/views` (create).
- `GET /api/views/{id}` (retrieve single).
- `PATCH /api/views/{id}` (partial update).
- `DELETE /api/views/{id}` (204 No Content).
- Independently testable via curl + pytest BEFORE frontend wires up.

**VIEW-04 — SavedViewMenu mounted in `AppShellHeader`**
- Replaces the placeholder `<button data-testid="save-view-button">` (`frontend/src/components/shell/AppShellHeader.tsx:44-51`).
- Lists current-route's views; per-route filtering.
- Menu actions: open, set as default, edit/fork, delete.

**VIEW-05 — Save-view dialog**
- Name (required) + optional description.
- Captures current URL state into `state_json`.

**VIEW-06 — Per-route default-view affordance**
- localStorage pointer: route → saved view id.
- Querystring ALWAYS wins over default (deep link wins).

**VIEW-07 — Edit-vs-fork explicit semantics**
- AlertDialog prompts: save changes / save as new (fork) / discard.
- NO silent overwrite.

**VIEW-08 — Unsaved-changes pip indicator in chrome**
- Visible badge when current URL state diverges from loaded saved view.

**VIEW-09 — Recent ad-hoc states list**
- Last N URL states tracked in localStorage even if unsaved.
- Surfaced via Cmd+K.
- 50-state cap with FIFO eviction; user warning at cap.

**CMDK-01 — Saved Views group in Cmd+K**
- Open view by name (current route filtered first).
- Set as default, jump to view's URL.
- Reuses `useSavedViews(route)` from VIEW-04.

**SHEL-06 — Sidebar "Pinned" section**
- User-favorited saved views surfaced in sidebar.
- Depends on VIEW-04.
- One-click access from any route.

**Backend cap**
- 50 views per route, UI warning at cap (REQUIREMENTS.md milestone summary line).

**Opaque `state_json` storage**
- Backend stores `state_json` as opaque JSON — NO server-side validation of its shape.
- Validation happens client-side via the route's `validateSearch` on read.

**Stack additions**
- Zero new Python deps (REQUIREMENTS.md milestone constraint).
- Zero new frontend deps for this phase. The 3 baseline v1.3 deps (`@radix-ui/react-popover@1.1.15`, `@radix-ui/react-dropdown-menu@2.1.16`, `react-resizable-panels@4.11.0`) are scoped to Phase 24/28; Popover + DropdownMenu are already installed (`frontend/package.json:21,23`).

### Deferred Ideas (OUT OF SCOPE for Phase 25)

From ROADMAP.md Phase 26+:
- TIME-01..05 global time picker — Phase 26.
- CMDK-02..04 (density / time-range / recents-routes / recent-states-as-routes Cmd+K groups beyond CMDK-01) — Phase 26.
- SHEL-05 (Recently visited sidebar section) — Phase 26.
- LAYO-01..04 layout customization (panel show/hide, reorder, split-pane) — Phase 28. Layout state piggybacks on `state_json` (no new table) per ROADMAP.md line 65.
- TDBT-01..03 tech debt items — Phase 27.
- Per-route adoption of `BoundedPanelCard bounded` + density tokens on `/`, `/activity`, `/sessions/compare` — Phase 26.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-01 | `validateSearch` extension on 6 routes + `schemaVersion` | Reference impl at `sessions_.compare.tsx:32-38`; per-route delta in §Per-Route Search-Shape Delta below |
| VIEW-02 | `saved_views` table + `0004_saved_views` migration | Migration pattern at `migrations/versions/0003_project_key.py`; JSON column convention from `schedules.task_template` (`db/models/schedules.py:28-30`) |
| VIEW-03 | 5 CRUD endpoints | Routing pattern mirrored from `cmc/api/routes/tasks.py` (TASK-01..04 = list/create/patch/delete) |
| VIEW-04 | SavedViewMenu in `AppShellHeader` | Placeholder already present at `AppShellHeader.tsx:44-51`; `DropdownMenu` import pattern at `DensityToggle.tsx:22,43-77`; `.cmc-dropdown` styles ready at `styles.css:1998-2024` |
| VIEW-05 | Save-view dialog | Radix Dialog already installed (`@radix-ui/react-dialog@1.1.15`); reuse `Sheet.tsx` or build a small inline `Dialog`-based form |
| VIEW-06 | Per-route default — localStorage pointer | Typed wrapper `frontend/src/lib/storage.ts` provides `cmc.*` prefix |
| VIEW-07 | Edit-vs-fork AlertDialog | `AlertDialog` primitive exists at `frontend/src/components/ui/AlertDialog.tsx` — supports single action; need to extend or stack two AlertDialogs for the 3-way choice (see §Pitfall 4) |
| VIEW-08 | Unsaved-changes pip | URL state via `useSearch()` + stable structural equality vs loaded view (see §URL-State Divergence below) |
| VIEW-09 | Recent ad-hoc states (last N, FIFO 50-cap) | `lib/storage.ts` with FIFO array semantics |
| CMDK-01 | Saved Views group in Cmd+K | `CommandPalette.tsx:241-269` shows the `Command.Group heading` pattern; current-route reading at `CommandPalette.tsx:87-89` (`useRouterState`) |
| SHEL-06 | Sidebar Pinned section | `SidebarSection.tsx` exists with empty-body support (`Configure` is precedent — `Sidebar.tsx:133`) |

## Summary

Phase 25 is a thin-vertical feature that ships in three architecturally independent layers, each independently testable: (1) the backend (one Alembic migration + one SQLModel + one router + one schemas module + one pytest file — mirrors `tasks.py` exactly), (2) the per-route `validateSearch` adoption (6 routes, mechanically similar to `sessions_.compare.tsx`), and (3) the chrome (SavedViewMenu DropdownMenu, save dialog, edit/fork AlertDialog, unsaved pip, sidebar Pinned section, Cmd+K Saved Views group).

The codebase has every primitive needed: Radix DropdownMenu is already wired (`DensityToggle.tsx`), AlertDialog primitive exists (`AlertDialog.tsx`), the `cmc-dropdown` styles are in `styles.css`, localStorage is wrapped in `lib/storage.ts` with the `cmc.` prefix, the testid-registry ESLint rule already accepts the `save-view-button` placeholder, and the Phase 24 quality gates (axe-core, visual capture, URL contract, testid registry) are scoped to absorb new chrome.

**Primary recommendation:** Wave 1 lands the backend (migration + router + schemas + tests). Wave 2 lands the 6-route `validateSearch` adoption + schemaVersion + `useSavedViews(route)` hook. Wave 3 lands the chrome (SavedViewMenu, save dialog, edit-vs-fork AlertDialog, unsaved pip). Wave 4 lands the cross-cutting affordances (Cmd+K group, sidebar Pinned section, recent ad-hoc states VIEW-09, per-route default VIEW-06). See §Wave Breakdown for explicit `depends_on` rationale.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `saved_views` persistence (CRUD + 50-cap enforcement) | API / Backend (FastAPI + SQLite) | Database / Storage | Opaque blob storage with per-route uniqueness rules belongs server-side; cap is operationally a count-and-reject at write time |
| Route filter state (search params) | Browser / Client (TanStack Router) | — | URL is the source of truth; backend never reads `state_json` shape |
| Per-route default-view pointer | Browser / Client (localStorage) | — | Single-user local-only product; no need to persist server-side. Querystring wins over default per VIEW-06 |
| Recent ad-hoc states (VIEW-09) | Browser / Client (localStorage) | — | Ephemeral; FIFO with 50-cap; cross-route surfacing via Cmd+K |
| SavedViewMenu / save dialog / edit-vs-fork / pip | Frontend Server (React) | — | Chrome lives in AppShell; mounted once at root |
| Sidebar Pinned section state | Browser / Client (localStorage) | API / Backend | List of pinned view IDs is local; the view payloads themselves come from `GET /api/views/{id}` |
| Cmd+K Saved Views group | Browser / Client (React/cmdk) | API / Backend | Reuses `useSavedViews(route)` from VIEW-04 |
| `schemaVersion` enforcement | Browser / Client (per-route `validateSearch`) | — | Read-time validation only — backend stores opaque blob per VIEW-02 lock |

## Standard Stack

### Core (already installed — verified `frontend/package.json` + `backend/pyproject.toml`)

| Library | Version | Purpose | File |
|---------|---------|---------|------|
| FastAPI | 0.136.1 | Router framework | `backend/pyproject.toml:7` |
| Pydantic | 2.13.3 | Request/response schemas | `backend/pyproject.toml:9` |
| SQLAlchemy | 2.0.49 | ORM + async engine | `backend/pyproject.toml:11` |
| SQLModel | 0.0.38 | SQLModel.Field/Index/SQLModel base | `backend/pyproject.toml:12` |
| aiosqlite | 0.22.1 | Async SQLite driver | `backend/pyproject.toml:13` |
| Alembic | 1.18.4 | Migrations | `backend/pyproject.toml:14` |
| @radix-ui/react-dropdown-menu | 2.1.16 | SavedViewMenu trigger + items | `frontend/package.json:23` |
| @radix-ui/react-dialog | 1.1.15 | Save-view modal (or reuse `Sheet.tsx` wrapper) | `frontend/package.json:22` |
| @radix-ui/react-alert-dialog | 1.1.15 | Edit-vs-fork prompt | `frontend/package.json:20` |
| @radix-ui/react-popover | 1.1.15 | Available if a non-dropdown surface is preferred for the menu | `frontend/package.json:24` |
| @tanstack/react-router | 1.168.24 | `validateSearch`, `useSearch`, `useNavigate` | `frontend/package.json:29` |
| @tanstack/react-query | 5.100.5 | `useSavedViews` + mutations | `frontend/package.json:28` |
| cmdk | 1.1.1 | Cmd+K palette + `Command.Group` | `frontend/package.json:30` |
| lucide-react | 1.11.0 | Icons (Pin/Bookmark/Save/etc.) | `frontend/package.json:34` |
| @axe-core/playwright | 4.11.3 | a11y gate (POLI-10) | `frontend/package.json:44` |

### To Install

**Zero new deps for Phase 25.** Verified by milestone constraint (`REQUIREMENTS.md:12` — stack additions limited to the 3 v1.3 baseline deps already installed in Phase 24).

### Alternatives Considered

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| Hand-written `validateSearch` (no schema lib) | `zod` / `valibot` | Verified absent (`sessions_.compare.tsx:14-22` notes "NO zod, NO valibot ... verified absent from package.json"). Adding a schema dep here is unjustified surface; the existing reference is hand-written and stable. Append-only with `schemaVersion` is enforceable in plain TS. |
| One `Dialog` wrapper for save-view form | Inline `<form>` rendered in a `Sheet` panel | Repo's `Sheet.tsx` is already a thin Radix wrapper and is used for the existing compare-picker overlay (`CommandPalette.tsx:344-392`). The save-view dialog could use either; recommend a small purpose-built `SaveViewDialog` using `@radix-ui/react-dialog` directly to keep the size-of-Sheet-content disagreement off the table. Either is acceptable. |
| Stack two AlertDialogs for edit-vs-fork 3-way | Single Radix Dialog with 3 buttons + custom roles | `AlertDialog.tsx` is a 2-button (action + cancel) primitive. Three-way prompt needs either an extended primitive or a Radix Dialog with three buttons. Recommend a small new `EditOrForkDialog` based on `@radix-ui/react-dialog` so we preserve the 2-button contract of `AlertDialog.tsx`. See §Pitfall 4. |
| Server-side `state_json` schema validation | Opaque blob | LOCKED. VIEW-02 + ROADMAP success criterion 5: "opaque `state_json` validated only via route's `validateSearch` on read". Do not introduce Pydantic schemas for `state_json` shape. |

**Installation:** none required.

**Version verification:**
```bash
# All Phase 25 deps are already installed; no `npm view` step required.
```

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  ├─ AppShell (mounted at __root.tsx → AppShell.tsx)
  │   ├─ Sidebar (Sidebar.tsx)
  │   │   └─ [NEW] Pinned section (SHEL-06)
  │   │       └─ <SidebarSection title="Pinned"> → list of pinned views
  │   ├─ AppShellHeader (AppShellHeader.tsx)
  │   │   ├─ [NEW] SavedViewMenu (replaces save-view-button placeholder)
  │   │   │   └─ DropdownMenu listing route-filtered views
  │   │   │       └─ Items: Open • Set as default • Edit/Fork • Delete
  │   │   ├─ [NEW] UnsavedPip (badge next to SavedViewMenu trigger)
  │   │   ├─ DensityToggle, ThemeToggle (existing)
  │   │   └─ cmdk-trigger (existing)
  │   ├─ CommandPalette (CommandPalette.tsx)
  │   │   └─ [NEW] <Command.Group heading="Saved Views"> (CMDK-01)
  │   │       └─ current-route filtered first, then other-route views
  │   └─ <Outlet /> → route component
  │       └─ Route.useSearch() reads validated search (incl. schemaVersion)
  │
  ├─ [NEW] useSavedViews(route) — TanStack Query hook
  │   ├─ GET /api/views?route=<route>
  │   ├─ Mutations: useCreateView, usePatchView, useDeleteView
  │   └─ invalidate ['saved-views', route] on success
  │
  ├─ lib/storage.ts (existing typed wrapper, cmc.* prefix)
  │   ├─ [NEW] cmc.savedView.default.<route> → saved view id
  │   ├─ [NEW] cmc.savedView.pinned → string[] of view ids
  │   └─ [NEW] cmc.savedView.recent.<route> → array of opaque state objects (FIFO, cap=50)
  │
  └─ Per-route validateSearch (VIEW-01)
      ├─ index.tsx, activity.tsx, skills.tsx, skills_.$name.tsx, cost.tsx, alerts.tsx
      ├─ Each route's hand-written validator coerces unknown raw → typed Search shape
      └─ Each shape includes schemaVersion: number (default 1)

Backend (FastAPI)
  │
  ├─ POST/GET/PATCH/DELETE /api/views[/{id}]  (mirrors /api/tasks*)
  │   ├─ router: cmc/api/routes/views.py            ← NEW
  │   ├─ schemas: cmc/api/schemas/views.py          ← NEW
  │   ├─ model: cmc/db/models/saved_views.py        ← NEW (registered in db/models/__init__.py)
  │   ├─ session dep: cmc.db.get_session (existing)
  │   └─ 50-per-route cap enforced in POST handler  ← see Pitfall 5
  │
  ├─ SQLite (file-based)
  │   └─ saved_views table (new)
  │       ├─ id, name, description, route, state_json (JSON), schema_version,
  │       │   created_at, updated_at
  │       ├─ Index: idx_saved_views_route on (route)
  │       └─ Optional: Index idx_saved_views_route_name on (route, name)
  │
  └─ Migration: backend/migrations/versions/0004_saved_views.py
      ├─ down_revision: "0003_project_key"
      ├─ revision: "0004_saved_views"
      └─ render_as_batch=True (env.py default for SQLite)
```

### Recommended file layout

```
backend/
├── cmc/
│   ├── api/
│   │   ├── routes/
│   │   │   └── views.py                     # NEW — 5 endpoints (CRUD)
│   │   └── schemas/
│   │       └── views.py                     # NEW — ViewCreate / ViewUpdate / ViewListItem / ViewListResponse
│   └── db/
│       └── models/
│           └── saved_views.py               # NEW — SavedView SQLModel
├── migrations/
│   └── versions/
│       └── 0004_saved_views.py              # NEW
└── tests/
    └── test_views_router.py                 # NEW

frontend/
├── src/
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShellHeader.tsx           # MODIFIED — drop placeholder, mount SavedViewMenu + UnsavedPip
│   │   │   └── Sidebar.tsx                  # MODIFIED — add Pinned section above Configure (or below Operate)
│   │   ├── savedviews/                      # NEW DIR
│   │   │   ├── SavedViewMenu.tsx            # NEW
│   │   │   ├── SaveViewDialog.tsx           # NEW
│   │   │   ├── EditOrForkDialog.tsx         # NEW (3-button Radix Dialog — not AlertDialog; see Pitfall 4)
│   │   │   ├── UnsavedPip.tsx               # NEW
│   │   │   └── PinnedViewsSection.tsx       # NEW (consumed by Sidebar)
│   │   └── ui/
│   │       └── CommandPalette.tsx           # MODIFIED — new Command.Group heading="Saved Views"
│   ├── lib/
│   │   ├── savedViews.ts                    # NEW — localStorage helpers (default pointer, pinned ids, recent states)
│   │   ├── searchSchemas.ts                 # NEW — schemaVersion=1 default + per-route Search types (re-exported by each route)
│   │   ├── queries.ts                       # MODIFIED — useSavedViews / useCreateView / usePatchView / useDeleteView
│   │   └── api.ts                           # MODIFIED — views.list/get/create/patch/delete + types
│   └── routes/
│       ├── index.tsx                        # MODIFIED — add validateSearch
│       ├── activity.tsx                     # MODIFIED — add validateSearch
│       ├── skills.tsx                       # MODIFIED — add validateSearch
│       ├── skills_.$name.tsx                # MODIFIED — add validateSearch
│       ├── cost.tsx                         # MODIFIED — add validateSearch
│       └── alerts.tsx                       # MODIFIED — add validateSearch (CostRange/AlertRange currently in localStorage; see §Per-Route Search-Shape Delta)
```

### Pattern 1: Backend table + model + migration (mirror `tasks`)

**What:** SQLModel-defined table, registered for autogen via `db/models/__init__.py`, hand-edited Alembic revision with stable id.
**When to use:** All persisted entities in this repo follow this exact shape. NEW tables get a new revision; ADD COLUMN gets a smaller revision (precedent: `0003_project_key.py`).
**Example (model):**

```python
# Source: shape mirrors backend/cmc/db/models/tasks.py:22-59 + JSON column from
# backend/cmc/db/models/schedules.py:28-30 (task_template JSON pattern).
# File: backend/cmc/db/models/saved_views.py  (NEW)
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, Index, SQLModel

from cmc.core.time import now_utc


class SavedView(SQLModel, table=True):
    __tablename__ = "saved_views"

    id: int | None = Field(default=None, primary_key=True)
    name: str
    description: str = Field(default="")
    route: str               # e.g. "/", "/activity", "/skills", "/skills/$name", "/cost", "/alerts", "/sessions/compare"
    state_json: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON, nullable=False)
    )
    schema_version: int = Field(default=1)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        Index("idx_saved_views_route", "route"),
    )
```

**Don't forget**: register in `backend/cmc/db/models/__init__.py` with `# noqa: F401` (the file's docstring warns: "Every model module MUST be imported here or `alembic revision --autogenerate` produces an empty migration", `db/models/__init__.py:3-6`).

### Pattern 2: Alembic migration `0004_saved_views.py`

**What:** Hand-edited revision mirroring `0003_project_key.py` shape — stable revision id, `down_revision: "0003_project_key"`, `render_as_batch=True` (configured in `migrations/env.py:34`).
**When to use:** Any new table in this repo.
**Example skeleton:**

```python
# Source: shape mirrors backend/migrations/versions/0003_project_key.py:1-98
# and the create_table pattern from 0001_initial.py:263-297.
# File: backend/migrations/versions/0004_saved_views.py  (NEW)
"""Add saved_views table.

Revision ID: 0004_saved_views
Revises: 0003_project_key
Create Date: 2026-05-12

Phase 25 (VIEW-02) — server-persisted per-route view state. state_json is
opaque to the backend; validation is the route's validateSearch on read.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0004_saved_views"
down_revision: str | None = "0003_project_key"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("route", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("state_json", sa.JSON(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.create_index("idx_saved_views_route", ["route"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("saved_views", schema=None) as batch_op:
        batch_op.drop_index("idx_saved_views_route")
    op.drop_table("saved_views")
```

### Pattern 3: FastAPI router (mirror `tasks.py`)

**What:** APIRouter with 5 handlers, `get_session` dep, `model_validate` on ORM rows, `exclude_unset=True` for PATCH, 204 for DELETE.
**When to use:** All new CRUD endpoints in this repo.
**Mount point:** `backend/cmc/api/routes/__init__.py` — add `views_router` to `all_routers()` (`backend/cmc/api/routes/__init__.py:36-57`). It goes under `/api` automatically.
**Error contract:** the app HTTPException handler emits `{error: detail}`, NOT FastAPI default `{detail: ...}`. Tests must read `r.json()["error"]` (precedent: `test_tasks_router.py:225`, `test_tasks_router.py:283`).
**Example skeleton (full handler set):**

```python
# Source: shape mirrors backend/cmc/api/routes/tasks.py end-to-end.
# File: backend/cmc/api/routes/views.py  (NEW)
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cmc.api.schemas.views import (
    SavedViewCreate,
    SavedViewListItem,
    SavedViewListResponse,
    SavedViewUpdate,
)
from cmc.db import get_session
from cmc.db.models.saved_views import SavedView

router = APIRouter(tags=["views"])

VIEW_CAP_PER_ROUTE = 50  # VIEW-09 milestone: "50-view-per-route cap" (REQUIREMENTS.md line 50, ROADMAP success criterion 5)


# VIEW-03 a — GET /api/views?route=...
@router.get("/views", response_model=SavedViewListResponse)
async def list_views(
    route: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_session),
) -> SavedViewListResponse:
    q = (
        select(SavedView)
        .where(SavedView.route == route)
        .order_by(SavedView.updated_at.desc())
    )
    rows = (await db.execute(q)).scalars().all()
    return SavedViewListResponse(items=[SavedViewListItem.model_validate(r) for r in rows], total=len(rows))


# VIEW-03 b — POST /api/views
@router.post("/views", response_model=SavedViewListItem, status_code=201)
async def create_view(
    payload: SavedViewCreate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    # 50-per-route cap enforcement — POST is the canonical place; SQLite has
    # no native CHECK-on-count primitive and there is no trigger precedent in
    # this repo. See §Pitfall 5 below.
    existing_count = (
        await db.execute(
            select(func.count(SavedView.id)).where(SavedView.route == payload.route)
        )
    ).scalar_one()
    if existing_count >= VIEW_CAP_PER_ROUTE:
        raise HTTPException(
            status_code=400,
            detail=f"saved view cap reached for route {payload.route!r} (max {VIEW_CAP_PER_ROUTE})",
        )

    now = datetime.now(UTC)
    v = SavedView(
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return SavedViewListItem.model_validate(v)


# VIEW-03 c — GET /api/views/{id}
@router.get("/views/{view_id}", response_model=SavedViewListItem)
async def get_view(view_id: int, db: AsyncSession = Depends(get_session)) -> SavedViewListItem:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    return SavedViewListItem.model_validate(row)


# VIEW-03 d — PATCH /api/views/{id}
@router.patch("/views/{view_id}", response_model=SavedViewListItem)
async def patch_view(
    view_id: int,
    payload: SavedViewUpdate,
    db: AsyncSession = Depends(get_session),
) -> SavedViewListItem:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")

    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(row, k, v)
    row.updated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(row)
    return SavedViewListItem.model_validate(row)


# VIEW-03 e — DELETE /api/views/{id}
@router.delete("/views/{view_id}", status_code=204)
async def delete_view(view_id: int, db: AsyncSession = Depends(get_session)) -> Response:
    row = (
        await db.execute(select(SavedView).where(SavedView.id == view_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="saved view not found")
    await db.delete(row)
    await db.commit()
    return Response(status_code=204)
```

### Pattern 4: Pydantic schemas (mirror `schemas/tasks.py`)

```python
# Source: shape mirrors backend/cmc/api/schemas/tasks.py:1-101
# File: backend/cmc/api/schemas/views.py  (NEW)
from typing import Any

from pydantic import BaseModel, Field

from cmc.api.schemas.common import ORMBase, UTCDatetime


class SavedViewListItem(ORMBase):
    id: int
    name: str
    description: str
    route: str
    state_json: dict[str, Any]
    schema_version: int
    created_at: UTCDatetime
    updated_at: UTCDatetime


class SavedViewListResponse(BaseModel):
    items: list[SavedViewListItem]
    total: int


class SavedViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    route: str = Field(min_length=1, max_length=200)
    state_json: dict[str, Any] = Field(default_factory=dict)
    schema_version: int = Field(default=1, ge=1)


class SavedViewUpdate(BaseModel):
    """All fields optional. state_json is replaced wholesale, NOT deep-merged."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    state_json: dict[str, Any] | None = None
    schema_version: int | None = Field(default=None, ge=1)
    # NOTE: `route` deliberately NOT patchable — a view's route is intrinsic to its
    # identity; renaming would silently move it between menu lists. If "move route"
    # becomes a UX, expose a separate explicit endpoint.
```

### Pattern 5: TanStack `validateSearch` with `schemaVersion`

**What:** Per-route hand-written validator that takes `Record<string, unknown>` and returns a typed Search shape. Existing reference is the only `validateSearch` user in the repo.
**When to use:** Every route in scope of VIEW-01.
**Example (reference):**

```typescript
// Source: frontend/src/routes/sessions_.compare.tsx:32-38 (existing reference)
type CompareSearch = { a?: string; b?: string }

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function validateSearch(raw: Record<string, unknown>): CompareSearch {
  const a = typeof raw.a === 'string' && UUID_RE.test(raw.a) ? raw.a : undefined
  const b = typeof raw.b === 'string' && UUID_RE.test(raw.b) ? raw.b : undefined
  return { a, b }
}

export const Route = createFileRoute('/sessions_/compare')({
  validateSearch,
  component: SessionComparePage,
})
```

**Phase 25 addition — `schemaVersion`:** every route's Search shape adds `schemaVersion: number` (default 1; never omitted in normalized output). Append-only evolution: bumping to 2 means a new field landed and old serialized states (in `state_json` blobs) must be best-effort-readable at v1.

```typescript
// Recommended convention for ALL six routes (and going forward, sessions/compare)
type IndexSearch = {
  schemaVersion: 1
  // Phase 25 lands NO new filters on `/`; the schema exists so future filters land additively.
}

function validateSearch(raw: Record<string, unknown>): IndexSearch {
  // schemaVersion always returns to 1 today; future versions branch on raw.schemaVersion
  return { schemaVersion: 1 }
}
```

### Pattern 6: Mount router + register model

```python
# Source: backend/cmc/api/routes/__init__.py:36-57 — add new router under /api.
def all_routers() -> list[APIRouter]:
    return [
        health_router,
        sync_router,
        mcp_router,
        sessions_router,
        observability_router,
        system_router,
        skills_router,
        context_router,
        cost_router,
        hitl_router,
        tasks_router,
        schedules_router,
        notifications_router,
        alerts_router,
        views_router,           # NEW — Phase 25 VIEW-03
    ]
```

```python
# Source: backend/cmc/db/models/__init__.py:24 (precedent: `Task` import)
from cmc.db.models.saved_views import SavedView  # noqa: F401   # NEW
```

### Anti-Patterns to Avoid

- **Server-side validation of `state_json`'s shape.** REQUIREMENT VIEW-02 + ROADMAP success criterion 5: opaque blob. Adding Pydantic schemas per route would couple the backend to UI iteration cadence and violate the lock.
- **Using `alembic revision --autogenerate` without hand-verifying.** Precedent: `0001_initial.py:18-23` documents manual edits over autogenerate. Hand-write the revision body; autogenerate is a starting point only.
- **Forgetting to register the new model in `db/models/__init__.py`.** Same module's docstring warns this produces an empty migration (`db/models/__init__.py:3-6`).
- **Reading `r.json()["detail"]` in pytest.** The app's exception handler emits `{error: detail}` not the FastAPI default. Precedent: `test_tasks_router.py:225,283`.
- **Calling `r.json()` on DELETE response.** 204 has no body; use `fetchVoid` on the frontend (`frontend/src/lib/api.ts:1024-1028`, `taskDelete:1343-1344`) and assert `r.text == ""` in pytest (`test_tasks_router.py:236-237`).
- **Renaming a route file or changing existing search-param shapes non-additively.** Locked at REQUIREMENTS.md line 9 and `docs/url-contract.md:21-24`. Every Phase 25 `validateSearch` addition must default to "old behavior".
- **Mounting SavedViewMenu OUTSIDE `AppShellHeader`.** VIEW-04 locks the mount point. The placeholder testid `save-view-button` is already pre-registered (`AppShellHeader.tsx:44-51`, `docs/testid-registry.md:16`).
- **Adding `data-testid="…"` without updating the registry.** ESLint rule `cmc/testid-registry-only` fails the build. Every new testid (SavedViewMenu items, save dialog inputs, pip badge, sidebar Pinned link slug, Cmd+K group items) MUST be added to `docs/testid-registry.md` in the same commit (`frontend/eslint-rules/testid-registry-only.cjs:1-19`, registry workflow at `docs/testid-registry.md:84-95`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL search-param state | Hand-rolled `window.location.search` parsing + setState | TanStack Router `validateSearch` + `Route.useSearch()` + `useNavigate({ search: (prev) => ... })` | Already the reference pattern at `sessions_.compare.tsx`; type-safe; coexists with browser history; the function-form `search:` setter avoids stale-closure infinite loops (Pitfall 4 in 16-RESEARCH.md, referenced at `CommandPalette.tsx:206-208`) |
| Modal dialog | Custom overlay/portal | `@radix-ui/react-dialog` (save-view) and `@radix-ui/react-alert-dialog` (extended for edit-vs-fork — see §Pitfall 4) | Already installed; Phase 24 z-index ladder respected; axe-core gate already covers Radix patterns |
| DropdownMenu | Custom popover with item navigation | `@radix-ui/react-dropdown-menu` v2.1.16 (precedent: `DensityToggle.tsx`) | Already installed; `.cmc-dropdown` + `.cmc-dropdown__item` styles ready at `styles.css:1998-2024`; keyboard nav, focus return, Esc-close all free |
| Command-palette group ordering | Custom filter logic | cmdk `<Command.Group heading="...">` + sort items by `route === currentRoute ? 0 : 1` | Existing groups in `CommandPalette.tsx:241-269` ("Pages", "Actions"); cmdk auto-filters by user input; current-route ordering is a one-line sort |
| FIFO bounded list for VIEW-09 | LRU cache lib | Plain `Array.prototype.unshift` + `.slice(0, 50)` in `lib/savedViews.ts` | List is tiny (50 entries) and serialized as JSON; localStorage round-trip is the bottleneck, not data structure |
| URL/search-object equality (for unsaved pip) | Hand-rolled deep comparison | `JSON.stringify(normalize(current)) === JSON.stringify(normalize(loaded.state_json))` after dropping `schemaVersion`-only diffs | TanStack's normalized search object has stable key ordering after `validateSearch`; structural compare is sufficient. See §URL-State Divergence Detection |
| Default-pointer storage | New context provider | `lib/storage.ts` typed wrapper — write `cmc.savedView.default.<route>` | Existing convention (`storage.ts:1-35`); avoids React context churn |
| Migration scaffolding | Custom SQL files | Alembic + `render_as_batch=True` (already configured in `migrations/env.py:34`) | Required for SQLite ALTER TABLE; precedent in every existing migration |

**Key insight:** The repo is now a "well-trodden trail" for this kind of feature. Every primitive on both sides is already installed and has a verified precedent in the codebase. The Phase 25 plan is more about composition + consistent application than novel design.

## Common Pitfalls

### Pitfall 1 — Forgetting to register `SavedView` in `db/models/__init__.py`

**What goes wrong:** `alembic revision --autogenerate` produces an empty body because `target_metadata = SQLModel.metadata` (`migrations/env.py:23`) is empty without the side-effect import.
**Why it happens:** Easy to skip when adding a new model file.
**How to avoid:** Add `from cmc.db.models.saved_views import SavedView  # noqa: F401` to `backend/cmc/db/models/__init__.py` BEFORE generating any migration content.
**Warning signs:** Generated upgrade body is `pass` or empty.

### Pitfall 2 — Migration body diverges from the SQLModel definition

**What goes wrong:** SQLModel adds a column but the hand-edited migration drops it; tests pass on a fresh DB (because `lifespan` runs `alembic upgrade head` before the model is read, `cmc/app/lifespan.py:100`) but fail on an upgraded DB.
**Why it happens:** Hand-editing the autogenerated revision can desync from the model.
**How to avoid:** Use the `test_migrations.py` pattern (`backend/tests/test_migrations.py:153-204`): apply migration to a tmp SQLite, then PRAGMA table_info to assert column presence + index_list for indexes. Add `test_0004_upgrade_from_0003` + `test_0004_downgrade_to_0003`.
**Warning signs:** `test_migrations.py` would catch this — make it part of Wave 1's must-haves.

### Pitfall 3 — Non-additive `validateSearch` change breaks deep links

**What goes wrong:** Adding a required field, or coercing an unknown value to a non-default, breaks the URL contract (REQUIREMENTS.md line 9).
**Why it happens:** Easy to make a field non-optional during the migration.
**How to avoid:** Every Phase 25 field MUST have a default that reproduces pre-Phase-25 behavior. Existing route filter state today is panel-internal via `useState + RangeToggle persistKey` (`AlertEventsList.tsx:80,98`, `CostByProjectCard.tsx:90,117`). Surfacing it in the URL is OK as long as the default arm renders the same thing.
**Warning signs:** `backend/tests/test_url_contract.py` already enforces route-file presence and doc coverage (`backend/tests/test_url_contract.py:86-111`). It does NOT yet enforce search-shape shape — add this verification in plan tests if scope allows.

### Pitfall 4 — `AlertDialog.tsx` is 2-button only; edit-vs-fork needs 3

**What goes wrong:** Using `AlertDialog.tsx` as-is for VIEW-07 forces a single-action surface; can't fit `save / save-as-fork / discard` as three primary buttons.
**Why it happens:** The existing primitive at `frontend/src/components/ui/AlertDialog.tsx:21-32` has `actionLabel: string` (single) + `cancelLabel: string`. Three options don't fit.
**How to avoid:** Two acceptable patterns: (a) build a new `EditOrForkDialog.tsx` directly on `@radix-ui/react-dialog` (already installed, `package.json:22`) with three buttons in the action row; (b) extend `AlertDialog.tsx` to accept an optional `secondaryAction: { label, onSelect }` slot. Recommend (a) — keeps `AlertDialog.tsx` semantically 2-button and isolates the 3-way logic in a saved-views-scoped component.
**Warning signs:** Phase 24 verified `AlertDialog.tsx` z-index + portal containment behavior; copying that pattern for `EditOrForkDialog` preserves the verified contract.

### Pitfall 5 — 50-per-route cap is racy without serialization

**What goes wrong:** Two concurrent POSTs both pass the count-check, both insert; final count = 51.
**Why it happens:** Application-level "count then insert" without a unique partial index or transactional row-lock.
**How to avoid:** This is a single-user local product (REQUIREMENTS.md line 14 "macOS-only single-user localhost"). Concurrent writes from the same operator are vanishingly rare. The pragmatic answer: enforce in the POST handler (as in Pattern 3 above) and accept the theoretical race. If the planner wants belt-and-suspenders, wrap the count+insert in a single `async with db.begin():` transaction (SQLAlchemy 2.0 async pattern). No precedent in this repo for SQLite triggers or `CHECK` constraints on row counts.
**Warning signs:** Operator sees N=51 in the menu and is told they can't save. Edge case; document the choice in 02-SUMMARY.md.

### Pitfall 6 — `state_json` round-trip fidelity

**What goes wrong:** Frontend saves `state_json = { range: "7d", sort: "asc", schemaVersion: 1 }`; backend stores it as opaque JSON; on load, the route's `validateSearch` strips an unknown field (e.g. operator deleted a feature) and `schemaVersion` is stale.
**Why it happens:** Saved views can outlive feature deprecations.
**How to avoid:** `validateSearch` is the gatekeeper. Unknown fields → ignore. `schemaVersion` bumps require best-effort backward-compat coercion in the validator. The blob is stored as-is server-side; the route is the source of truth for what's *meaningful*. Document this contract in each route's `validateSearch` comment block.
**Warning signs:** Saved view "opens" but the page renders defaults; user is confused. Surface `schemaVersion < currentVersion` as a soft warning in `SavedViewMenu` (UX nicety, not a Phase 25 must-have).

### Pitfall 7 — TanStack `useSearch()` returns the validated/normalized object, NOT the URL string

**What goes wrong:** The unsaved-pip (VIEW-08) is computed by comparing strings or stale references; pip flickers on every render.
**Why it happens:** `useSearch()` returns a new object reference even when the URL didn't change (depending on internal memoization).
**How to avoid:** Compare by stable-key-ordered JSON.stringify after dropping volatile fields. Use `useMemo` keyed on `JSON.stringify(current)` and `loadedView?.state_json` content hash. Consider stripping `schemaVersion` from both sides before compare so a v2-current vs v1-saved view doesn't always show as unsaved when only the version field differs (treat `schemaVersion` as metadata, not user-meaningful state).
**Warning signs:** Pip is always on even on freshly-loaded views.

### Pitfall 8 — Default view + querystring conflict

**What goes wrong:** User has set `/skills/$name` default view A; user clicks a deep link `/skills/foo?range=30d`; default loads first, then querystring overrides — flicker, or wrong rendering.
**Why it happens:** Order of operations matters: default must NEVER be applied when the URL is explicit.
**How to avoid:** Apply default ONLY when search params are empty (post-`validateSearch` normalization, excluding `schemaVersion`). Implement as a one-shot useEffect on route mount that checks `Object.keys(search).filter(k => k !== 'schemaVersion').length === 0` and only then `navigate({ search: defaultView.state_json })`.
**Warning signs:** Deep links sometimes render with default-view filters applied instead of the URL's.

### Pitfall 9 — Sidebar Pinned section breaks the active-route accent in collapsed mode

**What goes wrong:** Phase 24's active-route accent bar (`SidebarNavLink.tsx` via `activeProps`) doesn't apply to pinned-view links because they navigate via search params, not route changes.
**Why it happens:** `activeProps` matches on pathname; clicking a pinned view that goes to `/skills?savedView=42` is the same pathname `/skills`.
**How to avoid:** Decide UX explicitly: do pinned views light up when their route matches, or only when their full search-state matches? Recommend the latter — pinned-view item is "active" only when its `state_json` equals current URL search (same comparison as VIEW-08 pip).
**Warning signs:** Pinned section always shows current-route's pinned view as active even when filters differ.

### Pitfall 10 — `lifespan` runs `alembic upgrade head` on every boot

**What goes wrong:** Migration 0004 has a side effect (e.g. accidentally seeded data) that runs on every dev boot.
**Why it happens:** `cmc/app/lifespan.py:100` calls `command.upgrade(alembic_cfg, "head")` at startup — fine for schema-only DDL, dangerous for data-only ops.
**How to avoid:** Keep `0004_saved_views.upgrade()` to pure DDL (`op.create_table` + `op.create_index`). No data-seed steps in this migration. Pattern 2's skeleton is correct as-is.
**Warning signs:** Re-running `cmc start` produces non-idempotent behavior.

## Runtime State Inventory

This phase is NOT a rename/refactor/migration of existing data. The new `saved_views` table starts empty. **No runtime state inventory required.**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `saved_views` table is new | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

## Environment Availability

This phase has no new external dependencies (zero new Python deps per `REQUIREMENTS.md:12`; zero new frontend deps confirmed in §Standard Stack). All tooling needed (FastAPI, SQLite, Alembic, Playwright, Vitest, Pytest, axe-core, Lighthouse CI) was installed in earlier phases and is verified available by Phase 24's close.

Step skipped: no external dependencies introduced by Phase 25.

## Per-Route Search-Shape Delta

**Critical input for planner.** This table is what lets the planner size the per-route `validateSearch` adoption work.

| Route | Today (file + line) | Filter state that EXISTS in code | Where it lives today | What Phase 25 adds |
|-------|--------------------|----------------------------------|---------------------|---------------------|
| `/` | `routes/index.tsx:70` (no `validateSearch`) | None — purely composes panels | n/a | `{ schemaVersion: 1 }` only; future filters land additively |
| `/activity` | `routes/activity.tsx:53` (no `validateSearch`) | None at route level; panels manage their own ranges via `RangeToggle persistKey` | localStorage (`cmc.filter.*.range`) via `RangeToggle` | `{ schemaVersion: 1 }`; future opt-in filters per panel land additively. Existing localStorage persistKeys CAN stay (they're orthogonal to saved views; until a per-panel filter is hoisted into URL state, saved views simply won't capture it) |
| `/skills` | `routes/skills.tsx:101` (no `validateSearch`) | None at route level | Same as `/activity` — panel-internal | `{ schemaVersion: 1 }` |
| `/skills/$name` | `routes/skills_.$name.tsx:179` (no `validateSearch`; the `$name` param is a path-param, not search) | `SkillProjectsTable` `range='14d'` is hard-coded prop (`routes/skills_.$name.tsx:172`); `SkillLatencySnapshot` uses `'14d'` (`routes/skills_.$name.tsx:48`); `SkillRunsTable` reads from `useSkillRuns` |  Hard-coded literals | `{ schemaVersion: 1 }`. **Phase 25 success criterion 1 ("user saves filter combination on `/skills/$name`")** implies at minimum a `range` filter must live in URL. Recommend the planner consider adding `range` to the search shape for this route ONLY (other routes can remain `{ schemaVersion: 1 }`) to satisfy the demo path. This is the ONLY route where a meaningful new search field is implied by Phase 25's own success criteria. |
| `/cost` | `routes/cost.tsx:48` (no `validateSearch`) | `CostByProjectCard` `range='7d'` state with `persistKey='cost-by-project'` (`CostByProjectCard.tsx:90,117`); `CostForecastCard` no filter | localStorage via `RangeToggle persistKey` | `{ schemaVersion: 1 }` |
| `/alerts` | `routes/alerts.tsx:50` (no `validateSearch`) | `AlertEventsList` `range='7d'` with `persistKey='alert-events-range'` (`AlertEventsList.tsx:80,98`) | localStorage via `RangeToggle persistKey` | `{ schemaVersion: 1 }` |
| `/sessions/compare` | `routes/sessions_.compare.tsx:32-38` (`validateSearch` EXISTS) | `{ a?: string, b?: string }` (UUIDs) | URL search params | Add `schemaVersion: 1` (additive) |

**Per-route migration sizing for the planner:**
- 5 of 6 in-scope routes: minimal — just wrap `createFileRoute` with `validateSearch` returning `{ schemaVersion: 1 }`. ~10 LOC each, no panel changes.
- `/skills/$name`: slightly larger — add `range?: '7d' | '14d' | '30d'` to the search shape and thread it through `SkillCostCard` / `SkillProjectsTable` / `SkillLatencySnapshot` / `SkillRunsTable` props (currently hard-coded; the wiring already accepts a `range` prop). Estimate 20–40 LOC.
- `/sessions/compare`: 2-LOC change to add `schemaVersion: 1` to the existing validator.

**Aggregate scope:** the 6-route adoption is "wide but shallow" — primarily a paint job of `validateSearch` wrappers + a single non-trivial route. The planner should consider splitting this into one plan per route OR one plan that does all six together; given the shallowness, one plan covering all six is justified.

## URL-State Divergence Detection (for VIEW-08)

The pip needs to know: "Does the current URL state differ from the loaded saved view's `state_json`?"

**Recommended approach (HIGH confidence):**

```typescript
// Source: composition of patterns from CommandPalette.tsx (useRouterState pattern)
// and lib/storage.ts (typed storage). Reference equality fails because TanStack
// returns new object refs on rerenders; structural compare is required.
import { useRouterState } from '@tanstack/react-router'
import { useMemo } from 'react'

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj)
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`
  const o = obj as Record<string, unknown>
  // Strip schemaVersion before compare — treated as metadata, not user state.
  // See Pitfall 7.
  const keys = Object.keys(o).filter((k) => k !== 'schemaVersion').sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

function useUrlDivergesFromView(loadedView: SavedViewListItem | null): boolean {
  const search = useRouterState({ select: (s) => s.location.search })
  return useMemo(() => {
    if (!loadedView) return false
    return stableStringify(search) !== stableStringify(loadedView.state_json)
  }, [search, loadedView])
}
```

**Why not reference equality:** `useSearch()` and `useRouterState({ select })` return new references on internal router ticks. Verified by precedent in `CommandPalette.tsx:87-91` — the selector form is used to keep the subscription tight, but the returned object identity is not guaranteed across renders.

**Why structural compare on stringified output:** the search object after `validateSearch` is a flat record of primitive values (no functions, no Dates — Pydantic-style coercion happens server-side). JSON.stringify with stable key sort is O(n log n) on ~10 keys — trivially fast and unambiguous.

**Why strip `schemaVersion`:** a saved view at v1 should appear unmodified when the current route has bumped to `schemaVersion: 2` and the user hasn't changed anything else. Treat the version field as metadata.

## Wave Breakdown

Recommended for the planner. Each wave can run plans in parallel within the wave; downstream waves depend on upstream waves' artifacts.

### Wave 1 — Backend (independently testable; no frontend dependency)

| Plan | Scope | Files | Test gate |
|------|-------|-------|-----------|
| W1-A | SavedView SQLModel + `db/models/__init__.py` registration + `0004_saved_views.py` migration + `test_migrations.py::test_0004_upgrade_from_0003` + `test_0004_downgrade_to_0003` | `backend/cmc/db/models/saved_views.py`, `backend/cmc/db/models/__init__.py`, `backend/migrations/versions/0004_saved_views.py`, `backend/tests/test_migrations.py` (append cases) | `pytest backend/tests/test_migrations.py -k 0004` green |
| W1-B | Pydantic schemas (`SavedViewListItem` / `…Response` / `…Create` / `…Update`) | `backend/cmc/api/schemas/views.py` | Pydantic import smoke test |
| W1-C | Router (5 handlers) + mount in `routes/__init__.py:all_routers()` + 50-cap enforcement + factory in `tests/conftest.py` (`make_saved_view_row`) + `tests/test_views_router.py` (curl-equivalent: list/create/get/patch/delete/cap-rejection/route-filtering) | `backend/cmc/api/routes/views.py`, `backend/cmc/api/routes/__init__.py`, `backend/tests/conftest.py`, `backend/tests/test_views_router.py` | `pytest backend/tests/test_views_router.py` green; manual `curl` against running `cmc start` returns 5 expected shapes |

**Wave 1 depends on:** Phase 24 complete (already true — `cmc/app/lifespan.py:100` runs alembic upgrade, `cmc/db/get_session` available).
**Wave 1 produces:** working CRUD + 50-cap; nothing wired in frontend.
**Wave 1 gate:** backend test count up by N (~10–15 cases); manual curl smoke verified by operator before Wave 3 chrome lands. Per success criterion 5 ("5 CRUD endpoints pass independently via curl + pytest before frontend wires").

### Wave 2 — Frontend foundations (depends on Wave 1 for live endpoints; can begin design once Wave 1 schemas are stable)

| Plan | Scope | Files | Test gate |
|------|-------|-------|-----------|
| W2-A | `validateSearch` adoption on 5 routes ( `/`, `/activity`, `/skills`, `/cost`, `/alerts` ) + `schemaVersion: 1` on `/sessions/compare` | 6 route files | `pnpm test:e2e -- routes.spec.ts` green; `test_url_contract.py` still green (no route renames) |
| W2-B | `/skills/$name` `validateSearch` with `range` filter threaded through panels | `frontend/src/routes/skills_.$name.tsx`, `frontend/src/components/panels/SkillCostCard.tsx` (verify it already accepts `range` prop), `SkillProjectsTable.tsx`, `SkillRunsTable.tsx` | Vitest covers per-panel range prop; e2e covers deep-link load |
| W2-C | `lib/api.ts` views client + `lib/queries.ts` `useSavedViews` / `useCreateView` / `usePatchView` / `useDeleteView` + cache invalidation `['saved-views', route]` | `frontend/src/lib/api.ts`, `frontend/src/lib/queries.ts` | Vitest stub for hooks; type-check passes |
| W2-D | `lib/savedViews.ts` localStorage helpers (default pointer, pinned ids, recent states FIFO 50-cap) | `frontend/src/lib/savedViews.ts`, `frontend/src/lib/__tests__/savedViews.test.ts` | Vitest covers FIFO eviction + cap warning |

**Wave 2 depends on:** Wave 1 endpoints live (W2-C needs the API surface to type against).
**Wave 2 produces:** typed hooks + URL search shapes + persistent local pointer/pin/recent helpers; nothing visible in chrome yet.

### Wave 3 — Chrome (depends on Wave 2 hooks + types)

| Plan | Scope | Files | Test gate |
|------|-------|-------|-----------|
| W3-A | SavedViewMenu + UnsavedPip; replace the `save-view-button` placeholder in `AppShellHeader.tsx` | `frontend/src/components/savedviews/SavedViewMenu.tsx`, `…/UnsavedPip.tsx`, `frontend/src/components/shell/AppShellHeader.tsx`, `docs/testid-registry.md` (add testids) | Vitest mount + interaction; Playwright `v13-saved-views.spec.ts` (NEW) hits open/load |
| W3-B | SaveViewDialog (name + optional description; captures current `useSearch()` into `state_json`) | `frontend/src/components/savedviews/SaveViewDialog.tsx`, `docs/testid-registry.md` | Vitest form validation; Playwright create-and-reload roundtrip |
| W3-C | EditOrForkDialog (3-button Radix Dialog) wired to SavedViewMenu "Edit" + URL-divergence trigger | `frontend/src/components/savedviews/EditOrForkDialog.tsx`, `docs/testid-registry.md` | Vitest covers each branch; Playwright covers "modify → prompt → fork" |

**Wave 3 depends on:** Wave 2 (hooks/types). Phase 24's `AppShellHeader.tsx` placeholder + testid registry slot are already present.
**Wave 3 produces:** end-to-end save + load + edit-vs-fork on the route the user lands on.

### Wave 4 — Cross-cutting (depends on Wave 3 menu + dialog)

| Plan | Scope | Files | Test gate |
|------|-------|-------|-----------|
| W4-A | Cmd+K Saved Views group (CMDK-01) — current-route filtered first, then other routes | `frontend/src/components/ui/CommandPalette.tsx`, `docs/testid-registry.md` | Playwright `command-palette.spec.ts` extension |
| W4-B | Sidebar Pinned section (SHEL-06) — reads `cmc.savedView.pinned` + fetches each pinned view via `useQueries` or `useSavedViews(route)` and filtering | `frontend/src/components/savedviews/PinnedViewsSection.tsx`, `frontend/src/components/shell/Sidebar.tsx`, `docs/testid-registry.md` | Vitest mount + interaction; Playwright `v13-sidebar.spec.ts` extension covers pin/unpin → visible |
| W4-C | Per-route default-view affordance (VIEW-06) — localStorage pointer + cold-load apply when search-empty | `frontend/src/lib/savedViews.ts` (extend), one-shot useEffect in each route component OR shared hook | Vitest mount + interaction; Playwright cold-load test |
| W4-D | Recent ad-hoc states (VIEW-09) — track URL changes; expose via Cmd+K | `frontend/src/lib/savedViews.ts` (extend), `frontend/src/components/ui/CommandPalette.tsx` (extend) | Vitest covers FIFO + cap warning; Playwright covers route-change-then-Cmd+K visibility |

**Wave 4 depends on:** Wave 3 menu + Wave 2 hooks/types.
**Wave 4 produces:** all VIEW-* + CMDK-01 + SHEL-06 met.

### Wave 5 — Close gate (depends on Waves 1–4)

| Plan | Scope | Files | Test gate |
|------|-------|-------|-----------|
| W5-A | Phase 25 close gate: visual capture (`v13-visual-capture.spec.ts` matrix re-run); axe-core sweep including new SavedViewMenu + dialogs + Pinned section; testid registry updated; perf budget (Lighthouse CI re-run); `25-VISUAL-CHECK.md` operator verdict | `frontend/tests/e2e/v13-visual-capture.spec.ts` (re-run, may need new entries for menu open state), `frontend/tests/e2e/v13-a11y.spec.ts` (include saved-views surfaces), `docs/testid-registry.md`, `.planning/phases/25-saved-views-backend-frontend/25-VISUAL-CHECK.md` | Full e2e green; axe-core zero new violations; Lighthouse delta ≤ 0; operator verdict PASS |

**Wave 5 depends on:** everything.
**Wave 5 produces:** phase-close artifact.

## Code Examples

Verified patterns from the codebase. Every snippet cites a file:line.

### Pattern: TanStack Router `useRouterState({ select })`

```typescript
// Source: frontend/src/components/ui/CommandPalette.tsx:87-91
const location = useRouterState({ select: (s) => s.location })
const isOnCompareRoute = location.pathname === '/sessions/compare'
const search = (location.search ?? {}) as Record<string, unknown>
```

### Pattern: TanStack Router function-form `search:` setter (no stale-closure)

```typescript
// Source: frontend/src/components/ui/CommandPalette.tsx:213-219
navigate({
  to: '/sessions/compare',
  search: (prev: Record<string, unknown>) => ({
    ...prev,
    b: chosenSid,
  }),
})
```

### Pattern: cmdk `Command.Group heading="..."`

```tsx
// Source: frontend/src/components/ui/CommandPalette.tsx:241-269
<Command.Group heading="Pages" className="cmc-cmdk__group">
  <Command.Item
    onSelect={() => { navigate({ to: '/' }); close() }}
    className="cmc-cmdk__item"
  >
    Command
  </Command.Item>
  …
</Command.Group>
```

### Pattern: TanStack Query mutation + cache invalidation

```typescript
// Source: frontend/src/lib/queries.ts:680-689 (useCreateTask precedent)
export function useCreateView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SavedViewCreate) => api.viewCreate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saved-views'] })
    },
  })
}
```

### Pattern: `fetchVoid` for 204 No Content

```typescript
// Source: frontend/src/lib/api.ts:1343-1344 + 1024-1028
taskDelete: (id: number) =>
  fetchVoid(`/api/tasks/${id}`, { method: 'DELETE' }),
// Analog:
viewDelete: (id: number) =>
  fetchVoid(`/api/views/${id}`, { method: 'DELETE' }),
```

### Pattern: Radix DropdownMenu (saved-view menu structure)

```tsx
// Source: frontend/src/components/shell/DensityToggle.tsx:43-77 (full pattern)
<DropdownMenu.Root>
  <DropdownMenu.Trigger asChild>
    <button
      type="button"
      className="cmc-density-toggle"
      data-testid="saved-view-menu-trigger"   // NEW testid — must register
      aria-label="Saved views"
    >
      <Bookmark size={16} aria-hidden />
    </button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content className="cmc-dropdown" sideOffset={6} align="end">
      {views.map((v) => (
        <DropdownMenu.Item
          key={v.id}
          data-testid={`saved-view-item-${v.id}`}   // dynamic pattern — register
          onSelect={() => navigate({ search: v.state_json })}
          className="cmc-dropdown__item"
        >
          {v.name}
        </DropdownMenu.Item>
      ))}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

### Pattern: localStorage with `cmc.` prefix

```typescript
// Source: frontend/src/lib/storage.ts:9-35
import { storage } from '../lib/storage'

storage.set(`savedView.default.${route}`, viewId)
const id = storage.get<number>(`savedView.default.${route}`)
```

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Panel-internal filter state via `useState + RangeToggle persistKey` (localStorage) | Phase 25 hoists *some* state into URL via `validateSearch` (additive, default = previous behavior) | Phase 25 | Existing panels keep their persistKey behavior; new saved views capture whatever IS in the URL. Future work (Phase 28 LAYO-*) extends `state_json` to layout overrides without a new table |
| 2-button Radix AlertDialog only | 3-button purpose-built `EditOrForkDialog` for VIEW-07 | Phase 25 | `AlertDialog.tsx` stays 2-button (no API change). `EditOrForkDialog.tsx` is a new sibling on top of `@radix-ui/react-dialog` |
| No `schemaVersion` on URL search shape | `schemaVersion: 1` is mandatory on every Phase 25 route | Phase 25 | Enables append-only schema evolution per `docs/url-contract.md:24` |
| No persisted view server-side | `saved_views` SQLite table — first server-persisted view-shape in repo | Phase 25 | New table; new router; opaque blob storage; mirrors `tasks` pattern |
| Phase 24 placeholder `save-view-button` (display:none) in AppShellHeader | Replaced by real SavedViewMenu | Phase 25 W3-A | Placeholder removal is part of W3-A; testid stays in registry as a real testid |

**Deprecated/outdated:** none. Phase 25 is fully additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `state_json` is replaced wholesale on PATCH, NOT deep-merged | §Pattern 4 SavedViewUpdate | Low — backend lock is "opaque blob"; deep-merge would be a frontend convenience layer. If the operator wants deep-merge, planner can extend the PATCH schema later without a migration |
| A2 | 50-per-route cap enforcement in POST handler is the right place (no SQLite trigger / CHECK) | §Pitfall 5, §Pattern 3 | Low — single-user local product; race window is theoretical. If the operator wants iron-clad, the planner can wrap in a single async transaction |
| A3 | `EditOrForkDialog` should be a new Radix Dialog component, not an extended `AlertDialog.tsx` | §Pitfall 4 | Medium — alternative is to extend `AlertDialog.tsx` with a `secondaryAction` slot. The planner can choose either; both preserve Phase 24's z-index + portal contract |
| A4 | `schemaVersion: 1` should be stripped before URL-state divergence comparison | §URL-State Divergence Detection, §Pitfall 7 | Low — purely cosmetic. If operators prefer "any schema diff = unsaved", remove the strip step |
| A5 | `/skills/$name` is the ONLY route where the planner should add a meaningful new search field (`range`) to satisfy success criterion 1 | §Per-Route Search-Shape Delta | Medium — if the operator wants OTHER routes to demonstrate saved-view utility immediately (e.g., `/cost` with `range`), the planner can hoist additional fields. Keep additive |
| A6 | Sidebar Pinned section should display its active accent only when full search state matches loaded view, not just pathname | §Pitfall 9 | Low — UX nicety. Default to "pathname match only" is also acceptable and simpler |

**If the operator wants to lock these:** running `/gsd:discuss-phase` against this RESEARCH.md would convert them into CONTEXT.md decisions before plans land.

## Open Questions

1. **Should `name` be UNIQUE per `(route, name)`?**
   - What we know: REQUIREMENTS.md / ROADMAP don't specify. The current `tasks` table has no uniqueness on title. Without uniqueness, two views can share a name on the same route, which is confusing in the menu but recoverable.
   - What's unclear: operator preference. Adding `UniqueConstraint("route", "name", name="uq_saved_views_route_name")` is cheap and prevents the confusing state.
   - Recommendation: **Add the unique constraint.** Reject duplicate names with 409 Conflict. Document explicitly in the migration. Cost: one extra `UniqueConstraint` + one extra pytest case. Benefit: prevents a class of UX bugs cheaply.

2. **Should `lifespan` auto-prune views beyond the 50-cap on boot, or always enforce only at write?**
   - What we know: cap is at-write only per current pattern.
   - What's unclear: whether stale data above-cap (from a future schema change that lowered the cap, or a hand-edited DB) should auto-prune.
   - Recommendation: write-only enforcement. Don't add boot-time pruning — too magical for single-user.

3. **Should the Cmd+K Saved Views group respect the `validateSearch` `schemaVersion` mismatch (warning if loading a v1 view on a v2 route)?**
   - What we know: §Pitfall 6 documents the round-trip caveat.
   - What's unclear: how loud the warning should be.
   - Recommendation: V1 — no warning, silent best-effort coercion. V2 (future) — soft inline warning when `view.schema_version < currentVersion`.

4. **Should pinned views appear in the sidebar in user-defined order, or default-sorted?**
   - What we know: SHEL-06 says "user-favorited", not ordered.
   - What's unclear: whether pin order matters.
   - Recommendation: default insertion order; expose drag-reorder in Phase 28 LAYO-02 if needed.

5. **Should `GET /api/views` (no `route=` filter) be added for cross-route surfacing in Cmd+K?**
   - What we know: VIEW-03 spec lists `GET /api/views?route=` (REQUIRED filter). CMDK-01 says "current route filtered first" implying ALL routes are surfaced.
   - What's unclear: implementation. Two paths: (a) frontend calls `GET /api/views?route=<each route>` for each known route and merges client-side; (b) backend accepts `route` as optional and returns all when absent.
   - Recommendation: **Backend accepts `route` as optional.** Cleaner one-call surface for Cmd+K. Two-line change: drop `min_length=1`, omit `where` when None. Document explicitly that `route=` absent → all views. Mirrors `tasks` list's optional filters (`tasks.py:67-72`).

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Backend | pytest 9.x + pytest-asyncio (existing); `backend/tests/conftest.py` provides `client` async fixture |
| Frontend unit | vitest 4.1.5 (existing) |
| Frontend e2e | Playwright 1.59.1 (existing) + @axe-core/playwright 4.11.3 (existing) |
| Config file | `backend/pyproject.toml:55-58` (pytest); `frontend/vitest.config.ts`; `frontend/playwright.config.ts` |
| Quick run | `cd backend && pytest backend/tests/test_views_router.py -x`; `cd frontend && pnpm test src/components/savedviews` |
| Full suite | `cd backend && pytest`; `cd frontend && pnpm test && pnpm test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-01 | All 6 routes accept `validateSearch` with `schemaVersion: 1`; no URL contract regression | e2e | `pnpm test:e2e -- routes.spec.ts` + `pytest backend/tests/test_url_contract.py` | Existing (`routes.spec.ts`, `test_url_contract.py`); extend existing file |
| VIEW-02 | `saved_views` table + `0004_saved_views` migration applies cleanly + downgrade reverses | pytest | `pytest backend/tests/test_migrations.py::test_0004_upgrade_from_0003 backend/tests/test_migrations.py::test_0004_downgrade_to_0003 -x` | NEW — extend `test_migrations.py` |
| VIEW-03 | 5 CRUD endpoints round-trip + 50-cap rejection | pytest | `pytest backend/tests/test_views_router.py -x` | NEW |
| VIEW-04 | SavedViewMenu mounts; per-route filter; menu actions present | vitest + e2e | `pnpm test SavedViewMenu` + `pnpm test:e2e -- v13-saved-views.spec.ts` | NEW |
| VIEW-05 | Save dialog captures current `useSearch()` into `state_json`; round-trip via API | e2e | `pnpm test:e2e -- v13-saved-views.spec.ts` (save → reload → load asserts URL state) | NEW |
| VIEW-06 | Per-route default applies on cold load when search-empty; querystring wins | e2e | `pnpm test:e2e -- v13-saved-views.spec.ts` (cold-load + deep-link cases) | NEW |
| VIEW-07 | Modifying loaded view triggers `EditOrForkDialog`; each branch acts | vitest + e2e | `pnpm test EditOrForkDialog` + e2e | NEW |
| VIEW-08 | Pip visible the moment `state_json !== current search`; hides when equal | vitest | `pnpm test UnsavedPip` | NEW |
| VIEW-09 | Recent ad-hoc states FIFO; warning at 50; eviction works | vitest | `pnpm test lib/savedViews` | NEW |
| CMDK-01 | Cmd+K Saved Views group lists views; current-route first; selection navigates | e2e | `pnpm test:e2e -- command-palette.spec.ts` (extend) | Existing spec — extend |
| SHEL-06 | Sidebar Pinned section renders pinned views; one-click navigation | vitest + e2e | `pnpm test PinnedViewsSection` + `pnpm test:e2e -- v13-sidebar.spec.ts` | Existing spec — extend |

### Sampling Rate

- **Per task commit:** `pytest backend/tests/test_views_router.py backend/tests/test_migrations.py -x` (~3–5s) + `pnpm test --run src/components/savedviews src/lib/__tests__/savedViews.test.ts` (~5s).
- **Per wave merge:** full backend pytest + full frontend vitest + targeted e2e specs (`v13-saved-views.spec.ts`, extensions to `command-palette.spec.ts` / `v13-sidebar.spec.ts`).
- **Phase gate:** full backend pytest + full frontend vitest + full Playwright e2e + axe-core sweep (existing `v13-a11y.spec.ts` already covers all 5 routes × 3 densities × 2 themes — verify no new violations).

### Wave 0 Gaps

- [ ] `backend/tests/test_views_router.py` — covers VIEW-03 fully. NEW file.
- [ ] `backend/tests/conftest.py` — add `make_saved_view_row` factory mirroring `make_task_row` (`backend/tests/conftest.py:641-690`). EXTEND.
- [ ] `backend/tests/test_migrations.py` — add `test_0004_upgrade_from_0003` + `test_0004_downgrade_to_0003`. EXTEND.
- [ ] `frontend/tests/e2e/v13-saved-views.spec.ts` — NEW e2e spec covering save/load/edit-vs-fork/pip end-to-end.
- [ ] `frontend/src/components/savedviews/__tests__/` — directory for vitest specs. NEW.
- [ ] `frontend/src/lib/__tests__/savedViews.test.ts` — FIFO + cap warning. NEW.

*(No framework installs required — every tool listed exists at the Phase 24 close baseline.)*

## Security Domain

`security_enforcement` is absent from `.planning/config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | NO | macOS-only single-user localhost (`REQUIREMENTS.md:14`) — no auth surface |
| V3 Session Management | NO | Same |
| V4 Access Control | NO | Same — no multi-tenancy |
| V5 Input Validation | YES | Pydantic for `name`/`description`/`route` (length-bounded `Field(max_length=200)`); JSON shape is intentionally opaque per VIEW-02 lock |
| V6 Cryptography | NO | No secret material introduced |

### Known Threat Patterns for FastAPI + SQLite + opaque-JSON-blob storage

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| SQL injection via `route` parameter | Tampering | Parameterized via SQLAlchemy `select().where()` — built-in (`select(SavedView).where(SavedView.route == route)`) |
| JSON injection / oversized blob in `state_json` | Tampering / DoS | Pydantic `dict[str, Any]` accepts arbitrary; consider a max byte size if the operator wants belt-and-suspenders. Single-user local makes DoS a non-threat in practice |
| Path traversal in `route` field | Tampering | `route` is stored as a string and never used as a filesystem path. Length-bounded via `max_length=200` |
| Information disclosure via 404 vs 403 differential | Information disclosure | 404 is the only failure mode (no auth) — no differential to exploit |
| URL parameter injection via `state_json` round-trip into another user's URL | Tampering | n/a — single-user; no other users |

**Recommendation:** No additional security controls beyond the standard Pydantic length-bounded fields. Document in 25-RESEARCH-conclusions if the operator wants a `state_json` size cap.

## CLAUDE.md Project Constraints

No `./CLAUDE.md` found at repo root. Project skills (`.claude/skills/` or similar) not detected. Constraints come solely from `REQUIREMENTS.md` and `ROADMAP.md`:

- Existing URLs / deep links preserved — TanStack route file renames, parent layout insertion, and non-additive `validateSearch` changes are forbidden (`REQUIREMENTS.md:9`, enforced by `backend/tests/test_url_contract.py`).
- Existing API contracts extend-not-break — new endpoints additive only; response shapes append-only (`REQUIREMENTS.md:10`).
- Backend pytest + frontend vitest + Playwright e2e stay green at every phase close (`REQUIREMENTS.md:11`).
- Stack additions limited to the 3 v1.3 baseline deps already installed + 1 Alembic migration `0004_saved_views`; zero Python deps added (`REQUIREMENTS.md:12`).
- macOS-only single-user localhost (no auth, no cloud, no outbound) (`REQUIREMENTS.md:14`).
- `data-testid` registry enforced by ESLint (`frontend/eslint-rules/testid-registry-only.cjs`, `docs/testid-registry.md`).
- z-index ladder respected by all overlay primitives (`docs/z-index-ladder.md`, ESLint `cmc/no-raw-z-index` rule).
- Skip count locked at 2 (`docs/testid-registry.md:78-81`).
- Visual checkpoint at `.planning/phases/25/VISUAL-CHECK.md` (POLI-09 pattern).
- axe-core sweep on all routes × densities × themes (POLI-10; `frontend/tests/e2e/v13-a11y.spec.ts`).

## Sources

### Primary (HIGH confidence — codebase verified)

- `backend/cmc/api/routes/tasks.py:1-294` — full CRUD router shape (mirror target for `views.py`)
- `backend/cmc/api/schemas/tasks.py:1-101` — request/response schemas pattern
- `backend/cmc/db/models/tasks.py:1-59` — SQLModel pattern
- `backend/cmc/db/models/schedules.py:13,28-30` — JSON column pattern (`task_template`)
- `backend/cmc/db/models/__init__.py:1-27` — model registration requirement
- `backend/cmc/db/session.py:1-22` — `get_session` async dep
- `backend/cmc/api/schemas/common.py:1-52` — `ORMBase`, `UTCDatetime`, `ErrorResponse`
- `backend/migrations/versions/0003_project_key.py:1-98` — migration shape
- `backend/migrations/versions/0001_initial.py:263-297` — `create_table` for tasks (verbose pattern)
- `backend/migrations/env.py:1-65` — async + `render_as_batch=True` for SQLite
- `backend/cmc/app/lifespan.py:100` — `alembic upgrade head` on startup
- `backend/cmc/api/routes/__init__.py:36-57` — `all_routers()` registry
- `backend/tests/conftest.py:309-373,641-690` — `client` async fixture + `make_task_row` factory
- `backend/tests/test_tasks_router.py:1-413` — pytest router-test conventions
- `backend/tests/test_migrations.py:153-232` — migration test pattern
- `backend/tests/test_url_contract.py:1-111` — URL contract enforcement
- `frontend/src/routes/sessions_.compare.tsx:1-73` — `validateSearch` reference
- `frontend/src/routes/index.tsx:1-71`, `routes/activity.tsx:1-53`, `routes/skills.tsx:1-101`, `routes/skills_.$name.tsx:1-182`, `routes/cost.tsx:1-49`, `routes/alerts.tsx:1-51` — 6 routes to extend
- `frontend/src/components/shell/AppShellHeader.tsx:1-65` — `save-view-button` placeholder mount point
- `frontend/src/components/shell/Sidebar.tsx:1-137` — sidebar IA + `Configure` empty-body precedent for `Pinned`
- `frontend/src/components/shell/SidebarSection.tsx:1-25` — section header pattern
- `frontend/src/components/shell/DensityToggle.tsx:1-79` — Radix DropdownMenu reference
- `frontend/src/components/ui/AlertDialog.tsx:1-86` — 2-button primitive (informs §Pitfall 4)
- `frontend/src/components/ui/CommandPalette.tsx:1-394` — Cmd+K group pattern + `useRouterState` + function-form `search:`
- `frontend/src/lib/storage.ts:1-35` — typed `cmc.*` localStorage wrapper
- `frontend/src/lib/density.ts:1-50`, `frontend/src/lib/sidebar.ts:1-41` — applied-on-boot localStorage patterns
- `frontend/src/lib/queries.ts:680-755` — TanStack Query mutation + invalidation patterns
- `frontend/src/lib/api.ts:1015-1364` — `fetchJson`/`fetchVoid` + verb conventions
- `frontend/package.json:18-42` — installed deps + versions
- `backend/pyproject.toml:5-46` — installed deps + versions
- `docs/url-contract.md:1-39` — preserved URL invariant
- `docs/testid-registry.md:1-95` — registry workflow + dynamic patterns
- `docs/z-index-ladder.md` (exists; referenced by `no-raw-z-index` ESLint rule)
- `docs/affordance-checklist.md` (exists)
- `frontend/eslint-rules/testid-registry-only.cjs:1-30` — testid enforcement
- `frontend/tests/e2e/v13-a11y.spec.ts:1-86` — axe-core gate matrix
- `.planning/REQUIREMENTS.md:1-100` — milestone constraints + VIEW-* requirement text
- `.planning/ROADMAP.md:1-100` — phase scope + success criteria + dependencies

### Secondary (MEDIUM confidence — single-source patterns or convention extrapolations)

- Phase 24 RESEARCH `.planning/phases/24-shell-density-containment-primitives/24-RESEARCH.md:1-120` — visual-gate + axe-core + Lighthouse policy that Phase 25 inherits
- Phase 24 Plan 04 `.planning/phases/24-shell-density-containment-primitives/04-PLAN.md:1-100` — chrome mount + testid registration pattern

### Tertiary (LOW confidence — none; every claim above traces to a cited file)

None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package + version verified in `package.json` / `pyproject.toml`; no new installs needed.
- Architecture: HIGH — every layer cites a verified precedent (tasks for backend; sessions/compare for validateSearch; DensityToggle for DropdownMenu; CommandPalette for cmdk group).
- Pitfalls: HIGH on pitfalls 1–4 + 6–10 (codebase- or contract-grounded); MEDIUM on pitfall 5 (50-cap race window is a one-line judgment call given single-user).

**Research date:** 2026-05-12
**Valid until:** 2026-06-11 (30 days — stable foundation; underlying patterns rarely change)

## RESEARCH COMPLETE

**Phase:** 25 — Saved Views (Backend + Frontend)
**Confidence:** HIGH

### Key Findings

- Backend is mechanically a clone of `cmc/api/routes/tasks.py` + a JSON column copied from `schedules.task_template`. Migration `0004_saved_views` follows `0003_project_key`'s shape. No new Python deps; zero novelty.
- Frontend `validateSearch` adoption is "wide but shallow": 5 of 6 routes are 10-LOC wrappers returning `{ schemaVersion: 1 }`. Only `/skills/$name` needs a meaningful new field (`range`) to satisfy success criterion 1.
- Every chrome primitive is already installed: Radix DropdownMenu (used by `DensityToggle`), AlertDialog, Dialog, Popover; `.cmc-dropdown` styles ready; `save-view-button` placeholder + testid pre-registered in `AppShellHeader.tsx`.
- VIEW-07's 3-way "save / fork / discard" prompt does NOT fit `AlertDialog.tsx` (2-button only). Build `EditOrForkDialog.tsx` on top of `@radix-ui/react-dialog` directly; keep `AlertDialog.tsx` unchanged.
- VIEW-08 unsaved-pip requires stable-key-sorted `JSON.stringify` comparison with `schemaVersion` stripped — TanStack reference-equality on `useSearch()` is not reliable across renders.
- 50-per-route cap is enforced application-side in the POST handler — no SQLite trigger/CHECK precedent in this repo, and single-user macOS-localhost (REQUIREMENTS.md line 14) makes the race window academic.

### File Created

`.planning/phases/25-saved-views-backend-frontend/25-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Every dep verified installed; zero new |
| Architecture | HIGH | Every layer cites a verified precedent in the repo |
| Pitfalls | HIGH | 8/10 pitfalls are codebase-grounded; 2/10 (50-cap race, sidebar-pinned active state) are minor UX judgment calls |
| Per-route delta | HIGH | Each route file read; existing filter state mapped |
| Wave breakdown | HIGH | Maps cleanly onto independently-testable success criteria (5 = backend curl/pytest; 1–4 = frontend Playwright) |

### Open Questions (planner should resolve in plans or escalate)

1. UNIQUE constraint on `(route, name)`? Recommendation: yes.
2. Backend `GET /api/views` (no `route=`) accepted for Cmd+K cross-route surfacing? Recommendation: yes — make `route` optional.
3. Build `EditOrForkDialog` as new component or extend `AlertDialog.tsx` with `secondaryAction`? Recommendation: new component.
4. Schema-version mismatch warning in SavedViewMenu? Recommendation: silent best-effort coercion in v1; warning in a future phase.
5. Pinned-view "active" state in sidebar — pathname match or full search match? Recommendation: full search match; falls back gracefully.
6. `/skills/$name` is the only route where the planner should hoist a meaningful filter (`range`) into the URL? Recommendation: yes — keeps phase scope tight while satisfying success criterion 1.

### Ready for Planning

Research complete. Planner can decompose Phase 25 into ~12 plans across 5 waves with explicit `depends_on` rationale (see §Wave Breakdown).
