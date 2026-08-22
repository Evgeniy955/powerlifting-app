'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownAZ, ArrowUpAZ, FileDown, History, Search } from 'lucide-react'
import { Badge, Card, Input } from '@/components/ui'
import { DeleteCycleButton } from '@/components/DeleteCycleButton'
import { RenameCycleButton } from '@/components/RenameCycleButton'
import { CopyCycleButton } from '@/components/CopyCycleButton'

export type CycleListItem = {
  id: string
  name: string
  startDate: string // ISO
  weeks: number
  microcycleCount: number
  // Coach-only; always 0 for an athlete viewing their own plans. Scoped to
  // this specific plan (not blended across the athlete's other plans) so
  // it's obvious at a glance which plan has edits waiting.
  unseenChangesCount: number
}

type Status = 'all' | 'upcoming' | 'active' | 'completed'

const STATUS_LABEL: Record<Exclude<Status, 'all'>, string> = {
  upcoming: 'Предстоящий',
  active: 'Активный',
  completed: 'Завершён',
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function cycleStatus(cycle: CycleListItem, now: number): Exclude<Status, 'all'> {
  const start = new Date(cycle.startDate).getTime()
  const end = start + cycle.weeks * MS_PER_WEEK
  if (start > now) return 'upcoming'
  if (end < now) return 'completed'
  return 'active'
}

type Props = {
  cycles: CycleListItem[]
  // Coach-only actions: rename, copy, delete. An athlete viewing their own
  // plans only ever gets read/export/history.
  canManage: boolean
}

// Client-side sort/filter over a coach's (or athlete's) plan list — the list
// is small per athlete (tens, not thousands, of cycles), so filtering the
// already-fetched array locally avoids round-tripping to the server for
// every keystroke/toggle.
export function AthleteCyclesList({ cycles, canManage }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const now = useMemo(() => Date.now(), [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cycles
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .filter((c) => (status === 'all' ? true : cycleStatus(c, now) === status))
      .sort((a, b) => {
        const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        return sortDir === 'asc' ? diff : -diff
      })
  }, [cycles, query, status, sortDir, now])

  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { all: cycles.length, upcoming: 0, active: 0, completed: 0 }
    for (const c of cycles) counts[cycleStatus(c, now)]++
    return counts
  }, [cycles, now])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по названию плана"
            fieldSize="sm"
            className="w-full pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          title={sortDir === 'desc' ? 'Сначала новые' : 'Сначала старые'}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          {sortDir === 'desc' ? (
            <ArrowDownAZ className="h-4 w-4" />
          ) : (
            <ArrowUpAZ className="h-4 w-4" />
          )}
          {sortDir === 'desc' ? 'Сначала новые' : 'Сначала старые'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'active', 'upcoming', 'completed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === s
                ? 'bg-accent text-on-accent'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {s === 'all' ? 'Все' : STATUS_LABEL[s]} ({statusCounts[s]})
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-text-secondary">
          Ничего не найдено по этому фильтру.
        </p>
      )}

      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {visible.map((cycle) => (
          <Card key={cycle.id} padding="sm" className="transition-colors hover:bg-surface-2">
            <div className="flex items-start justify-between gap-2">
              {/* Badge sits above the name (not inline next to it) so a long
                  plan name gets the card's full width to itself and wraps
                  instead of being squeezed down to a sliver of truncated
                  text by the badge + action icons sharing its row. */}
              <Link href={`/cycles/${cycle.id}`} className="min-w-0 flex-1">
                <Badge
                  tone={
                    cycleStatus(cycle, now) === 'active'
                      ? 'low'
                      : cycleStatus(cycle, now) === 'upcoming'
                        ? 'moderate'
                        : 'neutral'
                  }
                >
                  {STATUS_LABEL[cycleStatus(cycle, now)]}
                </Badge>
                <p className="mt-1 break-words font-medium">{cycle.name}</p>
                <p className="text-xs text-text-secondary">
                  {new Date(cycle.startDate).toISOString().slice(0, 10)} ·{' '}
                  {cycle.microcycleCount} нед.
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={`/api/cycles/${cycle.id}/export`}
                  onClick={(e) => e.stopPropagation()}
                  title="Экспорт в Excel"
                  aria-label="Экспорт в Excel"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </a>
                <Link
                  href={`/cycles/${cycle.id}/history`}
                  onClick={(e) => e.stopPropagation()}
                  title="История изменений этого плана"
                  aria-label="История изменений этого плана"
                  className="relative flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <History className="h-3.5 w-3.5" />
                  {cycle.unseenChangesCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-danger">
                      {cycle.unseenChangesCount > 9 ? '9+' : cycle.unseenChangesCount}
                    </span>
                  )}
                </Link>
                {canManage && (
                  <>
                    <RenameCycleButton cycleId={cycle.id} cycleName={cycle.name} />
                    <CopyCycleButton cycleId={cycle.id} cycleName={cycle.name} />
                    <DeleteCycleButton cycleId={cycle.id} cycleName={cycle.name} />
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
