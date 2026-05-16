// ContextHealthCard — SKLP-03 (current).
//
// Read-only display of /api/context/health: aggregate counts (claude_md_lines,
// mcp_server_count, hook_count, settings_keys.length) shown via StatList, and
// the full settings_keys list rendered as chip Badges. Keys whose backend
// redaction marker `(redacted)` is present are styled subtle (italic, dim)
// via the `cmc-context-health__key--redacted` modifier.
//
// Empty state: when BOTH settings_exists=false AND claude_md_exists=false,
// PanelCard's empty branch renders the "Settings file not found" message.
//
// Polling cadence is locked at 60_000ms in lib/queries.ts (useContextHealth) —
// this panel does NOT inline refetchInterval.

import { Badge, PanelCard, StatList, type LayoutCustomizableProps } from '../ui'
import { useContextHealth } from '../../lib/queries'
import type { ContextHealthResponse } from '../../lib/api'

export function ContextHealthCard({ panelId, headerMenu }: LayoutCustomizableProps = {}) {
  const query = useContextHealth()
  return (
    <PanelCard<ContextHealthResponse>
      bounded
      reqId="SKLP-03"
      title="Context Health"
      description="~/.claude/settings.json + CLAUDE.md snapshot"
      query={query}
      panelId={panelId}
      headerMenu={headerMenu}
      empty={{
        dataNoun: 'context configuration data',
        when: (d) => !d.settings_exists && !d.claude_md_exists,
      }}
    >
      {(data) => (
        <div className="cmc-context-health">
          <StatList
            items={[
              { label: 'CLAUDE.md lines', value: data.claude_md_lines },
              { label: 'MCP servers', value: data.mcp_server_count },
              { label: 'Hooks', value: data.hook_count },
              { label: 'Settings keys', value: data.settings_keys.length },
            ]}
          />
          {data.settings_keys.length > 0 ? (
            <div className="cmc-context-health__keys" aria-label="Settings keys">
              {data.settings_keys.map((key) => {
                const isRedacted = key.endsWith('(redacted)')
                return (
                  <Badge
                    key={key}
                    variant="neutral"
                    className={
                      isRedacted ? 'cmc-context-health__key--redacted' : ''
                    }
                  >
                    {key}
                  </Badge>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
    </PanelCard>
  )
}
