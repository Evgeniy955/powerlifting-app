import { getMicrocycleForDisplay, getRpeTable } from '@/lib/workout'
import { requireUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { WorkoutView } from '@/components/WorkoutView'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Whole-week view: every day (Workout) of a microcycle rendered on one page, each
// as its own <WorkoutView> section — lets a coach/athlete review or edit an entire
// week without clicking into each day separately. Reuses the same day-view
// component the single-day page uses, so editing behavior (add exercise, add set,
// recalculated metrics) is identical either way.
export default async function MicrocyclePage({
  params,
}: {
  params: { microcycleId: string }
}) {
  const user = await requireUser()

  const [microcycle, rpeTable] = await Promise.all([
    getMicrocycleForDisplay(params.microcycleId),
    getRpeTable(),
  ])
  if (!microcycle) notFound()

  const athlete = await prisma.athleteProfile.findUnique({ where: { id: microcycle.athleteId } })
  if (!athlete) notFound()
  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary py-6">
      <div className="mx-auto mb-6 max-w-md px-4 text-center lg:max-w-6xl">
        <Link
          href={`/cycles/${microcycle.cycleId}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {microcycle.cycleName}
        </Link>
        <h1 className="font-display text-xl uppercase tracking-wide">
          Неделя {microcycle.weekNumber}
        </h1>
      </div>

      {microcycle.workouts.length === 0 ? (
        <p className="text-center text-sm text-text-secondary">
          В этой неделе пока нет тренировок.
        </p>
      ) : (
        <div className="space-y-8">
          {microcycle.workouts.map((workout) => (
            <section key={workout.id}>
              <div className="mb-2 text-center">
                <h2 className="font-display text-base uppercase tracking-wide text-text-secondary">
                  День {workout.dayNumber}
                </h2>
                <p className="text-xs text-text-secondary">
                  {workout.scheduledDate.toISOString().slice(0, 10)}
                </p>
              </div>
              <WorkoutView
                workoutId={workout.id}
                initialEntries={workout.exerciseEntries}
                rpeTable={rpeTable}
              />
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
