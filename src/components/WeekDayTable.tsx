'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import { LockToggle } from './LockToggle'
import { WeekDayTableRow } from './WeekDayTableRow'
import type { ExerciseEntryData } from './ExerciseCard'
import { computeExerciseMetrics, aggregateMetrics } from '@/lib/metrics'
import type { RpePoint } from '@/lib/rpe'

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const ONE_REP_MAX_UPDATED_EVENT = 'one-rep-max-updated'

type OneRepMaxUpdatedDetail = {
  exerciseId: string
  value: number
  effectiveFrom: string
}

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
  // 1RM is snapshotted on every exercise entry. Editing it updates this day
  // and future workouts, never past ones. A coach can edit any exercise's ПМ;
  // an athlete may only edit their own ОФП (GPP) exercises — Базовые/СФП
  // figures anchor %1RM-based programming and stay coach-only, read-only for
  // the athlete. Matches the same split enforced server-side in
  // POST /api/athletes/:athleteId/one-rep-max.
  role: 'COACH' | 'ATHLETE'
  // Coach-only: lets the "Добавить упражнение..." / edit-exercise autocompletes
  // create a brand-new ExerciseCatalog row when the search comes up empty.
  canCreateExercise: boolean
  // Controlled rather than internal state — lives in the parent (see
  // MicrocycleWeekView) so a coach-only "Редактировать неделю" button can
  // unlock/lock every day's card at once, not just this one.
  locked: boolean
  onToggleLocked: () => void
  // "Упрощённый режим" — same controlled-from-parent shape as `locked`,
  // toggled once in MicrocycleWeekView and threaded down here and into
  // WeekDayTableRow. Drops everything but the exercise name and each set's
  // weight/reps/%1RM: the Тонн/Срвес/Инт%/ПМ/КПШ/КО columns, the add-set and
  // add-exercise controls, and the row's edit/drag/delete icons.
  simplified: boolean
  // The final workout card is nearest the bottom viewport edge, so its
  // add-exercise autocomplete opens above its input.
  openAddExerciseUpward: boolean
}

// Spreadsheet-dense day view — one compact table per day instead of a stack of
// full-height exercise cards, so a coach can scan (or edit) an entire week
// without endless scrolling. Mirrors the source Excel layout this app replaced:
// exercise rows, one narrow column per set (weight/reps/%1RM), totals on the
// right (Тоннаж/Сред.вес/Инт%/ПМ/КПШ/КО), a day-totals row at the bottom. The ПМ
// column is highlighted (bg-accent-2) and, for a coach, editable — it's the one
// figure everything else on the row (%1RM, Инт%, КО) is computed from. The
// Итого row's Тоннаж/Сред.вес/Инт% only count exercises in the Базовые/СФП
// blocks (see dayTotals below) — КПШ/КО stay summed across every exercise.
export function WeekDayTable({
  workout,
  rpeTable,
  athleteId,
  role,
  canCreateExercise,
  locked,
  onToggleLocked,
  simplified,
  openAddExerciseUpward,
}: Props) {
  const [entries, setEntries] = useState<ExerciseEntryData[]>(workout.exerciseEntries)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Inline "which exercise + Множ" editor — only one row at a time, so a single
  // id/draft pair is enough rather than per-row state.
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [draftExercise, setDraftExercise] = useState<ExerciseOption | null>(null)
  const [draftMultiplier, setDraftMultiplier] = useState(1)

  // Each day of the week is rendered as an independent table component. Keep
  // the visible current/future days aligned immediately after a 1RM edit,
  // mirroring the same date-scoped update performed by the API.
  useEffect(() => {
    function syncOneRepMax(event: Event) {
      const { exerciseId, value, effectiveFrom } = (event as CustomEvent<OneRepMaxUpdatedDetail>)
        .detail
      if (new Date(workout.scheduledDate).getTime() < new Date(effectiveFrom).getTime()) return
      setEntries((prev) =>
        prev.map((entry) =>
          entry.exercise.id === exerciseId ? { ...entry, oneRepMax: value } : entry
        )
      )
    }

    window.addEventListener(ONE_REP_MAX_UPDATED_EVENT, syncOneRepMax)
    return () => window.removeEventListener(ONE_REP_MAX_UPDATED_EVENT, syncOneRepMax)
  }, [workout.scheduledDate])

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

  // Итого row: Тоннаж/Срвес/Инт% only count exercises in the Базовые/СФП
  // training blocks (ОФП and unclassified exercises are accessory/prep work
  // that shouldn't inflate the day's load figures) — but КПШ/КО stay summed
  // across every exercise, same as before, per the coach's explicit split
  // between "load" and "КО".
  const dayTotals = useMemo(() => {
    const allMetrics = Array.from(perEntryMetrics.values())
    const loadMetrics = entries
      .filter((e) => e.exercise.trainingGroup === 'BASE' || e.exercise.trainingGroup === 'SPP')
      .map((e) => perEntryMetrics.get(e.id)!)

    const loadTotals = aggregateMetrics(loadMetrics)
    const allTotals = aggregateMetrics(allMetrics)

    return {
      tonnage: loadTotals.tonnage,
      avgWeight: loadTotals.avgWeight,
      relativeIntensity: loadTotals.relativeIntensity,
      kpsh: allTotals.kpsh,
      loadCoefficient: allTotals.loadCoefficient,
    }
  }, [perEntryMetrics, entries])

  const maxSets = Math.max(1, ...entries.map((e) => e.sets.length))

  // Requires an 8px pointer move before a drag starts — without this, the
  // handle's own click/tap (e.g. a quick accidental touch) could register as
  // a zero-distance drag and reorder nothing while still eating the tap.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setEntries((prev) => {
      const oldIndex = prev.findIndex((e) => e.id === active.id)
      const newIndex = prev.findIndex((e) => e.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex)

      fetch(`/api/workouts/${workout.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: next.map((e) => e.id) }),
      })

      return next
    })
  }

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
    // All occurrences in this workout share one effective snapshot, so update
    // them together. Debouncing by exerciseId also prevents two copies of the
    // exercise from racing and restoring an older value in the database.
    setEntries((prev) =>
      prev.map((e) => (e.exercise.id === exerciseId ? { ...e, oneRepMax: value } : e))
    )

    const key = `1rm-${exerciseId}`
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    if (value <= 0) return // API requires value > 0 — let the coach keep typing
    saveTimers.current[key] = setTimeout(async () => {
      const res = await fetch(`/api/athletes/${athleteId}/one-rep-max`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, value, workoutId: workout.id }),
      })
      if (!res.ok) return
      const saved = (await res.json()) as { value: number }
      // The endpoint is an upsert: its returned value is the persisted source
      // of truth, whether this is the first 1RM or a higher/lower replacement.
      setEntries((prev) =>
        prev.map((e) => (e.exercise.id === exerciseId ? { ...e, oneRepMax: saved.value } : e))
      )
      window.dispatchEvent(
        new CustomEvent<OneRepMaxUpdatedDetail>(ONE_REP_MAX_UPDATED_EVENT, {
          detail: {
            exerciseId,
            value: saved.value,
            effectiveFrom: new Date(workout.scheduledDate).toISOString(),
          },
        })
      )
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

  function startEditingExercise(entry: ExerciseEntryData) {
    setEditingEntryId(entry.id)
    setDraftExercise(null)
    setDraftMultiplier(entry.multiplier)
  }

  async function saveExerciseEdit(entryId: string) {
    const current = entries.find((e) => e.id === entryId)
    if (!current) return
    const nextExercise = draftExercise ?? current.exercise
    const nextMultiplier = draftMultiplier
    setEditingEntryId(null)
    const res = await fetch(`/api/exercise-entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: nextExercise.id, multiplier: nextMultiplier }),
    })
    if (!res.ok) return
    const updated = (await res.json()) as {
      exercise: ExerciseOption
      multiplier: number
      oneRepMax: number | null
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? {
              ...e,
              exercise: updated.exercise,
              multiplier: updated.multiplier,
              oneRepMax: updated.oneRepMax,
            }
          : e
      )
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
        skipped: false,
        exercise: {
          id: exercise.id,
          name: exercise.name,
          category: exercise.category,
          impactCoefficient: exercise.impactCoefficient,
          trainingGroup: exercise.trainingGroup,
        },
        oneRepMax: created.oneRepMax ?? null,
        sets: [],
      },
    ])
  }

  // name + N sets [+ add-set + 6 metric columns, dropped in simplified mode]
  const totalCols = simplified ? maxSets + 1 : maxSets + 8

  return (
    // NOTE: overflow-hidden lives on the inner wrapper below (header + scrolling
    // table only), not here. It used to sit on this outer div, which meant the
    // "Добавить упражнение..." autocomplete's dropdown — anchored right at the
    // bottom edge of this card — got clipped to zero height the instant it
    // opened. It only needs to clip the accent-colored header bar and the
    // horizontally-scrolling table to the card's rounded corners; the footer
    // has no bg of its own to clip.
    <div className="animate-slide-up rounded-xl border border-border bg-surface">
      <div className="overflow-hidden rounded-t-xl">
        <div className="flex items-center border-b border-border bg-accent text-on-accent">
          <Link
            href={`/workout/${workout.id}`}
            className="flex flex-1 items-center justify-between gap-2 px-3 py-1.5 transition-opacity hover:opacity-90"
            title="Открыть день"
          >
            <span className="flex items-baseline gap-2">
              <span className="font-display text-base uppercase tracking-wide">{weekday}</span>
              <span className="text-sm opacity-90">{dateLabel}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-75" />
          </Link>
          <LockToggle locked={locked} onToggle={onToggleLocked} variant="on-accent" className="mr-1.5" />
        </div>

        {/* pointer-events-none lives on the <table> itself, not this
            overflow-x-auto wrapper — putting it here used to also block
            horizontal touch-scroll/swipe on the table (pointer-events:none
            disables touch-drag panning too, not just clicks), so a locked
            (default) day couldn't be swiped sideways on mobile at all. The
            table still visually dims/disables the same way; only the
            scroll container itself stays interactive. */}
        <div className="overflow-x-auto">
        <table
          className={`w-full min-w-max border-collapse text-sm ${locked ? 'pointer-events-none select-none opacity-70' : ''}`}
        >
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
              {!simplified && (
                <>
                  <th className="px-1 py-1" />
                  <th className="px-1.5 py-1 text-right font-bold">Тонн</th>
                  <th className="px-1.5 py-1 text-right font-bold">Срвес</th>
                  <th className="px-1.5 py-1 text-right font-bold">Инт%</th>
                  <th className="px-1.5 py-1 text-right font-bold">ПМ</th>
                  <th className="px-1.5 py-1 text-right font-bold">КПШ</th>
                  <th className="px-1.5 py-1 text-right font-bold">КО</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                {entries.map((entry, index) => {
                  const m = perEntryMetrics.get(entry.id)!
                  const canEditOneRepMax =
                    role === 'COACH' || entry.exercise.trainingGroup === 'GPP'
                  return (
                    <WeekDayTableRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                      metrics={m}
                      maxSets={maxSets}
                      canEditOneRepMax={canEditOneRepMax}
                      canCreateExercise={canCreateExercise}
                      locked={locked}
                      simplified={simplified}
                      isEditing={editingEntryId === entry.id}
                      draftExercise={draftExercise}
                      draftMultiplier={draftMultiplier}
                      onStartEdit={startEditingExercise}
                      onCancelEdit={() => setEditingEntryId(null)}
                      onSaveEdit={saveExerciseEdit}
                      onDraftExerciseChange={setDraftExercise}
                      onDraftMultiplierChange={setDraftMultiplier}
                      onToggleSkipped={toggleSkipped}
                      onRemoveExercise={removeExercise}
                      onRemoveSet={removeSet}
                      onAddSet={addSet}
                      onUpdateSet={updateSetLocally}
                      onUpdateOneRepMax={updateOneRepMaxLocally}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
            {entries.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-2 py-2 text-center text-text-secondary">
                  Нет упражнений
                </td>
              </tr>
            )}

            {!simplified && (
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
            )}
          </tbody>
        </table>
        </div>
      </div>

      {!simplified && (
        <div
          className={`border-t border-border p-2 ${locked ? 'pointer-events-none select-none opacity-70' : ''}`}
        >
          <ExerciseAutocomplete
            onSelect={handleAddExercise}
            placeholder="Добавить упражнение..."
            canCreate={canCreateExercise}
            clearOnSelect
            openUpward={openAddExerciseUpward}
          />
        </div>
      )}
    </div>
  )
}
