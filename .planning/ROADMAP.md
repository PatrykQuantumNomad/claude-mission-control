# Roadmap: Claude Mission Control

## Milestones

- ✅ **v1.0 MVP** — Phases 1–11, 47 plans (shipped 2026-04-28) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Skills & Cost Intelligence** — Phases 12–17, 28 plans (shipped 2026-05-05) — see [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 Depth & Polish** — Phases 18–23, 22 plans (shipped 2026-05-09) — see [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md) — 12/12 active requirements complete + 1 honestly deferred (SKLP-11 → v1.3 per Phase 22 spike negative finding)
- ✅ **v1.3 Surface Redesign** — Phases 24–28, 42 plans (shipped 2026-05-17) — see [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md) — 45/45 active requirements complete, 13 Accepted Exceptions operator-acknowledged as forward-compatible tech debt

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–11) — SHIPPED 2026-04-28</summary>

- [x] Phase 1: Foundation & Database (7/7 plans) — completed 2026-04-25
- [x] Phase 2: Data Ingestion (6/6 plans) — completed 2026-04-26
- [x] Phase 3: Read-Only APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 4: Stateful APIs (5/5 plans) — completed 2026-04-26
- [x] Phase 5: Frontend Shell & Design System (4/4 plans) — completed 2026-04-27
- [x] Phase 6: Observability & Activity Panels (5/5 plans) — completed 2026-04-27
- [x] Phase 7: Command Centre Panels (4/4 plans) — completed 2026-04-27
- [x] Phase 8: Mission Control Dispatcher (4/4 plans) — completed 2026-04-27
- [x] Phase 9: Telegram, Setup & Testing (5/5 plans) — completed 2026-04-28
- [x] Phase 10: Telegram Wiring Fixes (gap closure, 1/1 plan) — completed 2026-04-28
- [x] Phase 11: v1.0 Documentation & Env Polish (gap closure, 1/1 plan) — completed 2026-04-28

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Skills & Cost Intelligence (Phases 12–17) — SHIPPED 2026-05-05</summary>

- [x] Phase 12: OTEL Skill Event Spike (2/2 plans) — completed 2026-05-02
- [x] Phase 13: Cost Foundation & Skill Ingest (6/6 plans) — completed 2026-05-03
- [x] Phase 14: Skills API & Page Panels (5/5 plans) — completed 2026-05-04
- [x] Phase 15: Alert Engine & UI (5/5 plans) — completed 2026-05-04
- [x] Phase 16: Session Comparison (4/4 plans) — completed 2026-05-05
- [x] Phase 17: Polish, Doctor & Tests (6/6 plans) — completed 2026-05-05

Full details: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Depth & Polish (Phases 18–23) — SHIPPED 2026-05-09</summary>

- [x] Phase 18: Polish & Carry-Forward Cleanup (5/5 plans) — completed 2026-05-05
- [x] Phase 19: Skills Per-Project, Deltas & Badges (4/4 plans) — completed 2026-05-06
- [x] Phase 20: Cost Forecast & Per-Project Card (4/4 plans) — completed 2026-05-06
- [x] Phase 21: Alert Anomaly Depth & NL Authoring (3/3 plans) — completed 2026-05-07
- [x] Phase 22: Skill Latency Overhead — spike-gated, NO branch (2/2 plans) — completed 2026-05-08
- [x] Phase 23: Compare Depth & Milestone Close (4/4 plans) — completed 2026-05-09

Full details: [milestones/v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)

</details>

<details>
<summary>✅ v1.3 Surface Redesign (Phases 24–28) — SHIPPED 2026-05-17</summary>

- [x] Phase 24: Shell + Density + Containment Primitives (7/7 plans) — completed 2026-05-12
- [x] Phase 25: Saved Views (Backend + Frontend) (11/11 plans) — completed 2026-05-12
- [x] Phase 26: Per-Route Adoption I (Command/Activity/Sessions) + Time + Cmd+K (9/9 plans) — completed 2026-05-13
- [x] Phase 27: Per-Route Adoption II (Skills/Cost/Alerts) + Tech Debt (9/9 plans) — completed 2026-05-16
- [x] Phase 28: Layout Customization (6/6 plans) — completed 2026-05-17

Full details: [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

### 📋 Next Milestone (Planned)

To be defined via `/gsd:new-milestone`. Likely candidates from v1.4+ backlog: LAYO-05 (full 2D grid via `react-grid-layout` — once GitHub Issue #2045 React 19.2 key-prop warnings resolve), ANLY-08/09 (forecast confidence band, per-project cost budgets bridging cost ↔ alerts), SKLP-11..13 (per-skill body/subagent/tool overhead — still gated on upstream OTEL data availability change; percentile-split; heatmap toggle), ALRT-15/16 (predictive alerts, NL2SQL — separate milestone candidate), CMPR-08/09 (sessions-table compare-with-previous, per-skill cost delta), PLAT-01 (Linux/systemd), AUTO-01..03 (NL schedules beyond cron, auto-retry, task dependencies).

## Progress

**Execution Order:** Phases execute in numeric order. Phase numbering is continuous across milestones (never restarts at 01).

| Phase | Milestone | Plans Complete | Status   | Completed  |
| ----- | --------- | -------------- | -------- | ---------- |
| 1. Foundation & Database | v1.0 | 7/7 | Complete | 2026-04-25 |
| 2. Data Ingestion | v1.0 | 6/6 | Complete | 2026-04-26 |
| 3. Read-Only APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 4. Stateful APIs | v1.0 | 5/5 | Complete | 2026-04-26 |
| 5. Frontend Shell & Design System | v1.0 | 4/4 | Complete | 2026-04-27 |
| 6. Observability & Activity Panels | v1.0 | 5/5 | Complete | 2026-04-27 |
| 7. Command Centre Panels | v1.0 | 4/4 | Complete | 2026-04-27 |
| 8. Mission Control Dispatcher | v1.0 | 4/4 | Complete | 2026-04-27 |
| 9. Telegram, Setup & Testing | v1.0 | 5/5 | Complete | 2026-04-28 |
| 10. Telegram Wiring Fixes (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 11. v1.0 Documentation & Env Polish (gap closure) | v1.0 | 1/1 | Complete | 2026-04-28 |
| 12. OTEL Skill Event Spike | v1.1 | 2/2 | Complete | 2026-05-02 |
| 13. Cost Foundation & Skill Ingest | v1.1 | 6/6 | Complete | 2026-05-03 |
| 14. Skills API & Page Panels | v1.1 | 5/5 | Complete | 2026-05-04 |
| 15. Alert Engine & UI | v1.1 | 5/5 | Complete | 2026-05-04 |
| 16. Session Comparison | v1.1 | 4/4 | Complete | 2026-05-05 |
| 17. Polish, Doctor & Tests | v1.1 | 6/6 | Complete | 2026-05-05 |
| 18. Polish & Carry-Forward Cleanup | v1.2 | 5/5 | Complete | 2026-05-05 |
| 19. Skills Per-Project, Deltas & Badges | v1.2 | 4/4 | Complete | 2026-05-06 |
| 20. Cost Forecast & Per-Project Card | v1.2 | 4/4 | Complete | 2026-05-06 |
| 21. Alert Anomaly Depth & NL Authoring | v1.2 | 3/3 | Complete | 2026-05-07 |
| 22. Skill Latency Overhead (spike-gated) | v1.2 | 2/2 | Complete | 2026-05-08 |
| 23. Compare Depth & Milestone Close | v1.2 | 4/4 | Complete | 2026-05-09 |
| 24. Shell + Density + Containment Primitives | v1.3 | 7/7 | Complete | 2026-05-12 |
| 25. Saved Views (Backend + Frontend) | v1.3 | 11/11 | Complete | 2026-05-12 |
| 26. Per-Route Adoption I + Time + Cmd+K | v1.3 | 9/9 | Complete | 2026-05-13 |
| 27. Per-Route Adoption II + Tech Debt | v1.3 | 9/9 | Complete | 2026-05-16 |
| 28. Layout Customization | v1.3 | 6/6 | Complete | 2026-05-17 |

**v1.0 milestone shipped: 47/47 plans, 11/11 phases verified (9 base + 2 audit gap-closure).**
**v1.1 milestone shipped: 28/28 plans, 6/6 phases verified, 41/41 requirements satisfied.**
**v1.2 milestone shipped: 22/22 plans, 6/6 phases verified, 12/12 active requirements satisfied + 1 honestly deferred (SKLP-11 → v1.3).**
**v1.3 milestone shipped: 42/42 plans, 5/5 phases verified, 45/45 active requirements satisfied + 13 Accepted Exceptions operator-acknowledged as forward-compatible tech debt deferred to v1.4+.**
