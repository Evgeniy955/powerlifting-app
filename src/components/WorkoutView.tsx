'use client'

import { useState } from 'react'
import { ExerciseCard, type ExerciseEntryData } from './ExerciseCard'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import { Card } from '@/components/ui'
import type { RpePoint } from '@/lib/rpe'

type Props = {
  workoutId: string
  initialEntries: ExerciseEntryData[]
  rpeTable: RpePoint[]
}

// Orchestrates the exercise cards for a single training day and lets the user
// (coach or athlete) add another exercise on the fly via the autocomplete.
export function WorkoutView({ workoutId, initialEntries, rpeTable }: Props) {
  const [entries, setEntries] = useState<ExerciseEntryData[]>(initialEntries)

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
        },
        oneRepMax: null,
        sets: [],
      },
    ])
  }

  return (
    // Mobile: single stacked column of cards (unchanged touch-first layout).
    // Desktop (lg+): wider canvas, exercises laid out as a 2/3-column grid so
    // a coach reviewing a session sees several exercises at once instead of
    // scrolling through one long column.
    <div className="max-w-md mx-auto p-4 space-y-4 lg:max-w-6xl lg:space-y-0">
      <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 xl:grid-cols-3">
        {entries.map((entry, index) => (
          <ExerciseCard key={entry.id} entry={entry} rpeTable={rpeTable} position={index + 1} />
        ))}
      </div>

      <Card className="lg:mt-4">
        <p className="text-sm text-text-secondary mb-2">Добавить упражнение</p>
        <ExerciseAutocomplete onSelect={handleAddExercise} />
      </Card>
    </div>
  )
}
