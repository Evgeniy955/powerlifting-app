'use client'

import { useMemo, useRef, useState } from 'react'
import { Ban, Check, Plus, Trash2, X } from 'lucide-react'
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
  athleteId: string
  // 1RM is athlete-wide (not per-day), and the API that upserts it is coach-only —
  // athletes viewing their own week see the value read-only, same as before.
  canEditOneRepMax: boolean
}

// Spreadsheet-dense day view — one compact table per day instead of a stack of
// full-height exercise cards, so a coach can scan (or edit) an entire week
// without endless scrolling. Mirrors the source Excel layout this app replaced:
// exercise rows, one narrow column per set (weight/reps/%1RM), totals on the
// right (Тоннаж/Сред.вес/Инт%/ПМ/КПШ/КО), a day-totals row at the bottom. The ПМ
// column is highlighted (bg-accent-2) and, for a coach, editable — it's the one
// figure everything else on the row (%1RM, Инт%, КО) is computed from.
export function WeekDayTable({ workout, rpeTable, athleteId, canEditOneRepMax }: Props) {
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

  function updateOneRepMaxLocally(entryId: string, exerciseId: string, value: number) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, oneRepMax: value } : e)))

    const key = `1rm-${entryId}`
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    if (value <= 0) return // API requires value > 0 — let the coach keep typing
    saveTimers.current[key] = setTimeout(() => {
      fetch(`/api/athletes/${athleteId}/one-rep-max`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, value }),
      })
    }, 400)
  }

  async function toggleSkipped(entryId: string, next: boolean) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, skipped: next } : e)))
    await fetch(`/api/exercise-entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipped: next }),
    })
  }

  // Removes this exercise from the day's plan (ExerciseEntry + its sets) — not
  // the ExerciseCatalog entry, which stays intact for every other day/athlete.
  async function removeExercise(entryId: string, exerciseName: string) {
    if (!window.confirm(`Убрать «${exerciseName}» из плана на этот день?`)) return
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
    await fetch(`/api/exercise-entries/${entryId}`, { method: 'DELETE' })
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
        skipped: false,
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
        <span className="font-display text-base uppercase tracking-wide">{weekday}</span>
        <span className="text-sm opacity-90">{dateLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-text-secondary">
              <th className="sticky left-0 z-10 bg-surface-2 px-2 py-1 text-left font-bold">
                Упражнение
              </th>
              {maxSets > 0 && (
                <th colSpan={maxSets} className="px-1 py-1 text-center font-bold">
                  Подходы
                </th>
              )}
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
            {entries.map((entry, index) => {
              const m = perEntryMetrics.get(entry.id)!
              return (
                <tr
                  key={entry.id}
                  className={`border-b border-border last:border-b-0 ${entry.skipped ? 'opacity-50' : ''}`}
                >
                  <td className="sticky left-0 z-10 max-w-[10rem] bg-surface px-2 py-1 font-medium">
                    <div className="flex flex-col items-start gap-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSkipped(entry.id, !entry.skipped)}
                          aria-pressed={entry.skipped}
                          title={
                            entry.skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'
                          }
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            entry.skipped
                              ? 'border-danger bg-danger text-on-danger'
                              : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
                          }`}
                        >
                          <Ban className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeExercise(entry.id, entry.exercise.name)}
                          aria-label="Убрать упражнение из плана"
                          title="Убрать упражнение из плана"
                          className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary transition-colors hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <span className={`truncate ${entry.skipped ? 'line-through' : ''}`}>
                        <span className="text-text-secondary">{index + 1}. </span>
                        {entry.exercise.name}
                        {entry.multiplier !== 1 && (
                          <span className="ml-1 text-text-secondary">×{entry.multiplier}</span>
                        )}
                      </span>
                    </div>
                  </td>
                  {Array.from({ length: maxSets }).map((_, i) => {
                    const set = entry.sets[i]
                    if (!set) return <td key={i} className="px-0.5 py-0.5" />
                    const pct = entry.oneRepMax ? set.weight / entry.oneRepMax : null
                    return (
                      <td key={i} className="group relative px-0.5 py-0.5 align-top">
                        <button
                          onClick={() => removeSet(entry.id, set.id)}
                          aria-label="Удалить подход"
                          className="absolute right-0 top-0 hidden text-text-secondary hover:text-danger group-hover:block"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="flex flex-col items-center gap-0.5">
                          {/* Set-number pill doubles as the "done" toggle (swaps to a
                              checkmark when tapped) — sits in normal flow above the
                              weight input instead of overlapping it, and gives a
                              properly sized tap target on mobile. Kept at full opacity
                              even when completed (the rest of the row dims below) so
                              the done state stays the brightest thing in the row. */}
                          <button
                            type="button"
                            onClick={() =>
                              updateSetLocally(entry.id, set.id, { completed: !set.completed })
                            }
                            aria-pressed={set.completed}
                            aria-label={`Подход ${i + 1}${set.completed ? ' выполнен, нажмите чтобы снять отметку' : ', нажмите чтобы отметить выполненным'}`}
                            className={`flex h-5 w-16 items-center justify-center rounded border text-[10px] font-medium transition-colors ${
                              set.completed
                                ? 'border-accent bg-accent text-on-accent shadow-[0_0_8px_-1px_var(--color-accent)]'
                                : 'border-border bg-surface-2 text-text-secondary hover:border-accent hover:text-accent'
                            }`}
                          >
                            {set.completed ? <Check className="h-3 w-3" /> : i + 1}
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
                              className={`w-16 min-w-0 rounded border px-0.5 py-0.5 text-center text-sm font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
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
                              className={`w-16 min-w-0 rounded border px-0.5 py-0.5 text-center text-sm text-text-secondary outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
                            />
                            <span
                              className={`text-xs ${pct !== null ? zoneClass(pct) : 'text-text-secondary'}`}
                            >
                              {pct !== null ? `${Math.round(pct * 100)}%` : '—'}
                            </span>
                          </div>
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
                  <td className="px-1.5 py-1 text-right align-top">
                    {canEditOneRepMax ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        value={entry.oneRepMax || ''}
                        onChange={(e) =>
                          updateOneRepMaxLocally(
                            entry.id,
                            entry.exercise.id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-14 min-w-0 rounded border-none bg-accent-2 px-1 py-0.5 text-center text-sm font-bold text-on-accent-2 outline-none focus:ring-1 focus:ring-accent"
                      />
                    ) : (
                      <span className="rounded bg-accent-2 px-1.5 py-0.5 font-bold text-on-accent-2">
                        {entry.oneRepMax ?? '—'}
                      </span>
                    )}
                  </td>
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
