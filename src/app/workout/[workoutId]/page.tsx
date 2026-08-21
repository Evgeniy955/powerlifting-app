import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'
import { WorkoutView } from '@/components/WorkoutView'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { isMicrocycleVisibleToAthlete } from '@/lib/weekAccess'

// Server component: loads the workout + RPE table once, then hands off to the
// client-side WorkoutView for the interactive, reactive editing experience.
export default async function WorkoutPage({ params }: { params: { workoutId: string } }) {
  const user = await requireUser()

  const [workout, rpeTable] = await Promise.all([
    getWorkoutForDisplay(params.workoutId),
    getRpeTable(),
  ])

  if (!workout) notFound()

  // This page had no ownership check at all before — any signed-in user could
  // open any workout by id. Matches the same check every other cycle/week/day
  // page in the app already does.
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: workout.athleteId } })
  if (!athlete) notFound()
  const owns =
    user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  // Same current/past-only rule as the cycle page's week list — block direct
  // URL access to a day inside a week that hasn't unlocked yet for this athlete.
  if (
    user.role === 'ATHLETE' &&
    !isMicrocycleVisibleToAthlete(workout.cycleStartDate, workout.weekNumber)
  ) {
    redirect(`/cycles/${workout.cycleId}`)
  }

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
        canCreateExercise={user.role === 'COACH'}
      />
    </main>
  )
}
