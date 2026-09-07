import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymPlanAccess, formatGymWeekDateRange } from '@/lib/gym'
import { Card } from '@/components/ui'
import { AiCoachButton } from '@/components/AiCoachButton'
import { currentWeekNumber } from '@/lib/weekAccess'

export default async function GymPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const user = await requireUser()
  const { planId } = await params
  const plan = await prisma.gymPlan.findUnique({
    where: { id: planId },
    include: { client: true, weeksData: { orderBy: { weekNumber: 'asc' }, include: { workouts: { orderBy: { dayNumber: 'asc' } } } } },
  })
  if (!plan) notFound()
  await assertGymPlanAccess(planId, user)

  // Same "pull the in-progress week out and highlight it" treatment as the
  // powerlifting side's cycle overview (src/app/cycles/[cycleId]/page.tsx) —
  // GymPlan/GymWeek/GymWorkout mirror Cycle/Microcycle/Workout's shape
  // exactly, so the same Monday-anchored week math applies unchanged.
  const thisWeekNumber = currentWeekNumber(plan.startDate)
  const currentWeek = plan.weeksData.find((w) => w.weekNumber === thisWeekNumber) ?? null
  const otherWeeks = currentWeek
    ? plan.weeksData.filter((w) => w.id !== currentWeek.id)
    : plan.weeksData

  // Which single day badge gets the "highlighted" look across the whole
  // plan: today's own session if there is one, otherwise the soonest
  // upcoming one — same fallback as the powerlifting side so a rest day
  // still points at what's next instead of highlighting nothing.
  const todayStr = new Date().toISOString().slice(0, 10)
  const workoutsByDate = plan.weeksData
    .flatMap((w) => w.workouts)
    .slice()
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
  const highlightWorkoutId =
    workoutsByDate.find((w) => w.scheduledDate.toISOString().slice(0, 10) === todayStr)?.id ??
    workoutsByDate.find((w) => w.scheduledDate.toISOString().slice(0, 10) > todayStr)?.id ??
    null

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/gym/athletes/${plan.clientId}/plans`} className="text-sm text-text-secondary">← Планы</Link>
          <h1 className="font-display text-xl uppercase">{plan.name}</h1>
        </div>
        {user.role === 'COACH' && (
          <AiCoachButton scope="mesocycle" athleteId={plan.clientId} contextName={plan.name} endpoint="gym" />
        )}
      </div>

      {/* Pulled out above the grid and visually called out — accent border/
          tint + a "Текущая неделя" pill — same recipe as the "Текущий
          микроцикл" callout on the powerlifting side, so the week actually
          in progress is unmistakable at a glance. */}
      {currentWeek && (
        <div className="flex justify-center">
          <Card
            padding="sm"
            className="w-full border-2 border-accent bg-accent/10 shadow-elevated sm:max-w-lg"
          >
            {/* Week title and day badges are separate links (not one nested
                inside the other, which used to make every day badge just
                navigate to the week — clicking a day now opens that
                workout directly, same pattern as GymWeekView and the
                powerlifting side's cycle overview). */}
            <Link href={`/gym/weeks/${currentWeek.id}`} className="block hover:text-accent">
              <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-on-accent">
                Текущая неделя
              </span>
              <h2 className="mt-1 font-display uppercase">Неделя {currentWeek.weekNumber}</h2>
              {formatGymWeekDateRange(currentWeek.workouts) && (
                <p className="mt-1 text-xs text-text-secondary">{formatGymWeekDateRange(currentWeek.workouts)}</p>
              )}
            </Link>
            <GymDayLinks workouts={currentWeek.workouts} highlightWorkoutId={highlightWorkoutId} />
          </Card>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {otherWeeks.map((w) => (
          <Card key={w.id}>
            <Link href={`/gym/weeks/${w.id}`} className="block hover:text-accent">
              <h2 className="font-display uppercase">Неделя {w.weekNumber}</h2>
              {formatGymWeekDateRange(w.workouts) && (
                <p className="mt-1 text-xs text-text-secondary">{formatGymWeekDateRange(w.workouts)}</p>
              )}
            </Link>
            <GymDayLinks workouts={w.workouts} highlightWorkoutId={highlightWorkoutId} />
          </Card>
        ))}
      </div>
    </main>
  )
}

// Day badges for one week card — shared between the highlighted
// current-week callout above and the regular grid below so the two can't
// drift out of sync. `highlightWorkoutId` is computed once by the page
// across the whole plan (see above), not re-derived per card.
function GymDayLinks({
  workouts,
  highlightWorkoutId,
}: {
  workouts: { id: string; dayNumber: number }[]
  highlightWorkoutId: string | null
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {workouts.map((day) => (
        <Link
          key={day.id}
          href={`/gym/workouts/${day.id}`}
          className={`rounded border px-2 py-1 text-xs transition-colors ${
            day.id === highlightWorkoutId
              ? 'border-accent bg-accent font-bold text-on-accent ring-2 ring-accent ring-offset-1 ring-offset-bg'
              : 'border-border hover:border-accent hover:text-accent'
          }`}
        >
          День {day.dayNumber}
        </Link>
      ))}
    </div>
  )
}
