import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'
import { WorkoutView } from '@/components/WorkoutView'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

// Server component: loads the workout + RPE table once, then hands off to the
// client-side WorkoutView for the interactive, reactive editing experience.
export default async function WorkoutPage({ params }: { params: { workoutId: string } }) {
  const [workout, rpeTable] = await Promise.all([
    getWorkoutForDisplay(params.workoutId),
    getRpeTable(),
  ])

  if (!workout) notFound()

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary py-6">
      <div className="mb-4 text-center">
        <Link
          href={`/microcycle/${workout.microcycleId}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Микроцикл {workout.weekNumber}
        </Link>

        <div className="flex items-center justify-center gap-3">
          {workout.prevDay ? (
            <Link
              href={`/workout/${workout.prevDay.id}`}
              aria-label={`День ${workout.prevDay.dayNumber}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="h-8 w-8 shrink-0" />
          )}

          <div>
            <h1 className="font-display text-xl uppercase tracking-wide">
              Микроцикл {workout.weekNumber} · День {workout.dayNumber}
            </h1>
            <p className="text-sm text-text-secondary">
              {workout.scheduledDate.toISOString().slice(0, 10)}
            </p>
          </div>

          {workout.nextDay ? (
            <Link
              href={`/workout/${workout.nextDay.id}`}
              aria-label={`День ${workout.nextDay.dayNumber}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
            >
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="h-8 w-8 shrink-0" />
          )}
        </div>
      </div>
      <WorkoutView
        workoutId={workout.id}
        initialEntries={workout.exerciseEntries}
        rpeTable={rpeTable}
      />
    </main>
  )
}
