import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, History } from 'lucide-react'
import { AthleteLiveUpdates } from '@/components/AthleteLiveUpdates'
import { AthleteCyclesList } from '@/components/AthleteCyclesList'
import { PlansHeaderActions } from '@/components/PlansHeaderActions'
import { buttonVariants } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { athleteDisplayName } from '@/lib/athlete'

// List of every cycle for one athlete, so a coach can find past imports/plans
// without needing to keep a direct link around — the gap that caused a just-imported
// cycle to seem "lost" once its one-time confirmation link was closed.
export default async function AthleteCyclesPage({ params }: { params: { athleteId: string } }) {
  const user = await requireUser()

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: params.athleteId },
    include: {
      user: { select: { name: true, email: true } },
      cycles: {
        orderBy: { startDate: 'desc' },
        include: { microcycles: { select: { id: true } } },
      },
    },
  })
  if (!athlete) redirect('/athletes')

  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  // Unseen-changes count for the "История" button badge — coach-only, same
  // signal used for the per-day dot on the cycle page and the per-set
  // highlight in the workout view.
  const unseenCount =
    user.role === 'COACH'
      ? await prisma.changeLog.count({ where: { athleteId: athlete.id, seenByCoach: false } })
      : 0

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl uppercase tracking-wide">
            Планы — {athleteDisplayName(athlete)}
          </h1>
          <AthleteLiveUpdates athleteId={athlete.id} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/athletes/${athlete.id}/history`}
            className={`relative ${buttonVariants({ variant: 'outline', size: 'sm' })}`}
          >
            <History className="h-4 w-4" /> История
            {unseenCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-bold text-on-danger">
                {unseenCount > 9 ? '9+' : unseenCount}
              </span>
            )}
          </Link>
          {user.role === 'COACH' && <PlansHeaderActions athleteId={athlete.id} />}
        </div>
      </div>

      {athlete.cycles.length === 0 && (
        <EmptyState
          icon={CalendarX}
          title="Планов пока нет"
          description="Создай план или импортируй его из Excel."
        />
      )}

      {athlete.cycles.length > 0 && (
        <AthleteCyclesList
          cycles={athlete.cycles.map((cycle) => ({
            id: cycle.id,
            name: cycle.name,
            startDate: cycle.startDate.toISOString(),
            weeks: cycle.weeks,
            microcycleCount: cycle.microcycles.length,
          }))}
          canDelete={user.role === 'COACH'}
        />
      )}
    </main>
  )
}
