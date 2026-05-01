"""Telegram integration package. Plain-text only; do not use parse_mode.

Public API:
  - cmc.telegram.api          — httpx Bot API wrapper
  - cmc.telegram.messages     — plain-text formatters
  - cmc.telegram.dash_router  — callback_data dispatcher
  - cmc.telegram.plist_render — launchd plist renderer
  - cmc.telegram.notifier     — oneshot notifier loop
  - cmc.telegram.handler      — long-poll handler loop
"""
