"""POLI-02: directory-wide grep guard for parse_mode= in cmc/telegram/.

Extends Phase 9-01's narrow inspect.signature() guard at
test_telegram_units.py:15 to a directory-wide grep that catches the pattern
even if a future plan adds a NEW telegram-side function or call site that
sets parse_mode (which would not be caught by the existing per-signature
test).

The regex \\bparse_mode\\s*=(?!=) requires:
  - word-boundary before `parse_mode` (avoids matching `xxxparse_mode`)
  - optional whitespace before `=`
  - negative lookahead `(?!=)` so equality `==` doesn't match
Combined with comment-stripping (line.split("#", 1)[0]) the test allows
docstrings/comments to MENTION the term — only assignments / kwargs fail.

Rationale (Pitfall P3 from Phase 9 research): every Telegram message in CMC
is plain text. Adding parse_mode='Markdown' or similar to ANY send_message
call site silently swallows notifications when the message contains
Markdown-special chars (a real production bug observed in v0). This test
is the directory-wide net.
"""

from __future__ import annotations

import re
from pathlib import Path

TELEGRAM_DIR = Path(__file__).resolve().parent.parent / "cmc" / "telegram"
_PATTERN = re.compile(r"\bparse_mode\s*=(?!=)")


def test_no_parse_mode_assignments_in_telegram_pkg() -> None:
    """POLI-02 acceptance: cmc/telegram/ contains zero parse_mode= assignments.

    Comments/docstrings that MENTION the term are allowed (the project ships
    documentation explicitly forbidding parse_mode — that prose is the
    guard's audience, not its target).
    """
    bad: list[tuple[str, int, str]] = []
    for src in sorted(TELEGRAM_DIR.rglob("*.py")):
        for n, line in enumerate(src.read_text().splitlines(), start=1):
            stripped = line.split("#", 1)[0]
            if _PATTERN.search(stripped):
                bad.append((str(src.relative_to(TELEGRAM_DIR.parent)), n, line.strip()))
    assert bad == [], (
        "POLI-02: cmc/telegram/ must contain NO parse_mode= assignments. Found:\n"
        + "\n".join(f"  {p}:{n}: {ln}" for p, n, ln in bad)
    )
