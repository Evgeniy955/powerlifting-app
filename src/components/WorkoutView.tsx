'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { ExerciseCard, type ExerciseEntryData } from './ExerciseCard'
import type { SetChange } from './SetRow'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import { LockToggle } from './LockToggle'
import { Card } from '@/components/ui'
import type { RpePoint } from '@/lib/rpe'

type AdjacentDay = { id: string; dayNumber: number }

type Props = {
  workoutId: string
  initialEntries: ExerciseEntryData[]
  rpeTable: RpePoint[]
  // Coach-only: lets the add-exercise / edit-exercise autocompletes create a
  // brand-new ExerciseCatalog row when the search comes up empty.
  canCreateExercise?: boolean
  // Day-header data, lifted in from the server page: the header lives here
  // (rather than in the Server Component) so it can share `locked` state
  // with the editable content below it — a Server Component can't pass a
  // callback prop across to a Client Component, so the two couldn't
  // otherwise coordinate one shared lock toggle.
  weekNumber: number
  dayNumber: number
  scheduledDate: string
  prevDay: AdjacentDay | null
  nextDay: AdjacentDay | null
  // Coach-only "what the athlete changed since you last opened this day" —
  // computed server-side from unseen ChangeLog rows and already marked seen
  // by the time this page rendered (see workout/[workoutId]/page.tsx), so
  // this is a one-time highlight, not a persistent state.
  changedSets?: Record<string, SetChange>
  newExerciseEntryIds?: string[]
}

// Orchestrates the day header (title + prev/next + lock toggle) and the
// exercise cards for a single training day, and lets the user (coach or
// athlete) add another exercise on the fly via the autocomplete.
export function WorkoutView({
  workoutId,
  initialEntries,
  rpeTable,
  canCreateExercise = false,
  weekNumber,
  dayNumber,
  scheduledDate,
  prevDay,
  nextDay,
  changedSets,
  newExerciseEntryIds,
}: Props) {
  const [entries, setEntries] = useState<ExerciseEntryData[]>(initialEntries)
  const newExerciseEntryIdSet = new Set(newExerciseEntryIds ?? [])
  // Defaults locked so a stray tap doesn't remove a set or delete an
  // exercise — has to be explicitly unlocked via the padlock first.
  const [locked, setLocked] = useState(true)

  async function handleAddExercise(exercise: ExerciseOption) {
    const res = await fetch('/api/exercise-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workoutId, exerciseId: exercise.id }),
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
        oneRepMax: null,
        sets: [],
      },
    ])
  }

  function handleRemoveExercise(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
  }

  return (
    // Mobile: single stacked column of cards (unchanged touch-first layout).
    // Desktop (lg+): wider canvas, exercises laid out as a 2/3-column grid so
    // a coach reviewing a session sees several exercises at once instead of
    // scrolling through one long column.
    <div className="max-w-md mx-auto p-4 lg:max-w-6xl">
      <div className="mb-4 flex items-center justify-center gap-3">
        {prevDay ? (
          <Link
            href={`/workout/${prevDay.id}`}
            aria-label={`День ${prevDay.dayNumber}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="h-8 w-8 shrink-0" />
        )}

        <div className="flex items-center gap-2">
          <div className="text-center">
            <h1 className="font-display text-xl uppercase tracking-wide">
              Микроцикл {weekNumber} · День {dayNumber}
            </h1>
            <p className="text-sm text-text-secondary">{scheduledDate}</p>
          </div>
          <LockToggle locked={locked} onToggle={() => setLocked((l) => !l)} />
        </div>

        {nextDay ? (
          <Link
            href={`/workout/${nextDay.id}`}
            aria-label={`День ${nextDay.dayNumber}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <span className="h-8 w-8 shrink-0" />
        )}
      </div>

      <div
        className={`space-y-4 lg:space-y-0 ${locked ? 'pointer-events-none select-none opacity-70' : ''}`}
      >
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
          {entries.map((entry, index) => (
            <ExerciseCard
              key={entry.id}
              entry={entry}
              rpeTable={rpeTable}
              position={index + 1}
              onRemove={handleRemoveExercise}
              canCreateExercise={canCreateExercise}
              changedSets={changedSets}
              isNewExercise={newExerciseEntryIdSet.has(entry.id)}
            />
          ))}
        </div>

        <Card className="lg:mt-4">
          <p className="text-sm text-text-secondary mb-2">Добавить упражнение</p>
          <ExerciseAutocomplete onSelect={handleAddExercise} canCreate={canCreateExercise} clearOnSelect />
        </Card>
      </div>
    </div>
  )
}
