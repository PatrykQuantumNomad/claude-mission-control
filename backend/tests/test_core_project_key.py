"""Unit tests for cmc.core.project_key.compute_project_key.

Phase 19 (SKLP-08) — covers the invariants:
  - trailing-slash idempotence
  - None / empty -> '' sentinel (never raises)
  - 12-char lowercase hex output for non-empty inputs
  - deterministic same-input-same-output
  - non-existent path tail does not raise (Pitfall 5)
  - symlink canonicalization (real path and symlink path collide)

The helper is also exposed via `cmc.core.compute_project_key` re-export;
test that import shape too so refactors don't silently break callers.
"""
from __future__ import annotations

import hashlib
import os
import re

import pytest

from cmc.core.project_key import compute_project_key

_HEX12_RE = re.compile(r"^[0-9a-f]{12}$")


def test_trailing_slash_idempotent():
    assert compute_project_key("/tmp/x/") == compute_project_key("/tmp/x")


def test_none_returns_empty():
    assert compute_project_key(None) == ""


def test_empty_string_returns_empty():
    assert compute_project_key("") == ""


def test_returns_12_char_hex():
    out = compute_project_key("/some/example/project")
    assert len(out) == 12
    assert _HEX12_RE.match(out), f"expected 12-char lowercase hex, got {out!r}"


def test_deterministic():
    a = compute_project_key("/some/example/project")
    b = compute_project_key("/some/example/project")
    assert a == b


def test_nonexistent_path_does_not_raise():
    # Pitfall 5: realpath returns the input unchanged for components that
    # don't exist on disk; the function must still produce a 12-char hex
    # string and must never raise.
    out = compute_project_key("/this/path/does/not/exist/anywhere/at/all")
    assert len(out) == 12
    assert _HEX12_RE.match(out)


def test_symlink_canonicalized(tmp_path):
    """Symlink and target hash to the same project_key (canonical identity)."""
    real = tmp_path / "real_project"
    real.mkdir()
    link = tmp_path / "link_to_project"
    os.symlink(real, link)

    real_key = compute_project_key(str(real))
    link_key = compute_project_key(str(link))
    assert real_key == link_key


def test_reexport_via_cmc_core():
    """The function is importable via cmc.core (matches now_utc convention)."""
    from cmc.core import compute_project_key as reexported

    assert reexported is compute_project_key


def test_matches_inline_sha1_logic():
    """Sanity: output equals sha1(realpath(cwd.rstrip('/')))[:12].

    This is the same formula the migration 0003 backfill INLINES — the
    test pins the formula so a future refactor of the helper can't
    silently diverge from the migration's inlined version.
    """
    cwd = "/tmp/some/example/proj/"
    canonical = os.path.realpath(cwd.rstrip("/"))
    expected = hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:12]
    assert compute_project_key(cwd) == expected


@pytest.mark.parametrize(
    "missing",
    [None, ""],
)
def test_falsy_inputs_return_empty(missing):
    assert compute_project_key(missing) == ""
