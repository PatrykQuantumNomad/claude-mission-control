# Phase 23: Compare Depth & Milestone Close - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 23-Compare Depth & Milestone Close
**Areas discussed:** Previous session API, Cmd+K UX, Compare scope, Skill latency delta

---

## Previous session API

| Option | Description | Selected |
|--------|-------------|----------|
| Same `project_key` only | Strict project identity; matches success criteria | ✓ |
| Same cwd/root only | Requires defining/deriving stable cwd key | |
| Prefer project_key, fallback to cwd | Hybrid behavior | |

| Option | Description | Selected |
|--------|-------------|----------|
| Order by `ended_at` | Strictly previous by end time; ignore `ended_at IS NULL` | ✓ |
| Order by created/started time | Alternative if ended_at unreliable | |
| Order by `id` | Simple but weaker semantics | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tie-break by `id` desc | Deterministic | |
| Tie-break by `started_at` desc | Deterministic and time-based | ✓ |
| Tie-break by tool_call_count desc | “Most substantial” heuristic | |

| Option | Description | Selected |
|--------|-------------|----------|
| 404 `{error: "no previous session"}` | UI can hide action cleanly | ✓ |
| 204 No Content | No body | |
| 200 + null id | Requires schema change | |

| Option | Description | Selected |
|--------|-------------|----------|
| No skipping | Strict previous by time | ✓ |
| Min tool calls | Additional rule/edge cases | |
| Successful only | Adds outcome semantics | |

| Option | Description | Selected |
|--------|-------------|----------|
| `{session_id}` only | Minimal payload; UI constructs compare URL | ✓ |
| `{session_id, meta}` | Helpful for UI messaging | |
| Full session | Heavy/unnecessary | |

---

## Cmd+K UX

| Option | Description | Selected |
|--------|-------------|----------|
| Only on session detail views | Matches “from any session view” | ✓ |
| Everywhere in Cmd+K | Available even off-session | |
| Session + compare page | Also visible on compare page | |

| Option | Description | Selected |
|--------|-------------|----------|
| Navigate direct | `/sessions/compare?a=current&b=previous` | ✓ |
| Set `b` only if already on compare | Update compare page state | |
| Previous else picker | Fallback to picker when none | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden unless previous exists | Action disappears when impossible | ✓ |
| Disabled with reason | Always visible but disabled | |
| Toast on click | Visible, failure message on click | |

| Option | Description | Selected |
|--------|-------------|----------|
| Use `a` on compare as “current” | previous-of-`a` | ✓ |
| Hide on compare | Keep compare-only actions | |
| Only when `b` missing | Conditional on compare state | |

---

## Compare scope

| Option | Description | Selected |
|--------|-------------|----------|
| Scope by Side A `project_key` | Picker candidates limited to same project | ✓ |
| Global list | Current behavior (7d / 50) | |
| Toggle | Scoped by default, allow “Show all” | |

| Option | Description | Selected |
|--------|-------------|----------|
| Use `project_key` everywhere | Stable project identity | ✓ |
| Use cwd | Requires normalization | |
| Hybrid | `project_key` else cwd | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to global | If Side A lacks `project_key` | ✓ |
| Scope by cwd | Fallback scoping | |
| Hide action | Disallow compare in this case | |

| Option | Description | Selected |
|--------|-------------|----------|
| Strip invalid UUIDs | Keep current validateSearch behavior | ✓ |
| Hard-fail | Error boundary/message | |
| Strip + toast | Explain sanitization | |

---

## Skill latency delta

| Option | Description | Selected |
|--------|-------------|----------|
| p95 only | Simple + consistent | ✓ |
| p50 + p95 | More informative | |
| mean + p95 | Mean can mislead | |

| Option | Description | Selected |
|--------|-------------|----------|
| 30 samples | Matches success criteria | ✓ |
| 50 samples | More conservative | |
| Configurable | Adds complexity | |

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress deltas | Return raw values + flags; no deltas | ✓ |
| Delta + “low confidence” | Still compute, mark confidence | |
| Omit field | Remove skill_latencies | |

| Option | Description | Selected |
|--------|-------------|----------|
| Still include skill_latencies | Only skip tool_counts when over_cap | ✓ |
| Skip when over_cap | Maximum safety | |
| Include top N | Partial fallback | |

---

## Claude's Discretion

None — no “you decide” items.

## Deferred Ideas

None.
