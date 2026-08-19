import { getMicrocycleForDisplay, getRpeTable } from '@/lib/workout'
import { requireUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { WeekDayTable } from '@/components/WeekDayTable'
import { MetricsBadge } from '@/components/MetricsBadge'
import { TrainingGroupLegend } from '@/components/TrainingGroupLegend'
import { computeExerciseMetrics, aggregateMetrics } from '@/lib/metrics'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, BarChart3 } from 'lucide-react'
import { buttonVariants } from '@/components/ui'

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
      <div className="mx-auto mb-6 max-w-md space-y-4 px-4 lg:max-w-6xl">
        <div className="text-center">
          <Link
            href={`/cycles/${microcycle.cycleId}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {microcycle.cycleName}
          </Link>
          <div className="mb-2">
            <Link
              href={`/cycles/${microcycle.cycleId}/analytics`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <BarChart3 className="h-4 w-4" /> Аналитика мезоцикла
            </Link>
          </div>
          <div className="flex items-center justify-center gap-3">
            {microcycle.prevWeek ? (
              <Link
                href={`/microcycle/${microcycle.prevWeek.id}`}
                aria-label={`Микроцикл ${microcycle.prevWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}

            <h1 className="font-display text-xl uppercase tracking-wide">
              Микроцикл {microcycle.weekNumber}
            </h1>

            {microcycle.nextWeek ? (
              <Link
                href={`/microcycle/${microcycle.nextWeek.id}`}
                aria-label={`Микроцикл ${microcycle.nextWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}
          </div>
        </div>

        {allEntryMetrics.length > 0 && (
          <MetricsBadge
            tonnage={weekTotals.tonnage}
            avgWeight={weekTotals.avgWeight}
            relativeIntensity={weekTotals.relativeIntensity}
            kpsh={weekTotals.kpsh}
            loadCoefficient={weekTotals.loadCoefficient}
            fatigueIndex={weekTotals.fatigueIndex}
          />
        )}

        <TrainingGroupLegend />
      </div>

      {microcycle.workouts.length === 0 ? (
        <p className="text-center text-sm text-text-secondary">
          В этом микроцикле пока нет тренировок.
        </p>
      ) : (
        <div className="mx-auto max-w-md space-y-3 px-4 lg:max-w-6xl">
          {microcycle.workouts.map((workout) => (
            <WeekDayTable
              key={workout.id}
              workout={workout}
              rpeTable={rpeTable}
              athleteId={microcycle.athleteId}
              canEditOneRepMax={user.role === 'COACH'}
              canCreateExercise={user.role === 'COACH'}
            />
          ))}
        </div>
      )}
    </main>
  )
}
