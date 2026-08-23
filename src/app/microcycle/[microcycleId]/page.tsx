import { getMicrocycleForDisplay, getRpeTable } from '@/lib/workout'
import { requireUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { MicrocycleWeekView } from '@/components/MicrocycleWeekView'
import { computeExerciseMetrics, aggregateMetrics } from '@/lib/metrics'
import { notFound, redirect } from 'next/navigation'
import { isMicrocycleVisibleToAthlete } from '@/lib/weekAccess'

// Whole-week view: every day (Workout) of a microcycle rendered on one page as a
// dense spreadsheet-style table (WeekDayTable) — one row per exercise, one narrow
// column per set — instead of the tall per-exercise cards the single-day page
// uses, so a coach/athlete can scan or edit an entire week without endless
// scrolling. Mirrors the layout of the source Excel workbook this app replaced.
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

  // Same current/past-only rule as the cycle page's week list — block direct
  // URL access to a week that hasn't unlocked yet for this athlete.
  if (
    user.role === 'ATHLETE' &&
    !isMicrocycleVisibleToAthlete(microcycle.cycleStartDate, microcycle.weekNumber)
  ) {
    redirect(`/cycles/${microcycle.cycleId}`)
  }

  const nextWeekVisible =
    user.role === 'COACH' ||
    (microcycle.nextWeek &&
      isMicrocycleVisibleToAthlete(microcycle.cycleStartDate, microcycle.nextWeek.weekNumber))

  // Week-total summary, computed once from the initial data (matches the
  // "Микроцикл N" summary row in the source spreadsheet). Doesn't live-update as
  // you edit sets below — each day's table recalculates its own totals reactively,
  // but re-aggregating across independent client components on every keystroke
  // wasn't worth the added complexity for a top-of-page summary.
  const allEntryMetrics = microcycle.workouts
    .flatMap((w) => w.exerciseEntries)
    .map((e) =>
      computeExerciseMetrics(
        {
          sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          oneRepMax: e.oneRepMax ?? 0,
          impactCoefficient: e.exercise.impactCoefficient,
          multiplier: e.multiplier,
        },
        rpeTable
      )
    )
  const weekTotals = aggregateMetrics(allEntryMetrics)

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary py-6">
      <MicrocycleWeekView
        microcycleId={microcycle.id}
        cycleId={microcycle.cycleId}
        cycleName={microcycle.cycleName}
        weekNumber={microcycle.weekNumber}
        prevWeek={microcycle.prevWeek}
        nextWeek={microcycle.nextWeek}
        nextWeekVisible={Boolean(nextWeekVisible)}
        athleteId={microcycle.athleteId}
        role={user.role}
        canCreateExercise={user.role === 'COACH'}
        workouts={microcycle.workouts}
        rpeTable={rpeTable}
        weekTotals={allEntryMetrics.length > 0 ? weekTotals : null}
        initialSimplified={user.simplifiedView}
      />
    </main>
  )
}
