// ContextHealthCard — SKLP-03 (Plan 07-01).
//
// Strategy: setQueryData seeds qk.contextHealth() with a fixture so the
// PanelCard query branches resolve synchronously to the data branch (no
// fetch round-trip needed). Reflects Phase 6 panel-test convention.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '../../../test/utils'
import { ContextHealthCard } from '../ContextHealthCard'
import { qk } from '../../../lib/queries'
import type { ContextHealthResponse } from '../../../lib/api'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, refetchOnWindowFocus: false },
    },
  })
}

function Wrap({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const populated: ContextHealthResponse = {
  settings_path: '/Users/test/.claude/settings.json',
  settings_exists: true,
  claude_md_path: '/Users/test/.claude/CLAUDE.md',
  claude_md_exists: true,
  claude_md_lines: 234,
  settings_keys: [
    'ANTHROPIC_API_KEY (redacted)',
    'OPENAI_TOKEN (redacted)',
    'model_default',
    'mcpServers',
  ],
  mcp_server_count: 3,
  hook_count: 5,
}

const empty: ContextHealthResponse = {
  settings_path: '/Users/test/.claude/settings.json',
  settings_exists: false,
  claude_md_path: '/Users/test/.claude/CLAUDE.md',
  claude_md_exists: false,
  claude_md_lines: 0,
  settings_keys: [],
  mcp_server_count: 0,
  hook_count: 0,
}

describe('ContextHealthCard', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(empty), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders aggregate counts and the SKLP-03 reqId kicker when data is present', async () => {
    const client = makeClient()
    client.setQueryData(qk.contextHealth(), populated)
    render(
      <Wrap client={client}>
        <ContextHealthCard />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-03')).toBeInTheDocument()
    expect(screen.getByText('Context Health')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('CLAUDE.md lines')).toBeInTheDocument()
    })
    expect(screen.getByText('234')).toBeInTheDocument()
    expect(screen.getByText('MCP servers')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Hooks')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Settings keys')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('applies the redacted modifier class to "(redacted)" key chips and not to plain keys', async () => {
    const client = makeClient()
    client.setQueryData(qk.contextHealth(), populated)
    const { container } = render(
      <Wrap client={client}>
        <ContextHealthCard />
      </Wrap>,
    )
    await waitFor(() => {
      expect(screen.getByText('ANTHROPIC_API_KEY (redacted)')).toBeInTheDocument()
    })
    const redacted = container.querySelectorAll(
      '.cmc-context-health__key--redacted',
    )
    // Two keys end with "(redacted)" — both must carry the modifier class.
    expect(redacted.length).toBe(2)
    // Plain keys must NOT carry the modifier class.
    const plainKey = screen.getByText('model_default')
    expect(plainKey.className).not.toContain('cmc-context-health__key--redacted')
  })

  it('renders the empty state when neither settings nor CLAUDE.md exist', async () => {
    const client = makeClient()
    client.setQueryData(qk.contextHealth(), empty)
    render(
      <Wrap client={client}>
        <ContextHealthCard />
      </Wrap>,
    )
    expect(screen.getByText('SKLP-03')).toBeInTheDocument()
    // PanelCard default empty heading
    await waitFor(() => {
      expect(screen.getByText(/Nothing to show yet/i)).toBeInTheDocument()
    })
    // EmptyState body uses the "{dataNoun}" template
    expect(
      screen.getByText(/context configuration data/i),
    ).toBeInTheDocument()
  })
})
