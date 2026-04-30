"""Test fake of `claude -p ...` for DISP-05 classic mode tests.

Invocation contract:
  argv: -p PROMPT [--bare] [--output-format json] [--model NAME] [--hang]
        [--exit-code N] [--print-pid-file PATH]
Behavior:
  - Default: write {"result": "ok", "prompt": PROMPT, "model": MODEL} to stdout, exit 0
  - --hang: sleep 30s before exit (test --timeout)
  - --exit-code N: exit with that code
  - --print-pid-file PATH: write os.getpid() to PATH then sleep 1, write JSON to stdout
    (Pitfall 10 verification — parent must have already written its own PID file)
"""

import argparse
import json
import os
import sys
import time


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("-p", dest="prompt", required=False, default="")
    parser.add_argument("--bare", action="store_true")
    parser.add_argument("--output-format", default="text")
    parser.add_argument("--model", default="default")
    parser.add_argument("--hang", action="store_true")
    parser.add_argument("--exit-code", type=int, default=0)
    parser.add_argument("--print-pid-file")
    args, _unknown = parser.parse_known_args()

    if args.hang:
        time.sleep(30)
        return 0

    if args.print_pid_file:
        # Verifies Pitfall 10 — at this moment the parent should have already
        # written the PID file via state.write_pid_file.
        with open(args.print_pid_file, "w") as f:
            f.write(str(os.getpid()))
        # Hold the process open briefly so the test can stat the parent's PID file.
        time.sleep(1.0)

    payload = {"result": "ok", "prompt": args.prompt, "model": args.model}
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()
    return args.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
