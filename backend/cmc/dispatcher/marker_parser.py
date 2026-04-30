"""DISP-07 marker parser — fenced-code-aware DECISION/INBOX extractor.

Locked grammar (Phase 8 RESEARCH §6.7):
    ^\\s*(DECISION|INBOX):\\s+(.*\\S)\\s*$  on assistant text outside fenced code blocks.

Why these constraints (Pitfall 4 prevention):
- Line-start anchor (`^\\s*`) blocks inline backtick `DECISION: foo` mid-prose
  from being mistakenly treated as an agent marker.
- Fenced-code-aware (toggle on lines beginning with optional whitespace + ```)
  prevents an agent demonstrating marker syntax INSIDE a code example from
  triggering a real DB INSERT / API POST.
- Stateful chunk buffer: stream-mode deltas can split a marker across two
  chunks ("DECISI" + "ON: body"); we accumulate until the line is complete
  before parsing.

Public API:
    parser = MarkerParser()
    for marker in parser.feed_text(chunk_text):
        ...  # marker.kind in {'DECISION', 'INBOX'}, marker.body is stripped
    for marker in parser.flush():  # at end-of-stream
        ...

Pitfall: Always call `flush()` at end-of-stream to emit any final un-newlined
buffered marker line. Without it, a stream that ends mid-line (no trailing \n)
loses the last marker.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Literal

_DECISION_RE = re.compile(r"^\s*DECISION:\s*(?P<body>.*\S)\s*$")
_INBOX_RE = re.compile(r"^\s*INBOX:\s*(?P<body>.*\S)\s*$")
_FENCE_RE = re.compile(r"^\s*```")


@dataclass
class Marker:
    """One emitted marker. `body` is stripped of leading/trailing whitespace."""

    kind: Literal["DECISION", "INBOX"]
    body: str


class MarkerParser:
    """Stateful — call feed_text per chunk, flush at end-of-stream.

    Tracks `in_fence` boolean across deltas; suppresses markers inside fenced
    code blocks. Tracks `_buffer` so a marker spanning a chunk boundary is
    emitted correctly (e.g. 'DECISI' in chunk N + 'ON: body' in chunk N+1).
    """

    def __init__(self) -> None:
        self.in_fence: bool = False
        self._buffer: str = ""

    def feed_text(self, text: str) -> Iterator[Marker]:
        """Feed an assistant-text delta; yield zero or more markers.

        Lines (split on '\\n') are parsed in order; an incomplete trailing
        fragment stays in `_buffer` for the next call.
        """
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            yield from self._parse_line(line)

    def flush(self) -> Iterator[Marker]:
        """Emit any final buffered line; clear the buffer.

        Called once at end-of-stream so a marker without a trailing newline
        isn't lost.
        """
        if self._buffer:
            yield from self._parse_line(self._buffer)
            self._buffer = ""

    def _parse_line(self, line: str) -> Iterator[Marker]:
        if _FENCE_RE.match(line):
            self.in_fence = not self.in_fence
            return
        if self.in_fence:
            return
        m = _DECISION_RE.match(line)
        if m:
            yield Marker(kind="DECISION", body=m.group("body").strip())
            return
        m = _INBOX_RE.match(line)
        if m:
            yield Marker(kind="INBOX", body=m.group("body").strip())
