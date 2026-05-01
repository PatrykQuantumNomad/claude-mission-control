"""Test fake of stream-mode `claude` for DISP-06/07/08 tests.

Emits NDJSON events on stdout (one event per line, mirroring the production
stream shape). Reads NDJSON from stdin so the follow-up pump can echo a
user-message back into the stream.

Invocation contract (mirrors fake_claude_classic where applicable):
  argv: -p PROMPT [--output-format stream-json] [--input-format stream-json]
        [--verbose] [--include-partial-messages] [--model NAME]
        [--emit-decision BODY]      Emit DECISION: BODY then PAUSE on stdin
        [--emit-inbox BODY]         Emit INBOX: BODY (no pause)
        [--emit-fenced-decision]    Emit fenced ```DECISION``` (Pitfall 4 case)
                                    AND a real DECISION outside the fence
        [--emit-multi-marker]       Emit DECISION + INBOX in sequence
        [--exit-code N]             Exit with code N at end-of-stream
        [--print-pid-file PATH]     Write os.getpid() to PATH on first emit
        [--linger SECS]             After printing PID, sleep SECS before exit
        [--hang]                    Sleep 30s before exit

Emitted event shapes:
  Init:    {"type":"system","subtype":"init"}
  Text:    {"type":"assistant","message":{"role":"assistant","model":"...",
            "content":[{"type":"text","text":"..."}]},"session_id":"...","uuid":"..."}
  Result:  {"type":"result","subtype":"complete"}
"""

import argparse
import json
import os
import sys
import time
from typing import Any


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def assistant_text(text: str) -> dict[str, Any]:
    return {
        "type": "assistant",
        "message": {
            "role": "assistant",
            "model": "fake-claude",
            "content": [{"type": "text", "text": text}],
        },
        "session_id": "fake-session",
        "uuid": "fake-uuid",
    }


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("-p", dest="prompt", default="")
    parser.add_argument("--output-format", default="stream-json")
    parser.add_argument("--input-format", default="stream-json")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--include-partial-messages", action="store_true")
    parser.add_argument("--bare", action="store_true")
    parser.add_argument("--model", default="default")
    parser.add_argument("--emit-decision", default=None)
    parser.add_argument("--emit-inbox", default=None)
    parser.add_argument("--emit-fenced-decision", action="store_true")
    parser.add_argument("--emit-multi-marker", action="store_true")
    parser.add_argument("--exit-code", type=int, default=0)
    parser.add_argument("--print-pid-file")
    parser.add_argument("--linger", type=float, default=0.0)
    parser.add_argument("--hang", action="store_true")
    args, _unknown = parser.parse_known_args()

    if args.print_pid_file:
        with open(args.print_pid_file, "w") as f:
            f.write(str(os.getpid()))

    # init event
    emit({"type": "system", "subtype": "init"})

    if args.linger > 0:
        # Hold the process open briefly so the test can stat the parent's PID
        # file while the subprocess is still alive (Pitfall 10 verification).
        time.sleep(args.linger)

    if args.hang:
        time.sleep(30)
        return 0

    if args.emit_fenced_decision:
        # Pitfall 4 test: a fenced DECISION must be skipped; the outer one
        # ('real?') becomes a real Decision row.
        emit(assistant_text(
            "Some prose\n```\nDECISION: ignored?\n```\nDECISION: real?\n"
        ))
        # Pause on stdin so the test can flip the real decision before exit.
        try:
            for line in sys.stdin:
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if data.get("type") == "user":
                    break
        except (KeyboardInterrupt, BrokenPipeError):
            pass

    if args.emit_decision:
        emit(assistant_text(f"DECISION: {args.emit_decision}\n"))
        # Pause until stdin EOF or one user message arrives.
        try:
            for line in sys.stdin:
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if data.get("type") == "user":
                    break
        except (KeyboardInterrupt, BrokenPipeError):
            pass

    if args.emit_inbox:
        emit(assistant_text(f"INBOX: {args.emit_inbox}\n"))

    if args.emit_multi_marker:
        emit(assistant_text("DECISION: should I do A?\nINBOX: heads up about B\n"))

    emit({"type": "result", "subtype": "complete"})
    return args.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
