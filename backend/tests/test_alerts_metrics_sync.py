"""ALRT-14 / ROADMAP success criterion 5 — KNOWN_METRICS drift guard.

The frontend FALLBACK_KNOWN_METRICS constant in AlertRuleForm.tsx is the
loading-window fallback while the useAlertMetrics() React Query is in flight.
If the backend dict and the frontend constant drift, the form briefly shows
incorrect options on first render. This test is the static-time guard.

Approach: read the TS file as text, regex-extract the metric `value` strings
from the FALLBACK_KNOWN_METRICS array literal, and assert set equality with
sorted(_SCOPE_EXTRACTORS.keys()).

This test is the second half of the sync mechanism. The first half is the
GET /api/alerts/metrics endpoint shipped in Plan 21-02 + the useAlertMetrics
hook in Plan 21-03 — runtime path. Together they close both holes (drift at
build time, drift at deploy time).
"""
from __future__ import annotations

import re
from pathlib import Path

from cmc.alerts.scopes import _SCOPE_EXTRACTORS


def _extract_frontend_metric_keys() -> set[str]:
    """Read AlertRuleForm.tsx and pull the `value: '...'` strings out of the
    FALLBACK_KNOWN_METRICS array literal.

    Anchored regex: only matches `value:` occurrences within the
    FALLBACK_KNOWN_METRICS const declaration to avoid catching unrelated
    `value:` props elsewhere in the file.
    """
    repo_root = Path(__file__).resolve().parents[2]
    tsx_path = (
        repo_root
        / "frontend"
        / "src"
        / "components"
        / "panels"
        / "AlertRuleForm.tsx"
    )
    src = tsx_path.read_text()

    # Capture the FALLBACK_KNOWN_METRICS array literal body. Tolerates either
    # 'KNOWN_METRICS' or 'FALLBACK_KNOWN_METRICS' const name (Plan 21-03 renames
    # the original; this regex matches either to keep the test forward-portable).
    block_re = re.compile(
        r"(?:FALLBACK_KNOWN_METRICS|KNOWN_METRICS)\s*[:=][^\[]*\[(.+?)\]",
        re.DOTALL,
    )
    block_match = block_re.search(src)
    assert block_match is not None, (
        "Could not find FALLBACK_KNOWN_METRICS array literal in "
        f"{tsx_path}. The cross-language drift guard requires this constant "
        "to remain in AlertRuleForm.tsx — if you renamed or moved it, update "
        "the regex above."
    )
    body = block_match.group(1)
    # Drop single-line `//`-comment lines BEFORE running the value regex —
    # otherwise a developer who comments out a metric to test drift locally
    # would still see the test pass (the value: '...' substring survives the
    # comment marker). Line-level filter is sufficient: the array literal
    # is one-entry-per-line by project convention; multi-line `/* ... */`
    # block comments inside the array body are not used.
    uncommented = "\n".join(
        line for line in body.splitlines() if not line.lstrip().startswith("//")
    )
    value_re = re.compile(r"value\s*:\s*['\"]([^'\"]+)['\"]")
    return set(value_re.findall(uncommented))


def test_known_metrics_match_scope_extractors():
    """KNOWN_METRICS drift guard — fails fast if backend or frontend changes
    the metric vocabulary without updating the other.
    """
    frontend = _extract_frontend_metric_keys()
    backend = set(_SCOPE_EXTRACTORS.keys())
    assert frontend == backend, (
        "KNOWN_METRICS drift between frontend FALLBACK_KNOWN_METRICS and "
        "backend _SCOPE_EXTRACTORS.\n"
        f"  Only in frontend: {sorted(frontend - backend)}\n"
        f"  Only in backend:  {sorted(backend - frontend)}\n"
        f"  Frontend full set: {sorted(frontend)}\n"
        f"  Backend full set:  {sorted(backend)}"
    )
