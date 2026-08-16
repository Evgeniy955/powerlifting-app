import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'
import { WorkoutView } from '@/components/WorkoutView'
import { notFound } from 'next/navigation'

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
        <h1 className="font-display text-xl uppercase tracking-wide">
          Неделя {workout.weekNumber} · День {workout.dayNumber}
        </h1>
        <p className="text-sm text-text-secondary">
          {workout.scheduledDate.toISOString().slice(0, 10)}
        </p>
      </div>
      <WorkoutView
        workoutId={workout.id}
        initialEntries={workout.exerciseEntries}
        rpeTable={rpeTable}
      />
    </main>
  )
}
