'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import type { ExerciseEntryData } from './ExerciseCard'
import { computeExerciseMetrics, aggregateMetrics } from '@/lib/metrics'
import type { RpePoint } from '@/lib/rpe'

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

// Same intensity-zone coloring as MetricsBadge, kept in sync by eye rather than
// shared — small enough function that a shared util would be more indirection
// than it's worth.
function zoneClass(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return 'text-zone-max'
  if (relativeIntensity >= 0.85) return 'text-zone-high'
  if (relativeIntensity >= 0.7) return 'text-zone-moderate'
  return 'text-zone-low'
}

export type WeekWorkoutData = {
  id: string
  dayNumber: number
  scheduledDate: string | Date
  exerciseEntries: ExerciseEntryData[]
}

type Props = {
  workout: WeekWorkoutData
  rpeTable: RpePoint[]
}

// Spreadsheet-dense day view — one compact table per day instead of a stack of
// full-height exercise cards, so a coach can scan (or edit) an entire week
// without endless scrolling. Mirrors the source Excel layout this app replaced:
// exercise rows, one narrow column per set (weight/reps/%1RM), totals on the
// right (Тоннаж/Сред.вес/Инт%/ПМ/КПШ/КО), a day-totals row at the bottom.
export function WeekDayTable({ workout, rpeTable }: Props) {
  const [entries, setEntries] = useState<ExerciseEntryData[]>(workout.exerciseEntries)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const date = new Date(workout.scheduledDate)
  const weekday = WEEKDAY_SHORT[date.getUTCDay()]
  const dateLabel = date.toISOString().slice(0, 10).split('-').reverse().join('.')

  const perEntryMetrics = useMemo(
    () =>
      new Map(
        entries.map((e) => [
          e.id,
          computeExerciseMetrics(
            {
              sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
              oneRepMax: e.oneRepMax ?? 0,
              impactCoefficient: e.exercise.impactCoefficient,
              multiplier: e.multiplier,
            },
            rpeTable
          ),
        ])
      ),
    [entries, rpeTable]
  )

  const dayTotals = useMemo(
    () => aggregateMetrics(Array.from(perEntryMetrics.values())),
    [perEntryMetrics]
  )

  const maxSets = Math.max(1, ...entries.map((e) => e.sets.length))

  function updateSetLocally(
    entryId: string,
    setId: string,
    patch: Partial<{ weight: number; reps: number; completed: boolean }>
  ) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id !== entryId
          ? e
          : { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
      )
    )

    if (saveTimers.current[setId]) clearTimeout(saveTimers.current[setId])
    saveTimers.current[setId] = setTimeout(() => {
      fetch(`/api/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }, 400)
  }

  async function addSet(entryId: string) {
    const res = await fetch(`/api/exercise-entries/${entryId}/sets`, { method: 'POST' })
    if (!res.ok) return
    const newSet = await res.json()
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, sets: [...e.sets, newSet] } : e))
    )
  }

  async function removeSet(entryId: string, setId: string) {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e))
    )
    await fetch(`/api/sets/${setId}`, { method: 'DELETE' })
  }

  async function handleAddExercise(exercise: ExerciseOption) {
    const res = await fetch('/api/exercise-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workoutId: workout.id, exerciseId: exercise.id }),
    })
    if (!res.ok) return
    const created = await res.json()
    setEntries((prev) => [
      ...prev,
      {
        id: created.id,
        multiplier: created.multiplier,
        exercise: {
          id: exercise.id,
          name: exercise.name,
          category: exercise.category,
          impactCoefficient: exercise.impactCoefficient,
        },
        oneRepMax: null,
        sets: [],
      },
    ])
  }

  const totalCols = maxSets + 8 // name + N sets + add-set + 6 metric columns

  return (
    <div className="animate-slide-up overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-baseline gap-2 border-b border-border bg-accent px-3 py-1.5 text-on-accent">
        <span className="font-display text-sm uppercase tracking-wide">{weekday}</span>
        <span className="text-xs opacity-90">{dateLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-text-secondary">
              <th className="sticky left-0 z-10 bg-surface-2 px-2 py-1 text-left font-bold">
                Упражнение
              </th>
              {Array.from({ length: maxSets }).map((_, i) => (
                <th key={i} className="px-1 py-1 text-center font-bold">
                  {i + 1}
                </th>
              ))}
              <th className="px-1 py-1" />
              <th className="px-1.5 py-1 text-right font-bold">Тонн</th>
              <th className="px-1.5 py-1 text-right font-bold">Срвес</th>
              <th className="px-1.5 py-1 text-right font-bold">Инт%</th>
              <th className="px-1.5 py-1 text-right font-bold">ПМ</th>
              <th className="px-1.5 py-1 text-right font-bold">КПШ</th>
              <th className="px-1.5 py-1 text-right font-bold">КО</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const m = perEntryMetrics.get(entry.id)!
              return (
                <tr key={entry.id} className="border-b border-border last:border-b-0">
                  <td className="sticky left-0 z-10 max-w-[9rem] truncate bg-surface px-2 py-1 font-medium">
                    {entry.exercise.name}
                    {entry.multiplier !== 1 && (
                      <span className="ml-1 text-text-secondary">×{entry.multiplier}</span>
                    )}
                  </td>
                  {Array.from({ length: maxSets }).map((_, i) => {
                    const set = entry.sets[i]
                    if (!set) return <td key={i} className="px-0.5 py-0.5" />
                    const pct = entry.oneRepMax ? set.weight / entry.oneRepMax : null
                    return (
                      <td key={i} className="group relative px-0.5 py-0.5 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            updateSetLocally(entry.id, set.id, { completed: !set.completed })
                          }
                          aria-pressed={set.completed}
                          aria-label={`Подход ${i + 1} выполнен`}
                          title={`Подход ${i + 1} выполнен`}
                          className={`absolute left-0 top-0 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm border transition-colors ${
                            set.completed
                              ? 'border-accent bg-accent text-on-accent'
                              : 'border-border bg-surface-2 text-transparent hover:border-accent'
                          }`}
                        >
                          <Check className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => removeSet(entry.id, set.id)}
                          aria-label="Удалить подход"
                          className="absolute right-0 top-0 hidden text-text-secondary hover:text-danger group-hover:block"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                        <div
                          className={`flex flex-col items-center gap-0.5 ${set.completed ? 'opacity-70' : ''}`}
                        >
                          <input
                            type="number"
                            inputMode="decimal"
                            value={set.weight || ''}
                            onChange={(e) =>
                              updateSetLocally(entry.id, set.id, {
                                weight: parseFloat(e.target.value) || 0,
                              })
                            }
                            className={`w-14 min-w-0 rounded border px-0.5 py-0.5 text-center text-xs font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            value={set.reps || ''}
                            onChange={(e) =>
                              updateSetLocally(entry.id, set.id, {
                                reps: parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className={`w-14 min-w-0 rounded border px-0.5 py-0.5 text-center text-xs text-text-secondary outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
                          />
                          <span
                            className={`text-[10px] ${pct !== null ? zoneClass(pct) : 'text-text-secondary'}`}
                          >
                            {pct !== null ? `${Math.round(pct * 100)}%` : '—'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-0.5 py-0.5 align-top">
                    <button
                      onClick={() => addSet(entry.id)}
                      aria-label="Добавить подход"
                      className="mt-1 text-text-secondary transition-colors hover:text-accent"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-1.5 py-1 text-right align-top">{m.tonnage}</td>
                  <td className="px-1.5 py-1 text-right align-top">{m.avgWeight}</td>
                  <td className={`px-1.5 py-1 text-right align-top ${zoneClass(m.relativeIntensity)}`}>
                    {Math.round(m.relativeIntensity * 100)}%
                  </td>
                  <td className="px-1.5 py-1 text-right align-top">{entry.oneRepMax ?? '—'}</td>
                  <td className="px-1.5 py-1 text-right align-top">{m.kpsh}</td>
                  <td className="px-1.5 py-1 text-right align-top">{m.loadCoefficient}</td>
                </tr>
              )
            })}

            {entries.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-2 py-2 text-center text-text-secondary">
                  Нет упражнений
                </td>
              </tr>
            )}

            <tr className="bg-surface-2 font-medium">
              <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1" colSpan={maxSets + 2}>
                Итого
              </td>
              <td className="px-1.5 py-1 text-right">{dayTotals.tonnage}</td>
              <td className="px-1.5 py-1 text-right">{dayTotals.avgWeight}</td>
              <td className={`px-1.5 py-1 text-right ${zoneClass(dayTotals.relativeIntensity)}`}>
                {Math.round(dayTotals.relativeIntensity * 100)}%
              </td>
              <td className="px-1.5 py-1 text-right">—</td>
              <td className="px-1.5 py-1 text-right">{dayTotals.kpsh}</td>
              <td className="px-1.5 py-1 text-right">{dayTotals.loadCoefficient}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="border-t border-border p-2">
        <ExerciseAutocomplete onSelect={handleAddExercise} placeholder="Добавить упражнение..." />
      </div>
    </div>
  )
}
