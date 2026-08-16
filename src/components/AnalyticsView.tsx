'use client'

import { useEffect, useState } from 'react'
import { ProgressChart } from './ProgressChart'
import { LoadDistributionChart } from './LoadDistributionChart'
import { AiInsightsPanel } from './AiInsightsPanel'
import { Select, Skeleton } from '@/components/ui'
import type { ProgressPoint, WeeklyLoadPoint } from '@/lib/analytics'

type TrackedExercise = { exerciseId: string; name: string }

type AnalyticsResponse = {
  weeklyLoad: WeeklyLoadPoint[]
  progress: ProgressPoint[]
  selectedExerciseId: string | null
  trackedExercises: TrackedExercise[]
}

type Props = {
  athleteId: string
  role?: 'COACH' | 'ATHLETE'
}

// Client orchestrator: loads /api/athletes/:id/analytics, lets the user switch
// which exercise's progress chart is shown, re-fetches on change.
export function AnalyticsView({ athleteId, role }: Props) {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [exerciseId, setExerciseId] = useState<string | null>(null)

  useEffect(() => {
    const url = exerciseId
      ? `/api/athletes/${athleteId}/analytics?exerciseId=${exerciseId}`
      : `/api/athletes/${athleteId}/analytics`
    fetch(url)
      .then((r) => r.json())
      .then((json: AnalyticsResponse) => {
        setData(json)
        if (!exerciseId) setExerciseId(json.selectedExerciseId)
      })
  }, [athleteId, exerciseId])

  if (!data) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const selectedName = data.trackedExercises.find((e) => e.exerciseId === exerciseId)?.name

  return (
    <div className="space-y-4">
      {data.trackedExercises.length > 0 && (
        <Select value={exerciseId ?? ''} onChange={(e) => setExerciseId(e.target.value)}>
          {data.trackedExercises.map((ex) => (
            <option key={ex.exerciseId} value={ex.exerciseId}>
              {ex.name}
            </option>
          ))}
        </Select>
      )}

      {/* Mobile: charts stacked. Desktop: side by side so both are visible
          without scrolling past one to see the other. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressChart data={data.progress} exerciseName={selectedName} />
        <LoadDistributionChart data={data.weeklyLoad} />
      </div>

      {role === 'COACH' && <AiInsightsPanel athleteId={athleteId} />}
    </div>
  )
}
