"""TELE-01: BotFather setup wizard.

State machine (linear; each step exits 1 on failure with friendly stderr):
  1. prompt_token     — input bot token, validate via api.get_me
  2. prompt_chat_id   — input target chat_id (positive=user, negative=group)
  3. send_test_msg    — sendMessage("Mission Control connected")
  4. write_env        — append/update ~/.command-centre/.env
                         (or ./.env when running from repo root in dev)

Pitfall P8: atomic-write via tmp-in-same-dir + os.replace; never
os.rename across filesystems (would error on cross-FS).

Pitfall P10: chat_id stored as str so negative integers (group chats)
survive without overflowing Settings.telegram_chat_id (str type).

Security Domain V7: never echo the token to stdout after capture.

Exposed as `python -m cmc.cli.setup_telegram` and via the
scripts/setup_telegram.py shim.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

import httpx

from cmc.telegram import api


INSTALL_ENV = Path.home() / ".command-centre" / ".env"
DEV_ENV = Path.cwd() / ".env"

BOTFATHER_HELP = """
To get a bot token:
  1. Open Telegram → search for @BotFather → /start
  2. /newbot → name your bot → /<username>_bot
  3. Copy the token (looks like 1234567890:ABC...).

To get your chat_id:
  1. Send any message to your new bot.
  2. Open https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates in a browser.
  3. Find {"chat":{"id": <YOUR_CHAT_ID>}}.
"""


async def _validate_token(token: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        return await api.get_me(token, client=client)


async def _send_test(token: str, chat_id: str) -> int:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await api.send_message(
            token, chat_id, "Mission Control connected",
            client=client,
        )
    return int(res.get("message_id") or 0)


def _resolve_env_path() -> Path:
    """Return ~/.command-centre/.env when the install dir already exists,
    otherwise repo-root .env (dev mode). install.sh creates the install
    dir before invoking the wizard so production always lands here."""
    if INSTALL_ENV.parent.exists():
        return INSTALL_ENV
    return DEV_ENV


def _write_env(path: Path, token: str, chat_id: str, allowed: list[str]) -> None:
    """Idempotent merge: read existing keys, replace/insert TELEGRAM_*,
    write atomically.

    Pitfall P8: tmp file lives in the same directory as the final path so
    os.replace is a same-filesystem rename (atomic).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    existing: dict[str, str] = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, _, v = line.partition("=")
                existing[k.strip()] = v.strip()
    existing["TELEGRAM_BOT_TOKEN"] = token
    existing["TELEGRAM_CHAT_ID"] = chat_id
    existing["TELEGRAM_ALLOWED_USER_IDS"] = ",".join(str(x) for x in allowed)
    body = "\n".join(f"{k}={v}" for k, v in existing.items()) + "\n"
    # Tmp lives in the same dir → os.replace is atomic on same FS (Pitfall P8).
    tmp = path.parent / (path.name + ".tmp")
    tmp.write_text(body)
    os.replace(tmp, path)


def _prompt(prompt: str, *, default: Optional[str] = None) -> str:
    suffix = f" [{default}]" if default else ""
    v = input(f"{prompt}{suffix}: ").strip()
    return v or (default or "")


async def _amain() -> int:
    print("Mission Control — Telegram setup")
    print(BOTFATHER_HELP)

    # State 1: prompt_token + validate
    token = _prompt("Bot token (from @BotFather)")
    if not token:
        print("token required.", file=sys.stderr)
        return 1
    try:
        me = await _validate_token(token)
    except httpx.HTTPStatusError as exc:
        print(
            f"token validation failed (HTTP {exc.response.status_code}). "
            f"Check the token and retry.",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:
        print(f"token validation failed: {exc}", file=sys.stderr)
        return 1
    bot_label = me.get("username") or me.get("first_name") or "unknown"
    print(f"Bot @{bot_label} connected.")

    # State 2: prompt_chat_id (accepts negative for groups — Pitfall P10)
    chat_id = _prompt("Your chat_id (numeric — see help above)")
    try:
        int(chat_id)
    except ValueError:
        print("chat_id must be an integer.", file=sys.stderr)
        return 1
    if chat_id.startswith("-"):
        print(
            "warning: negative chat_id detected — group chats are not "
            "officially supported in v1."
        )

    # State 3: send_test
    try:
        msg_id = await _send_test(token, chat_id)
    except Exception as exc:
        print(f"test message failed: {exc}", file=sys.stderr)
        return 1
    print(f"test message sent (message_id={msg_id}). Check your Telegram.")

    # State 4: write_env
    env_path = _resolve_env_path()
    _write_env(env_path, token, chat_id, [chat_id])
    print(f"wrote {env_path}.")
    print("Next: `cc restart` to load the telegram daemons.")
    return 0


def main() -> None:
    sys.exit(asyncio.run(_amain()))


if __name__ == "__main__":
    main()
