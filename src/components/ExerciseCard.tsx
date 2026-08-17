'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { SetRow, type SetValue } from './SetRow'
import { MetricsBadge } from './MetricsBadge'
import { Card } from '@/components/ui'
import { computeExerciseMetrics } from '@/lib/metrics'
import type { RpePoint } from '@/lib/rpe'

export type ExerciseEntryData = {
  id: string
  multiplier: number
  exercise: {
    id: string
    name: string
    category: string | null
    impactCoefficient: number
  }
  oneRepMax: number | null
  sets: SetValue[]
}

type Props = {
  entry: ExerciseEntryData
  rpeTable: RpePoint[]
}

// One exercise block in the day view: dynamic set list ("+ Добавить подход"),
// reactive metrics recomputed on every keystroke, debounced persistence to the API.
// No auto-fill of new sets — they start empty by design.
export function ExerciseCard({ entry, rpeTable }: Props) {
  const [sets, setSets] = useState<SetValue[]>(entry.sets)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const metrics = useMemo(
    () =>
      computeExerciseMetrics(
        {
          sets: sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          oneRepMax: entry.oneRepMax ?? 0,
          impactCoefficient: entry.exercise.impactCoefficient,
          multiplier: entry.multiplier,
        },
        rpeTable
      ),
    [sets, entry.oneRepMax, entry.exercise.impactCoefficient, entry.multiplier, rpeTable]
  )

  // Per-set ИУ (RPE), shown next to each set. Comes straight out of the same
  // computeExerciseMetrics call above (metrics.fatiguePerSet), so the value next
  // to each set and the aggregate under the block are always consistent —
  // includes the +0.25-per-set fatigue accumulation, not just an independent
  // per-set lookup.
  const perSetRpe = useMemo(() => {
    const map = new Map<string, number | null>()
    sets.forEach((s, idx) => {
      map.set(s.id, metrics.fatiguePerSet[idx] ?? null)
    })
    return map
  }, [sets, metrics.fatiguePerSet])

  function updateSetLocally(
    id: string,
    patch: Partial<Pick<SetValue, 'weight' | 'reps' | 'completed'>>
  ) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

    // Debounce the network write per-set so live metrics feel instant while
    // typing but we don't spam the API on every keystroke.
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(() => {
      fetch(`/api/sets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }, 400)
  }

  async function addSet() {
    const res = await fetch(`/api/exercise-entries/${entry.id}/sets`, { method: 'POST' })
    if (res.ok) {
      const newSet = await res.json()
      setSets((prev) => [...prev, newSet])
    }
  }

  async function removeSet(id: string) {
    setSets((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/sets/${id}`, { method: 'DELETE' })
  }

  return (
    <Card className="space-y-3 animate-slide-up">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base uppercase tracking-wide">{entry.exercise.name}</h3>
        {entry.oneRepMax === null && (
          <span className="text-xs text-zone-moderate">1ПМ не задан</span>
        )}
      </div>

      <div>
        {sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            percentOf1rm={entry.oneRepMax ? set.weight / entry.oneRepMax : null}
            rpe={perSetRpe.get(set.id) ?? null}
            onChange={updateSetLocally}
            onRemove={removeSet}
          />
        ))}
      </div>

      <button
        onClick={addSet}
        className="inline-flex items-center gap-1 text-sm text-accent transition-colors hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Добавить подход
      </button>

      <MetricsBadge {...metrics} />
    </Card>
  )
}
