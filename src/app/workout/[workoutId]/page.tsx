import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'
import { WorkoutView } from '@/components/WorkoutView'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { isMicrocycleVisibleToAthlete } from '@/lib/weekAccess'
import type { SetChange } from '@/components/SetRow'

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

  // Coach-only: what the athlete changed on this day since it was last
  // opened. Fetched as "unseen", then immediately marked seen — the variable
  // below still holds the pre-update snapshot, so this exact render is the
  // one time it highlights; the next visit is back to normal. Only
  // set-updated (which field/set) and exercise-added (which entry) have
  // anything left in the current view to highlight — set-removed/
  // exercise-removed refer to rows that no longer exist here, but opening
  // this day still counts as having seen them (they're covered by
  // История instead).
  let changedSets: Record<string, SetChange> | undefined
  let newExerciseEntryIds: string[] | undefined
  if (user.role === 'COACH') {
    const unseen = await prisma.changeLog.findMany({
      where: { workoutId: workout.id, seenByCoach: false },
    })
    if (unseen.length > 0) {
      await prisma.changeLog.updateMany({
        where: { id: { in: unseen.map((c) => c.id) } },
        data: { seenByCoach: true },
      })

      changedSets = {}
      const newEntries = new Set<string>()
      for (const c of unseen) {
        if (
          c.kind === 'set-updated' &&
          c.setEntryId &&
          (c.field === 'weight' || c.field === 'reps') &&
          c.beforeValue !== null
        ) {
          changedSets[c.setEntryId] = {
            ...changedSets[c.setEntryId],
            [c.field]: c.beforeValue,
          }
        }
        if (c.kind === 'exercise-added' && c.exerciseEntryId) {
          newEntries.add(c.exerciseEntryId)
        }
      }
      newExerciseEntryIds = Array.from(newEntries)
    }
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
      </div>
      <WorkoutView
        workoutId={workout.id}
        initialEntries={workout.exerciseEntries}
        rpeTable={rpeTable}
        canCreateExercise={user.role === 'COACH'}
        weekNumber={workout.weekNumber}
        dayNumber={workout.dayNumber}
        scheduledDate={workout.scheduledDate.toISOString().slice(0, 10)}
        prevDay={workout.prevDay}
        nextDay={workout.nextDay}
        changedSets={changedSets}
        newExerciseEntryIds={newExerciseEntryIds}
        initialSimplified={user.simplifiedView}
      />
    </main>
  )
}
