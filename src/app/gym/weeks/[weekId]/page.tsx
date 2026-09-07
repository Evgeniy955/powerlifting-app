import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileDown } from 'lucide-react'
import { requireUser } from '@/lib/session'
import { getGymWeekForDisplay, formatGymWeekDateRange } from '@/lib/gym'
import { assertGymClientAccessible } from '@/lib/authorization'
import { AiCoachButton } from '@/components/AiCoachButton'
import { GymWeekView } from '@/components/GymWeekView'

export default async function GymWeekPage({ params }: { params: Promise<{ weekId: string }> }) {
  const user = await requireUser()
  const { weekId } = await params
  const week = await getGymWeekForDisplay(weekId)
  if (!week) notFound()
  await assertGymClientAccessible(week.plan.clientId, user)
  const dateRange = formatGymWeekDateRange(week.workouts)
  // assertGymClientAccessible above already restricted access to the coach
  // or this plan's own client — anyone rendering past it may edit their own
  // sets (canEdit). Exercise-/structure-level actions (add/remove exercises
  // or days, edit ПМ) stay coach-only (canManageExercises).
  const canEdit = true
  const canManageExercises = user.role === 'COACH'

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-6xl space-y-5 bg-bg p-6 text-text-primary">
      {/* Same centered "back link above, prev/title/next row, date range
          below" layout as the powerlifting side's MicrocycleWeekView header
          — the plan-name back link and per-week actions (AI coach, export)
          used to share one cramped row with the week-number/date block,
          which read small and left-jammed next to the arrows. Splitting the
          actions onto their own top row and centering the week block gives
          "Неделя N" the same visual weight it has on the powerlifting side. */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/gym/plans/${week.planId}`}
            className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {week.plan.name}
          </Link>
          <div className="flex items-center gap-2">
            {user.role === 'COACH' && (
              <AiCoachButton
                scope="mesocycle"
                athleteId={week.plan.clientId}
                contextName={`Неделя ${week.weekNumber}`}
                endpoint="gym"
              />
            )}
            <Link
              href={`/gym/weeks/${week.id}/export`}
              title="Экспорт в PDF"
              aria-label="Экспорт в PDF"
              className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
            >
              <FileDown className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-3">
            {week.prevWeek ? (
              <Link
                href={`/gym/weeks/${week.prevWeek.id}`}
                aria-label={`Неделя ${week.prevWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}
            <h1 className="font-display text-xl uppercase tracking-wide">Неделя {week.weekNumber}</h1>
            {week.nextWeek ? (
              <Link
                href={`/gym/weeks/${week.nextWeek.id}`}
                aria-label={`Неделя ${week.nextWeek.weekNumber}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-accent"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="h-8 w-8 shrink-0" />
            )}
          </div>
          {dateRange && <p className="mt-1 text-sm text-text-secondary">{dateRange}</p>}
        </div>
      </div>

      <GymWeekView
        weekId={week.id}
        workouts={week.workouts}
        canEdit={canEdit}
        canManageExercises={canManageExercises}
        initialCompact={user.compactView}
      />
    </main>
  )
}
