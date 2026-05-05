# Milestones: Claude Mission Control

Reverse-chronological log of shipped milestones. Each entry is a sentence-length record; full archives live under `.planning/milestones/`.

---

## v1.1 Skills & Cost Intelligence (Shipped: 2026-05-05)

**Delivered:** A read-time cost engine (5-SKU pricing table, never-store-$ window logic), the full skills observability suite (TopSkills, SkillCostCard, SkillLatencyTable, SkillTimeline, per-skill detail route), a hysteresis-aware skill-level alert engine with Telegram ack flow + auto-resolve, and a single-round-trip session comparison view with deep-linkable URL state and dual picker entry points (Cmd+K + sessions-table row action).

**Phases completed:** 12–17 (6 phases) — 28 plans total

**Key accomplishments:**

- **OTEL skill event spike (Phase 12):** Verbatim capture of `claude_code.skill_activated` shape from real ingest data; SPIKE.md with LOCK-1..9 + BUG-A/BUG-B anchors every downstream phase plan; negative finding (skill body fired, zero OTEL events) handled cleanly via TENTATIVE/CITED locks
- **Cost foundation + skill ingest (Phase 13):** `cmc.pricing.compute_cost` (Decimal-only, no float drift) + 5-SKU pricing table with `effective_from`/`effective_until` for self-correcting historical totals; single Alembic migration 0002 (`attrs_skill_name` indexed column + alert tables + cache TTL split + UNIQUE(session_id, otel_event_id) + BUG-B backfill); doctor checks 9–14 for pricing freshness/unpriced tokens/OTEL_LOG_TOOL_DETAILS
- **Skills observability suite (Phase 14):** 4 new skills endpoints (`/api/skills/usage` + `/api/skills/{name}/cost|latency|runs`) with Pattern 4 SQL CTEs; reactivated v1.0 placeholder panels (TopSkills closes ACTV-04, SkillCostCard closes SKLP-02); 3 new panels (SkillLatencyTable with low-sample badge, SkillTimeline live firehose, SkillRunsTable); first file-based dynamic route in the codebase (`/skills/$name`)
- **Alert engine + UI (Phase 15):** Hand-rolled threshold + EWMA z-score detector (stdlib `math` only, ~100 LOC); dispatcher hook in `heartbeat.py::run_one_cycle` after stamp_tick + e-stop; stable `dedup_key = f"alert:{rule_id}:{scope_key}"` reusing existing `notification_log` UNIQUE constraint; `cmc/telegram/callback_verbs.py` central StrEnum + `ack_alert` verb (sha256[:8] under 64-byte cap); `/alerts` page with 3 panels (rules CRUD list, discriminated-union form, events history); ALRT-12 invariant — alert engine NEVER imports `cmc.dispatcher.tasks`; project-wide `UTCDatetime` PlainSerializer (8 schemas / 37 fields)
- **Session comparison (Phase 16):** Single-round-trip `GET /api/sessions/compare?a=&b=` (≤9 SQL/request, 200-with-flag over-cap fallback at 500 tool calls); first `validateSearch` use in the codebase (hand-written UUID validator, no zod added); two-up `SessionCompareView` panel (KPI strip × 2 + recharts BarChart × 2 + skill-set diff + tool-counts DataTable); first `useRouterState({ select })` usage; ComparePicker Sheet drawer with self-compare guard; CMPR-05 hard-locked tabular-only (DevTools Sources scan: 0/43 scripts match diff/jsdiff/react-diff)
- **Polish, doctor, tests (Phase 17):** POLI-04 lifecycle assertion (1 decision + 1 notification_log per heartbeat tick); `parse_mode=` directory-wide CI grep guard for `cmc/telegram/`; CallbackVerb round-trip tests parametrized over enum; 2 new Playwright e2e specs (`alerts.spec.ts` create→fire→ack with async-trigger 35s polling + cleanup; `sessions-compare.spec.ts` exercises both picker entry points in sequence); README + `.env.example` docs updated with v1.1 panels + pricing seed workflow + OTEL spike summary

**Stats:**

- 666 files changed, +81,397 / -13,435 lines vs v1.0
- ~56,232 LOC at close (35,701 Python + 20,531 TypeScript/TSX) — up ~16,400 from v1.0
- 6 phases, 28 plans, 41 requirements (all shipped)
- 125 commits over 4 days (42 feat, 5 fix, 19 test, 58 docs)
- Backend tests 388+ → 552; frontend tests 234+ → 292; Playwright e2e 6 → 8 specs
- 4 days from v1.0 close to v1.1 ship (2026-05-02 → 2026-05-05)

**Git range:** `52ea94c` (refactoring Telegram for local testing) → `af6d308` (Phase 17 verifier passed 5/5)

**Tag:** `v1.1`

**Archives:**

- `.planning/milestones/v1.1-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.1-REQUIREMENTS.md` — 41 requirements with outcomes
- `.planning/milestones/v1.1-MILESTONE-AUDIT.md` — authoritative completion state (audited 2026-05-05, status: passed; 41/41 requirements, 6/6 phases, 9/9 integration, 6/6 flows)

**Outstanding human-verify items (non-blocking, carried to operations):**

- Apply Alembic migration 0002 to live `data/cmc.db` (auto-applies on next `cmc start` via lifespan)
- Phase 14 visual checkpoint per Plan 14-05 (operator-driven dashboard navigation)

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v2 backlog: SKLP-08..11 (per-project skill breakdown, period-over-period deltas, "new this week" badges, latency overhead), ANLY-06..07 (monthly cost forecast, per-project cost card), ALRT-13..14 (full anomaly detection, NL-authored alert rules), CMPR-06..07 (per-skill latency delta, "compare with previous" shortcut), PLAT-01 Linux/systemd support, AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies).

---

## v1.0 MVP (Shipped: 2026-04-28)

**Delivered:** A production-grade local dashboard and command centre for Claude Code at `localhost:8765` — ingests session JSONLs and OTEL telemetry, renders 21 observability/activity panels, runs a Mission Control task dispatcher with stream-mode DECISION/INBOX parsing, and pages over Telegram with full callback parity.

**Phases completed:** 1–11 (9 base + 2 audit gap-closure phases) — 47 plans total

**Key accomplishments:**

- FastAPI + SQLAlchemy 2.0 async + SQLModel + Alembic backend on SQLite WAL with 15-table schema, JSONL scraper (boot + 120s loop), and OTLP/HTTP `/v1/logs` + `/v1/metrics` ingest endpoints (always-200 contract)
- 50+ JSON API endpoints across system/sessions/observability/MCP/skills/HITL/tasks/schedules with PID-validated emergency stop, INSERT-OR-IGNORE decisions, and Haiku-backed natural-language → cron parser
- React + Vite + TanStack Router frontend with 21 panels (15 observability + 6 activity), full HITL command centre (decisions/inbox/task board/schedule composer), Cmd+K palette, framer-motion polish, and a dark theme matching Linear/Raycast/Vercel quality bar (visual quality bar approved by user)
- Mission Control Dispatcher: launchd 120s heartbeat with atomic task claim, classic + stream execution modes, fenced-code-aware DECISION/INBOX marker parsing, 3-task concurrency with autonomy gate, FollowUpPump for stdin injection, Haiku skill router, and PID-file safe emergency stop
- Telegram bridge: notifier (decisions/approvals/failures/overdue/inbox) + handler (long-poll, whitelisted users, callback dispatch via dash_router) with full Approve/Reject/Snooze parity and `answered_by='telegram'` audit-trail provenance
- Operational tooling: `install.sh` one-command installer, `cmc` CLI shim (renamed from `cc` to avoid `/usr/bin/cc`), `doctor.py` deterministic health check, BotFather + OTEL setup wizards, 4 launchd plists, and Playwright e2e suite (TEST-01..04, chromium-only, 6/6 passing)
- 388+ backend tests + 234+ frontend tests green at milestone close; v1.0 audit re-verified 148/148 requirements, 11/11 phases, 8/8 integration, 8/8 E2E flows

**Stats:**

- 745 files changed, 172,853 insertions across milestone
- 39,788 LOC (24,978 Python + 14,779 TypeScript/TSX)
- 11 phases (9 base + 2 gap closure), 47 plans
- 4 days from kickoff to ship (2026-04-25 → 2026-04-28)

**Git range:** `c743582` (initial commit) → `a771a0a` (Phase 11 verifier 9/9)

**Tag:** `v1.0`

**Archives:**

- `.planning/milestones/v1.0-ROADMAP.md` — full phase + plan history
- `.planning/milestones/v1.0-REQUIREMENTS.md` — 148 requirements with outcomes
- `.planning/milestones/v1.0-MILESTONE-AUDIT.md` — authoritative completion state (re-audited 2026-04-28, status: passed)

**What's next:** TBD — define via `/gsd:new-milestone`. Likely candidates from v2 backlog: ANLYT-01..03 (cost estimation, anomaly detection, session comparison), PLAT-01 Linux/systemd support, AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies), and resolution of v1 deferred items (ACTV-04/SKLP-02 functional skill panels once `claude_code.skill_invoked` OTEL event lands).

---
