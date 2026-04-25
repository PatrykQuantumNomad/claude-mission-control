"""SPA catch-all StaticFiles subclass.

Source pattern: 01-RESEARCH.md "Pattern 6: SPA Catch-All via Custom StaticFiles".

FastAPI's stock `StaticFiles(html=True)` only serves `index.html` for the root path.
Direct navigation to `/activity` or refreshing on `/skills` returns 404. This subclass
catches 404s on non-API paths and returns `index.html` so the SPA router can take over.

Mount AFTER all `/api/*` routers — FastAPI matches in registration order.

Notes (Pitfall 5 implementation details):
1. starlette.staticfiles raises `starlette.exceptions.HTTPException` (NOT
   `fastapi.HTTPException`). The latter is a subclass of the former, so we must
   catch the parent class to actually intercept 404s from StaticFiles.
2. `StaticFiles.directory` is stored as a `str`, not a `Path`. We wrap it with
   `Path(...)` before joining to avoid `TypeError: unsupported operand type(s)
   for /: 'str' and 'str'`.
"""
from __future__ import annotations

from pathlib import Path

from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as ex:
            if ex.status_code == 404:
                return FileResponse(Path(self.directory) / "index.html")
            raise
