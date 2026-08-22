import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CalendarX } from 'lucide-react'
import { AthleteLiveUpdates } from '@/components/AthleteLiveUpdates'
import { AthleteCyclesList } from '@/components/AthleteCyclesList'
import { PlansHeaderActions } from '@/components/PlansHeaderActions'
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

  // Unseen-changes count per plan, for the badge on each card below — scoped
  // per cycleId (not blended across the athlete's whole history) so a coach
  // juggling several plans can tell at a glance which specific plan has
  // edits waiting, without opening each one.
  const unseenByCycle =
    user.role === 'COACH'
      ? await prisma.changeLog.groupBy({
          by: ['cycleId'],
          where: { athleteId: athlete.id, seenByCoach: false, cycleId: { not: null } },
          _count: { _all: true },
        })
      : []
  const unseenCountByCycleId = new Map(unseenByCycle.map((row) => [row.cycleId as string, row._count._all]))

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
            unseenChangesCount: unseenCountByCycleId.get(cycle.id) ?? 0,
          }))}
          canDelete={user.role === 'COACH'}
        />
      )}
    </main>
  )
}
