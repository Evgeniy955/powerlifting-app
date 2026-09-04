'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownAZ, ArrowUpAZ, FileDown, Search } from 'lucide-react'
import { Badge, Card, Input } from '@/components/ui'
import { GymRenamePlanButton } from '@/components/GymRenamePlanButton'
import { GymCopyPlanButton } from '@/components/GymCopyPlanButton'
import { GymDeletePlanButton } from '@/components/GymDeletePlanButton'

export type GymPlanListItem = {
  id: string
  name: string
  startDate: string // ISO
  weeks: number
  weekCount: number
}

type Status = 'all' | 'upcoming' | 'active' | 'completed'

const STATUS_LABEL: Record<Exclude<Status, 'all'>, string> = {
  upcoming: 'Предстоящий',
  active: 'Активный',
  completed: 'Завершён',
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function planStatus(plan: GymPlanListItem, now: number): Exclude<Status, 'all'> {
  const start = new Date(plan.startDate).getTime()
  const end = start + plan.weeks * MS_PER_WEEK
  if (start > now) return 'upcoming'
  if (end < now) return 'completed'
  return 'active'
}

type Props = {
  plans: GymPlanListItem[]
  // Coach-only actions: rename, copy, delete. A client viewing their own
  // plans only gets read/export.
  canManage: boolean
}

// Same search/filter/sort/card-actions logic as AthleteCyclesList
// (powerlifting side), applied to gym plans — kept as a separate component
// rather than a shared generic one since the two plan shapes (Cycle vs.
// GymPlan) and their action endpoints differ enough that abstracting them
// would cost more than it saves.
export function GymPlansList({ plans, canManage }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status>('all')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const now = useMemo(() => Date.now(), [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return plans
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .filter((p) => (status === 'all' ? true : planStatus(p, now) === status))
      .sort((a, b) => {
        const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        return sortDir === 'asc' ? diff : -diff
      })
  }, [plans, query, status, sortDir, now])

  const statusCounts = useMemo(() => {
    const counts: Record<Status, number> = { all: plans.length, upcoming: 0, active: 0, completed: 0 }
    for (const p of plans) counts[planStatus(p, now)]++
    return counts
  }, [plans, now])

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
        {visible.map((plan) => (
          <Card key={plan.id} padding="sm" className="transition-colors hover:bg-surface-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  planStatus(plan, now) === 'active'
                    ? 'low'
                    : planStatus(plan, now) === 'upcoming'
                      ? 'moderate'
                      : 'neutral'
                }
              >
                {STATUS_LABEL[planStatus(plan, now)]}
              </Badge>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <a
                  href={`/api/gym/plans/${plan.id}/export`}
                  title="Экспорт в PDF"
                  aria-label="Экспорт в PDF"
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <FileDown className="h-3.5 w-3.5" />
                </a>
                {canManage && (
                  <>
                    <GymRenamePlanButton planId={plan.id} planName={plan.name} />
                    <GymCopyPlanButton planId={plan.id} planName={plan.name} />
                    <GymDeletePlanButton planId={plan.id} planName={plan.name} />
                  </>
                )}
              </div>
            </div>
            <Link href={`/gym/plans/${plan.id}`} className="mt-1.5 block">
              <p className="break-words font-medium">{plan.name}</p>
              <p className="text-xs text-text-secondary">
                {new Date(plan.startDate).toISOString().slice(0, 10)} ·{' '}
                {plan.weekCount} нед.
              </p>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}
