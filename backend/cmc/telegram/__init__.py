"""Phase 9 telegram package. Plain-text only (Pitfall P3 — no parse_mode).

Public API:
  - cmc.telegram.api          — httpx Bot API wrapper
  - cmc.telegram.messages     — plain-text formatters
  - cmc.telegram.dash_router  — callback_data dispatcher
  - cmc.telegram.plist_render — launchd plist renderer
  - cmc.telegram.notifier     — oneshot notifier loop (Plan 09-02)
  - cmc.telegram.handler      — long-poll handler loop (Plan 09-03)
"""
