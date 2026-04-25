"""Phase 2 — Data Ingestion test suite.

Single test file per phase (Phase 1 convention). Each plan in Phase 2 appends
its INGST-* tests below the marker for that plan.

Sections:
  Plan 02-01 (this file's seed): settings sanity.
  Plan 02-02 (JSONL parser):       INGST-02, INGST-03, INGST-06 tests appended.
  Plan 02-03 (OTLP router):        INGST-07, INGST-08, INGST-09 tests appended.
  Plan 02-04 (scheduler/repo):     INGST-04, INGST-05 tests appended.
  Plan 02-05 (lifespan/manual):    INGST-01, INGST-10 tests appended.
"""
from __future__ import annotations


# ---- Plan 02-01: settings sanity ----

def test_phase2_settings_fields_present(test_settings):
    """Plan 02-01: confirm the three new settings fields exist with expected defaults.

    Downstream plans rely on these defaults; if a future change drops them,
    this test catches it before the dependent code breaks.
    """
    assert test_settings.session_idle_minutes == 5
    assert test_settings.otlp_max_body_bytes == 10_000_000
    # jsonl_root is a Path; default contains ".claude/projects"
    assert ".claude/projects" in str(test_settings.jsonl_root)
