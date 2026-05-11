"""POLI-13 — URL contract gate (Phase 24 Plan 05).

Enforces that every URL pattern documented in ``docs/url-contract.md`` still
has a corresponding TanStack Router route file, AND that every route file
on disk has a row in the docs table. New routes must be documented in the
same commit that adds them — preventing accidental URL drift between the
deployed surface and the documented contract.

``docs/url-contract.md`` is authored in plan 06 (Phase 24). Plan 05 ships
the test ahead of the docs; the tests **skip** when ``docs/url-contract.md``
is absent so plan 05 lands cleanly and merges in either order with plan 06.
Both tests transition from SKIP to PASS once plan 06 ships the docs.

TanStack Router file-name conventions handled by ``derive_route_urls``:

- ``index.tsx`` → ``/``
- ``foo.tsx`` → ``/foo``
- ``foo_.bar.tsx`` → ``/foo/bar`` (underscore-dot is the segment break per
  TanStack's "flat" routing convention)
- ``skills_.$name.tsx`` → ``/skills/$name`` (dynamic param notation
  preserved — the docs table uses the same ``$name`` form)
- ``__root.tsx``, ``routeTree.gen.ts`` are skipped.

If TanStack introduces additional segment markers (e.g. ``_layout.foo.tsx``
for nested layouts) the derivation will need updating — current Phase 24
route tree does not use them.
"""

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
URL_DOC = REPO_ROOT / "docs" / "url-contract.md"
ROUTE_DIR = REPO_ROOT / "frontend" / "src" / "routes"


def parse_doc_urls() -> set[str]:
    """Extract every backtick-quoted URL pattern from the docs table.

    The doc author is expected to render routes in a markdown table whose
    first column holds the URL pattern as ``` `/...` ``` (backtick-fenced).
    The regex is anchored to a leading pipe + whitespace + backtick so it
    matches the route column specifically and ignores backtick-fenced
    URLs that appear in prose paragraphs.
    """
    if not URL_DOC.exists():
        pytest.skip(
            "docs/url-contract.md missing — authored in plan 06 (Phase 24)"
        )
    text = URL_DOC.read_text()
    return set(re.findall(r"\|\s*`(/[\w$./-]*)`", text))


def derive_route_urls() -> set[str]:
    """Walk the TanStack Router file-based route tree.

    File-name conventions (see module docstring):
      - ``index.tsx`` → ``/``
      - ``foo.tsx`` → ``/foo``
      - ``foo_.bar.tsx`` → ``/foo/bar`` (underscore-dot segment break)
      - ``skills_.$name.tsx`` → ``/skills/$name`` (dynamic param)
      - ``__root.tsx``, ``routeTree.gen.ts`` are skipped.
    """
    urls: set[str] = set()
    if not ROUTE_DIR.exists():
        pytest.skip(f"Route dir {ROUTE_DIR} missing")
    for f in ROUTE_DIR.glob("*.tsx"):
        name = f.name
        if name.startswith("__") or name == "routeTree.gen.ts":
            continue
        stem = f.stem
        if stem == "index":
            urls.add("/")
            continue
        # Replace TanStack Router segment break (underscore-dot) with slash.
        # Then collapse any remaining dot separators (defensive — current
        # tree has none beyond ``_.``, but a future nested file like
        # ``foo.bar.tsx`` would also map cleanly).
        segment_path = stem.replace("_.", "/").replace(".", "/")
        urls.add("/" + segment_path)
    return urls


def test_url_contract_documented_routes_exist() -> None:
    """Every URL listed in docs/url-contract.md must have a route file."""
    documented = parse_doc_urls()
    actual = derive_route_urls()
    missing = documented - actual
    assert not missing, (
        f"Documented URLs missing from route tree: {sorted(missing)}\n"
        f"Routes derived from {ROUTE_DIR}: {sorted(actual)}"
    )


def test_url_contract_route_tree_is_documented() -> None:
    """Every route file on disk must have a row in docs/url-contract.md.

    Failure mode points at the missing doc entry, not at the route file —
    additive route growth is fine, but the docs MUST be updated in the
    same commit that adds the route so the contract stays accurate.
    """
    documented = parse_doc_urls()
    actual = derive_route_urls()
    undocumented = actual - documented
    assert not undocumented, (
        f"Routes in tree but not documented in docs/url-contract.md: "
        f"{sorted(undocumented)}\n"
        f"Add a row to the routes table in docs/url-contract.md."
    )
