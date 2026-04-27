// McpPanel — OPNL-15 (Phase 6 Plan 03 / Wave 3).
//
// Server list with per-server CollapsibleSection drill-down to the per-tool
// table. Each row shows server name + counts + percentile latency + Slow/Fast
// flag tags (slow if p95>5000; fast if call_count>=10 AND p95<500 AND
// error_count===0).
//
// Lazy-fetch behavior: CollapsibleSection only mounts its children when open
// (via AnimatePresence). McpToolsTable lives inside the body, so simply
// rendering the table is the open signal — useMcpTools(server, true) then
// fires its first fetch. When the section closes, AnimatePresence unmounts
// the body and the cached query stays in TanStack until 60s staleTime
// expires.
//
// Path-traversal hardening: encodeURIComponent(server_name) lives inside
// api.mcpServerTools (Plan 06-01 task 1). No additional sanitization here.
//
// File location at components/panels/McpPanel.tsx so Phase 7 SKLP-01 can
// import the same component without moving files.
//
// Plan 07-02 deviation (Rule 1): added optional `reqId` prop with default
// "OPNL-15" so /skills can pass `reqId="SKLP-01"` to surface the SKLP-01
// kicker in the panel header. Existing callers (routes/index.tsx) continue
// to work without modification — the default preserves the Phase 6 contract.

import { Badge, CollapsibleSection, DataTable, PanelCard } from '../ui'
import type { DataTableColumn } from '../ui'
import { useMcpServers, useMcpTools } from '../../lib/queries'
import type {
  McpServerListResponse,
  McpServerRow,
  McpToolRow,
} from '../../lib/api'

const nf = new Intl.NumberFormat('en')

function ServerFlags({ server }: { server: McpServerRow }) {
  const slow = server.latency_p95_ms !== null && server.latency_p95_ms > 5000
  const fast =
    server.call_count >= 10 &&
    server.latency_p95_ms !== null &&
    server.latency_p95_ms < 500 &&
    server.error_count === 0
  return (
    <span className="cmc-mcp-row__tags">
      {slow ? <Badge variant="danger">slow</Badge> : null}
      {fast ? <Badge variant="success">fast</Badge> : null}
    </span>
  )
}

function ToolFlags({ tool }: { tool: McpToolRow }) {
  const slow = tool.latency_p95_ms !== null && tool.latency_p95_ms > 5000
  const fast =
    tool.call_count >= 10 &&
    tool.latency_p95_ms !== null &&
    tool.latency_p95_ms < 500 &&
    tool.error_count === 0
  return (
    <span className="cmc-mcp-row__tags">
      {slow ? <Badge variant="danger">slow</Badge> : null}
      {fast ? <Badge variant="success">fast</Badge> : null}
    </span>
  )
}

const TOOL_COLUMNS: DataTableColumn<McpToolRow>[] = [
  {
    id: 'tool_name',
    header: 'Tool',
    cell: (r) => <span className="cmc-mcp-row__name">{r.tool_name}</span>,
  },
  {
    id: 'call_count',
    header: 'Calls',
    cell: (r) => <span className="cmc-mcp-row__metric">{nf.format(r.call_count)}</span>,
  },
  {
    id: 'error_count',
    header: 'Errors',
    cell: (r) => <span className="cmc-mcp-row__metric">{nf.format(r.error_count)}</span>,
  },
  {
    id: 'p50',
    header: 'p50',
    cell: (r) => (
      <span className="cmc-mcp-row__metric">
        {r.latency_p50_ms === null ? '—' : `${r.latency_p50_ms}ms`}
      </span>
    ),
  },
  {
    id: 'p95',
    header: 'p95',
    cell: (r) => (
      <span className="cmc-mcp-row__metric">
        {r.latency_p95_ms === null ? '—' : `${r.latency_p95_ms}ms`}
      </span>
    ),
  },
  {
    id: 'max',
    header: 'max',
    cell: (r) => (
      <span className="cmc-mcp-row__metric">
        {r.latency_max_ms === null ? '—' : `${r.latency_max_ms}ms`}
      </span>
    ),
  },
  {
    id: 'source_priority',
    header: 'Source',
    cell: (r) => <Badge variant="neutral">{r.source_priority}</Badge>,
  },
  {
    id: 'flags',
    header: '',
    cell: (r) => <ToolFlags tool={r} />,
  },
]

function McpToolsTable({ serverName }: { serverName: string }) {
  // Always pass enabled=true here — this component only mounts when the
  // CollapsibleSection body mounts (i.e. open=true), so lazy-fetch is achieved
  // by mount lifecycle rather than the `enabled` flag.
  const query = useMcpTools(serverName, true)
  if (query.isPending) {
    return (
      <p style={{ color: 'var(--cmc-text-subtle)', margin: 0 }}>
        Loading tools{'\u2026'}
      </p>
    )
  }
  if (query.isError || !query.data) {
    return (
      <p role="alert" style={{ color: 'var(--cmc-status-red)', margin: 0 }}>
        Couldn{'\u2019'}t load tools:{' '}
        {query.error instanceof Error ? query.error.message : 'unknown error'}
      </p>
    )
  }
  if (query.data.items.length === 0) {
    return (
      <p style={{ color: 'var(--cmc-text-subtle)', margin: 0 }}>
        No tools recorded for this server yet.
      </p>
    )
  }
  return (
    <DataTable<McpToolRow>
      rows={query.data.items}
      columns={TOOL_COLUMNS}
      rowKey={(r) => r.tool_name}
      ariaLabel={`${serverName} tools`}
    />
  )
}

function McpServerRowItem({ server }: { server: McpServerRow }) {
  // Summary row is always visible. CollapsibleSection wraps ONLY the tools
  // table so flag badges + per-server metrics show even when collapsed; the
  // section title carries the server name so collapsing still labels the row
  // visually (and lazy-fetches tools on first open).
  return (
    <div className="cmc-mcp-row">
      <div className="cmc-mcp-row__summary">
        <span className="cmc-mcp-row__name">{server.server_name}</span>
        <span className="cmc-mcp-row__metric">
          {nf.format(server.call_count)} calls
        </span>
        <span className="cmc-mcp-row__metric">
          {nf.format(server.error_count)} errors
        </span>
        <span className="cmc-mcp-row__metric">
          p50 {server.latency_p50_ms === null ? '—' : `${server.latency_p50_ms}ms`}
        </span>
        <span className="cmc-mcp-row__metric">
          p95 {server.latency_p95_ms === null ? '—' : `${server.latency_p95_ms}ms`}
        </span>
        <span className="cmc-mcp-row__metric">
          max {server.latency_max_ms === null ? '—' : `${server.latency_max_ms}ms`}
        </span>
        <Badge variant="neutral">{server.source_priority}</Badge>
        <ServerFlags server={server} />
      </div>
      <CollapsibleSection
        id={`mcp-server-${server.server_name}`}
        title={`Tools for ${server.server_name}`}
        defaultOpen={false}
      >
        <McpToolsTable serverName={server.server_name} />
      </CollapsibleSection>
    </div>
  )
}

interface McpPanelProps {
  reqId?: string
}

export function McpPanel({ reqId = 'OPNL-15' }: McpPanelProps = {}) {
  const query = useMcpServers()
  return (
    <PanelCard<McpServerListResponse>
      reqId={reqId}
      title="MCP Servers"
      query={query}
      empty={{
        dataNoun: 'MCP server data',
        when: (d) => d.items.length === 0,
      }}
    >
      {(data) => (
        <div className="cmc-mcp-panel">
          {data.items.map((server) => (
            <McpServerRowItem key={server.server_name} server={server} />
          ))}
        </div>
      )}
    </PanelCard>
  )
}
