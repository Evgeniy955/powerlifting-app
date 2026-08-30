import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { CopyLastTwoWeeksButton } from '@/components/CopyLastTwoWeeksButton'
import { AddMicrocycleButton } from '@/components/AddMicrocycleButton'
import { DeleteCycleButton } from '@/components/DeleteCycleButton'
import { DeleteMicrocycleButton } from '@/components/DeleteMicrocycleButton'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, buttonVariants } from '@/components/ui'
import { BarChart3, FileDown, History } from 'lucide-react'
import { isMicrocycleVisibleToAthlete, currentWeekNumber } from '@/lib/weekAccess'
import { AiCoachButton } from '@/components/AiCoachButton'

// Same getUTCDay()-indexed convention as WeekDayTable/excelExport — kept
// local rather than imported since this page only needs the label, not any
// of the date-shifting logic those modules also carry.
const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

// Cycle overview: list of microcycles (weeks) -> workouts (days), plus the
// coach-only "Копировать последние 2 недели" action. Access is checked against
// the signed-in user: coach must own the athlete, athlete must own the cycle.
export default async function CyclePage({ params }: { params: { cycleId: string } }) {
  const user = await requireUser()

  const cycle = await prisma.cycle.findUnique({
    where: { id: params.cycleId },
    include: {
      athlete: true,
      microcycles: {
        orderBy: { weekNumber: 'asc' },
        include: { workouts: { orderBy: { dayNumber: 'asc' } } },
      },
    },
  })

  if (!cycle) notFound()

  const owns =
    user.role === 'COACH' ? cycle.athlete.coachId === user.id : cycle.athlete.userId === user.id
  if (!owns) redirect('/')

  // An athlete only ever sees the current and past weeks of their plan (plus
  // the coming week once it unlocks) — the coach can program ahead without
  // it showing up early. Coaches always see every week.
  const visibleMicrocycles =
    user.role === 'COACH'
      ? cycle.microcycles
      : cycle.microcycles.filter((mc) =>
          isMicrocycleVisibleToAthlete(cycle.startDate, mc.weekNumber)
        )

  // Pulled out of the grid and shown on its own, highlighted, above it — the
  // microcycle whose 7-day slot "today" actually falls into. Not just "the
  // first visible one": an athlete's plan can start weeks in the future or
  // have already finished, in which case there's no current week to call out
  // and the grid below is all there is.
  const thisWeekNumber = currentWeekNumber(cycle.startDate)
  const currentMicrocycle =
    visibleMicrocycles.find((mc) => mc.weekNumber === thisWeekNumber) ?? null
  const otherMicrocycles = currentMicrocycle
    ? visibleMicrocycles.filter((mc) => mc.id !== currentMicrocycle.id)
    : visibleMicrocycles

  // Which single day button gets the "highlighted" look: today's own
  // session if there is one, otherwise the soonest upcoming one — a rest
  // day shouldn't leave nothing highlighted, it should point ahead to what's
  // next. Scoped to visibleMicrocycles only (not the whole cycle) since
  // that's exactly what's on screen — an athlete's next real session could
  // technically sit in a not-yet-unlocked future week, in which case there's
  // nothing visible to point at and none of the rendered days light up.
  const todayStr = new Date().toISOString().slice(0, 10)
  const visibleWorkoutsByDate = visibleMicrocycles
    .flatMap((mc) => mc.workouts)
    .slice()
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())
  const highlightWorkoutId =
    visibleWorkoutsByDate.find((w) => w.scheduledDate.toISOString().slice(0, 10) === todayStr)
      ?.id ??
    visibleWorkoutsByDate.find((w) => w.scheduledDate.toISOString().slice(0, 10) > todayStr)
      ?.id ??
    null

  // Which days (workouts) in this cycle have athlete edits the coach hasn't
  // seen yet — drives the colored dot on "День N" below. Coach-only, same
  // ChangeLog signal as the "История" badge and the per-set highlight inside
  // the workout itself.
  const daysWithUnseenChanges =
    user.role === 'COACH'
      ? new Set(
          (
            await prisma.changeLog.findMany({
              where: {
                athleteId: cycle.athleteId,
                seenByCoach: false,
                workoutId: { in: cycle.microcycles.flatMap((mc) => mc.workouts.map((w) => w.id)) },
              },
              select: { workoutId: true },
              distinct: ['workoutId'],
            })
          ).map((c) => c.workoutId)
        )
      : new Set<string | null>()

  // Unseen-changes count for THIS plan's "История" button badge — scoped by
  // cycleId (not the whole athlete), same reasoning as the History screen
  // itself: several plans per athlete shouldn't share one blended count.
  const unseenCount =
    user.role === 'COACH'
      ? await prisma.changeLog.count({ where: { cycleId: cycle.id, seenByCoach: false } })
      : 0

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl uppercase tracking-wide">{cycle.name}</h1>
        {user.role === 'COACH' && (
          <DeleteCycleButton
            cycleId={cycle.id}
            cycleName={cycle.name}
            redirectTo={`/athletes/${cycle.athleteId}/cycles`}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {user.role === 'COACH' && (
          <>
            <Link
              href={`/cycles/${cycle.id}/analytics`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <BarChart3 className="h-4 w-4" /> Аналитика мезоцикла
            </Link>
            <AiCoachButton
              scope="mesocycle"
              athleteId={cycle.athleteId}
              cycleId={cycle.id}
              contextName={cycle.name}
            />
          </>
        )}
        <Link
          href={`/cycles/${cycle.id}/history`}
          className={`relative ${buttonVariants({ variant: 'outline', size: 'sm' })}`}
        >
          <History className="h-4 w-4" /> История
          {unseenCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-on-danger">
              {unseenCount > 9 ? '9+' : unseenCount}
            </span>
          )}
        </Link>
        <CopyLastTwoWeeksButton cycleId={cycle.id} role={user.role} />
        {user.role === 'COACH' && <AddMicrocycleButton cycleId={cycle.id} />}
      </div>

      {/* Pulled out above the grid and visually called out (accent border/
          tint + a "Текущий микроцикл" pill instead of just plain text) so
          the week actually in progress is unmistakable at a glance, instead
          of being just another card in the list the coach/athlete has to
          find by date. Centered rather than stretched full-width — it's a
          callout, not a section that needs to fill the row. */}
      {currentMicrocycle && (
        <div className="flex justify-center">
          <Card
            padding="sm"
            className="w-full border-2 border-accent bg-accent/10 shadow-elevated lg:max-w-lg"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <Link href={`/microcycle/${currentMicrocycle.id}`} className="min-w-0 space-y-1">
                <span className="inline-block rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-on-accent">
                  Текущий микроцикл
                </span>
                <p className="text-sm text-text-secondary transition-colors duration-150 hover:text-accent">
                  Микроцикл {currentMicrocycle.weekNumber}
                  {currentMicrocycle.workouts[0] &&
                    ` · ${currentMicrocycle.workouts[0].scheduledDate.toISOString().slice(0, 10)}`}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/microcycle/${currentMicrocycle.id}/export`}
                  aria-label={`Экспортировать микроцикл ${currentMicrocycle.weekNumber} в PDF`}
                  title="Экспорт в PDF"
                  className={buttonVariants({
                    variant: 'ghost',
                    size: 'sm',
                    className: 'text-text-secondary hover:text-accent',
                  })}
                >
                  <FileDown className="h-4 w-4" />
                </Link>
                {user.role === 'COACH' && (
                  <DeleteMicrocycleButton
                    microcycleId={currentMicrocycle.id}
                    weekNumber={currentMicrocycle.weekNumber}
                  />
                )}
              </div>
            </div>
            <WeekdayDayLinks
              workouts={currentMicrocycle.workouts}
              daysWithUnseenChanges={daysWithUnseenChanges}
              highlightWorkoutId={highlightWorkoutId}
            />
          </Card>
        </div>
      )}

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {otherMicrocycles.map((mc) => (
          <Card key={mc.id} padding="sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Link
                href={`/microcycle/${mc.id}`}
                className="text-sm text-text-secondary transition-colors duration-150 hover:text-accent"
              >
                Микроцикл {mc.weekNumber}
                {mc.workouts[0] && ` · ${mc.workouts[0].scheduledDate.toISOString().slice(0, 10)}`}
              </Link>
              {user.role === 'COACH' && (
                <DeleteMicrocycleButton microcycleId={mc.id} weekNumber={mc.weekNumber} />
              )}
            </div>
            <WeekdayDayLinks
              workouts={mc.workouts}
              daysWithUnseenChanges={daysWithUnseenChanges}
              highlightWorkoutId={highlightWorkoutId}
            />
          </Card>
        ))}
      </div>
    </main>
  )
}

// Day buttons for one microcycle card — labeled by weekday (Пн/Вт/...,
// derived from each workout's own scheduledDate) instead of "День N", since
// the day number alone didn't say which actual day of the week a session
// falls on. Shared between the highlighted current-microcycle callout above
// and the regular grid below so the two can't drift out of sync.
function WeekdayDayLinks({
  workouts,
  daysWithUnseenChanges,
  highlightWorkoutId,
}: {
  workouts: { id: string; scheduledDate: Date }[]
  daysWithUnseenChanges: Set<string | null>
  // Today's own session, or — on a rest day — the soonest one still ahead.
  // At most one day across the whole page carries this, computed once by
  // the page and passed down rather than each card guessing from its own
  // (possibly entirely past, or entirely future) slice of workouts.
  highlightWorkoutId: string | null
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {workouts.map((w) => (
        <Link
          key={w.id}
          href={`/workout/${w.id}`}
          className={`relative rounded-lg px-3 py-1 text-sm transition-colors duration-150 hover:bg-accent hover:text-on-accent ${
            w.id === highlightWorkoutId
              ? 'bg-accent font-bold text-on-accent ring-2 ring-accent ring-offset-1 ring-offset-bg'
              : 'bg-surface-2'
          }`}
        >
          {WEEKDAY_SHORT[w.scheduledDate.getUTCDay()]}
          {daysWithUnseenChanges.has(w.id) && (
            <span
              title="Есть непросмотренные изменения от атлета"
              className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-danger"
            />
          )}
        </Link>
      ))}
    </div>
  )
}
