// PanelCard — Phase 6 Plan 01. Generic panel shell that wraps Card and owns
// the four canonical render branches (skeleton / error / empty / data) keyed
// off a TanStack Query result. Every Phase 6/7 panel composes this primitive
// so loading + empty + error copy lives at exactly ONE observable site
// instead of being duplicated per panel.
//
// Empty detection:
//   - default: data?.items?.length === 0
//   - custom: pass `empty.when: (data) => boolean`
// hiddenWhenEmpty: when true AND empty, returns null (used by AttentionBar so
// the bar disappears entirely when there are no attention items).

import { ReactNode } from 'react'
import { UseQueryResult } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from './'
import { ErrorState } from './ErrorState'

export interface PanelCardEmpty<TData> {
  dataNoun: string
  when?: (data: TData) => boolean
}

interface PanelCardProps<TData> {
  reqId: string
  title: string
  description?: ReactNode
  trailing?: ReactNode
  query: UseQueryResult<TData, Error>
  empty: PanelCardEmpty<TData>
  skeleton?: ReactNode
  hiddenWhenEmpty?: boolean
  children: (data: TData) => ReactNode
}

function defaultIsEmpty<T>(data: T, when?: (d: T) => boolean): boolean {
  if (when) return when(data)
  const d = data as unknown as { items?: unknown[] }
  return Array.isArray(d?.items) && d.items.length === 0
}

function DefaultSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
      <Skeleton variant="text" lines={4} />
    </div>
  )
}

export function PanelCard<T>({
  reqId,
  title,
  description,
  trailing,
  query,
  empty,
  skeleton,
  hiddenWhenEmpty,
  children,
}: PanelCardProps<T>) {
  // hiddenWhenEmpty: short-circuit to null (used by AttentionBar).
  if (
    hiddenWhenEmpty &&
    !query.isPending &&
    !query.isError &&
    query.data &&
    defaultIsEmpty(query.data, empty.when)
  ) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="cmc-panel-card__header">
          <div>
            <CardDescription className="cmc-label">{reqId}</CardDescription>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {trailing ? <div>{trailing}</div> : null}
        </div>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          skeleton ?? <DefaultSkeleton />
        ) : query.isError ? (
          <ErrorState
            message={query.error?.message ?? 'Unknown error'}
            dataNoun={empty.dataNoun}
            onRetry={() => {
              void query.refetch()
            }}
          />
        ) : query.data && defaultIsEmpty(query.data, empty.when) ? (
          <EmptyState
            heading="Nothing to show yet"
            body={`Once ${empty.dataNoun} arrives it will appear here. Run sync from the header to refresh.`}
          />
        ) : query.data ? (
          children(query.data)
        ) : null}
      </CardContent>
    </Card>
  )
}
