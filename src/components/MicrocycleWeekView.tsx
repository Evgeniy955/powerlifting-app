'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BarChart3, Lock, LockOpen } from 'lucide-react'
import { buttonVariants } from '@/components/ui'
import { MetricsBadge } from './MetricsBadge'
import { TrainingGroupLegend } from './TrainingGroupLegend'
import { WeekDayTable, type WeekWorkoutData } from './WeekDayTable'
import { AddWorkoutDayButton } from './AddWorkoutDayButton'
import { ToggleFourthDayButton } from './ToggleFourthDayButton'
import type { RpePoint } from '@/lib/rpe'

type AdjacentWeek = { id: string; weekNumber: number }

type WeekTotals = {
  tonnage: number
  avgWeight: number
  relativeIntensity: number
  kpsh: number
  loadCoefficient: number
  fatigueIndex: number | null
}

type Props = {
  microcycleId: string
  cycleId: string
  cycleName: string
  weekNumber: number
  prevWeek: AdjacentWeek | null
  nextWeek: AdjacentWeek | null
  nextWeekVisible: boolean
  athleteId: string
  role: 'COACH' | 'ATHLETE'
  canCreateExercise: boolean
  workouts: WeekWorkoutData[]
  rpeTable: RpePoint[]
  // null when there's nothing to summarize yet (mirrors the old
  // allEntryMetrics.length > 0 guard around MetricsBadge).
  weekTotals: WeekTotals | null
  // "Упрощённый режим" — the signed-in user's saved preference (User.
  // simplifiedView), read server-side so it's already correct on first
  // paint. Toggling the checkbox below writes straight through to the same
  // field via PATCH /api/user/simplified-view, so it follows the account
  // across an app reload or a different browser/device.
  initialSimplified: boolean
}

// Week view: the title/nav chrome around a microcycle's WeekDayTable cards,
// plus (new) a coach-only "Редактировать неделю" toggle that unlocks/locks
// every day's card at once. Lives client-side — unlike the rest of this
// page — specifically so that shared lock map can exist: a Server Component
// can't hold state or pass callback props down to sibling Client Components,
// and the button (near the title) and the day cards (further down) are both
// needed to share one source of truth for "is this day locked".
export function MicrocycleWeekView({
  microcycleId,
  cycleId,
  cycleName,
  weekNumber,
  prevWeek,
  nextWeek,
  nextWeekVisible,
  athleteId,
  role,
  canCreateExercise,
  workouts,
  rpeTable,
  weekTotals,
  initialSimplified,
}: Props) {
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(workouts.map((w) => [w.id, true]))
  )

  const [simplified, setSimplified] = useState(initialSimplified)

  // Optimistic: flips the checkbox immediately, then persists to the
  // account. A failed request leaves the UI on the new value rather than
  // rolling back — worst case a stale read on the next page load, not worth
  // the extra state for a low-stakes display preference.
  function applySimplified(next: boolean) {
    setSimplified(next)
    fetch('/api/user/simplified-view', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simplified: next }),
    })
  }

  function toggleDay(id: string) {
    setLockedMap((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const allUnlocked = workouts.length > 0 && workouts.every((w) => lockedMap[w.id] === false)

  // Flips every day to the opposite of the current aggregate state: if
  // every day is already unlocked, this locks them all back down; otherwise
  // (any day still locked) it unlocks everything.
  function toggleWeek() {
    setLockedMap(Object.fromEntries(workouts.map((w) => [w.id, allUnlocked])))
  }

  return (
    <>
      <div className="mx-auto mb-6 max-w-md space-y-4 px-4 lg:max-w-6xl">
        <div className="text-center">
          <Link
            href={`/cycles/${cycleId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {cycleName}
          </Link>
          {role === 'COACH' && (
            <div className="mb-2">
              <Link
                href={`/cycles/${cycleId}/analytics`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <BarChart3 className="h-4 w-4" /> Аналитика мезоцикла
              </Link>
            </div>
          )}
          <div className="flex items-center justify-center gap-3">
            {prevWeek ? (
              <Link
                href={`/microcycle/${prevWeek.id}`}
                aria-label={`Микроцикл ${prevWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}

            <h1 className="font-display text-xl uppercase tracking-wide">
              Микроцикл {weekNumber}
            </h1>

            {nextWeek && nextWeekVisible ? (
              <Link
                href={`/microcycle/${nextWeek.id}`}
                aria-label={`Микроцикл ${nextWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}
          </div>

          {role === 'COACH' && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              {/* Unlocks/locks every day card on this page at once, instead
                  of tapping each day's own padlock individually — handy when
                  sitting down to program a whole week at a time. Only makes
                  sense once there's at least one day to lock/unlock. */}
              {workouts.length > 0 && (
                <button
                  type="button"
                  onClick={toggleWeek}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  {allUnlocked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <LockOpen className="h-3.5 w-3.5" />
                  )}
                  {allUnlocked ? 'Заблокировать неделю' : 'Редактировать неделю'}
                </button>
              )}
              {/* A manually-added microcycle (AddMicrocycleButton) starts
                  with zero days and, without this, had no way to ever get
                  any — this is that missing add-day affordance. */}
              <AddWorkoutDayButton microcycleId={microcycleId} />
              {/* One-click 3<->4 day toggle for the two most common splits —
                  only renders itself once this week already has 3 or 4 days. */}
              <ToggleFourthDayButton microcycleId={microcycleId} workouts={workouts} />
            </div>
          )}

          {/* Available to both roles — a display preference, not a data
              mutation, so it isn't gated behind role === 'COACH' the way
              the editing controls above are. Persisted (see applySimplified
              above), so it stays on across every microcycle, not just this
              one page load. */}
          <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={simplified}
              onChange={(e) => applySimplified(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Упрощённый режим
          </label>
        </div>

        {weekTotals && !simplified && (
          <MetricsBadge
            tonnage={weekTotals.tonnage}
            avgWeight={weekTotals.avgWeight}
            relativeIntensity={weekTotals.relativeIntensity}
            kpsh={weekTotals.kpsh}
            loadCoefficient={weekTotals.loadCoefficient}
            fatigueIndex={weekTotals.fatigueIndex}
          />
        )}

        <TrainingGroupLegend />
      </div>

      {workouts.length === 0 ? (
        <p className="text-center text-sm text-text-secondary">
          В этом микроцикле пока нет тренировок.
        </p>
      ) : (
        <div className="mx-auto max-w-md space-y-3 px-4 lg:max-w-6xl">
          {workouts.map((workout) => (
            <WeekDayTable
              key={workout.id}
              workout={workout}
              rpeTable={rpeTable}
              athleteId={athleteId}
              role={role}
              canCreateExercise={canCreateExercise}
              locked={lockedMap[workout.id] ?? true}
              onToggleLocked={() => toggleDay(workout.id)}
              simplified={simplified}
            />
          ))}
        </div>
      )}
    </>
  )
}
