// SystemHealthStrip — OPNL-01 (current).
//
// Full-width status strip rendered above the panel grid on / route. Pulls
// /api/system/health every 5s via useSystemHealth (cadence locked in
// lib/queries.ts; do NOT inline refetchInterval here). Composes PanelCard
// for the loading/empty/error skeleton + ErrorState branches.
//
// Pills:
//   - server status (data.status: ok → green pill, degraded → amber pill)
//   - one pill per daemon in data.daemon_ages (ok < 90s, stale < 300s, error otherwise)
//   - one pill for OTEL freshness (ok < 60s, stale otherwise)
//
// Stats line: uptime (humanized seconds → "1h 23m"), memory_rss_mb (1 decimal),
// last-otel-event-age (seconds), tzname (footnote in --cmc-text-subtle).

import { PanelCard, StatePill } from '../ui'
import { useSystemHealth } from '../../lib/queries'
import type { DaemonAge, SystemHealthResponse } from '../../lib/api'

function humanizeUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h < 24) return `${h}h ${mm}m`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return `${d}d ${hh}h`
}

type PillState = 'ok' | 'stale' | 'error'

function daemonState(age: number | null): PillState {
  if (age === null) return 'stale'
  if (age < 90) return 'ok'
  if (age < 300) return 'stale'
  return 'error'
}

function otelState(age: number | null): PillState {
  if (age === null) return 'stale'
  return age < 60 ? 'ok' : 'stale'
}

function serverState(status: SystemHealthResponse['status']): PillState {
  return status === 'ok' ? 'ok' : 'error'
}

export function SystemHealthStrip() {
  const query = useSystemHealth()
  return (
    <PanelCard<SystemHealthResponse>
      reqId="OPNL-01"
      title="System Health"
      query={query}
      empty={{ dataNoun: 'health metrics', when: () => false }}
      bounded
    >
      {(data) => (
        <div className="cmc-system-health-strip">
          <div className="cmc-system-health-strip__pills">
            <StatePill state={serverState(data.status)} label={`server ${data.status}`} />
            <StatePill state={otelState(data.last_otel_event_age_seconds)} label="otel" />
            {data.daemon_ages.map((d: DaemonAge) => (
              <StatePill key={d.key} state={daemonState(d.age_seconds)} label={d.key} />
            ))}
          </div>
          <div className="cmc-system-health-strip__stats cmc-numeric">
            <span>
              <span className="cmc-system-health-strip__stat-label">uptime</span>{' '}
              {humanizeUptime(data.uptime_seconds)}
            </span>
            <span>
              <span className="cmc-system-health-strip__stat-label">memory</span>{' '}
              {data.memory_rss_mb.toFixed(1)} MB
            </span>
            <span>
              <span className="cmc-system-health-strip__stat-label">last otel</span>{' '}
              {data.last_otel_event_age_seconds === null
                ? '—'
                : `${Math.round(data.last_otel_event_age_seconds)}s ago`}
            </span>
            <span className="cmc-system-health-strip__tz">{data.tzname}</span>
          </div>
        </div>
      )}
    </PanelCard>
  )
}
