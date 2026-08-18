import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'
import { AthleteLiveUpdates } from '@/components/AthleteLiveUpdates'
import { DeleteCycleButton } from '@/components/DeleteCycleButton'
import { CreatePlanDialog } from '@/components/CreatePlanDialog'
import { Card } from '@/components/ui'
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

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl uppercase tracking-wide">
            Планы — {athleteDisplayName(athlete)}
          </h1>
          <AthleteLiveUpdates athleteId={athlete.id} />
        </div>
        {user.role === 'COACH' && <CreatePlanDialog athleteId={athlete.id} />}
      </div>

      {athlete.cycles.length === 0 && (
        <EmptyState
          icon={CalendarX}
          title="Планов пока нет"
          description="Создай план или импортируй его из Excel."
        />
      )}

      <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {athlete.cycles.map((cycle) => (
          <Card key={cycle.id} padding="sm" className="transition-colors hover:bg-surface-2">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/cycles/${cycle.id}`} className="flex-1">
                <p className="font-medium">{cycle.name}</p>
                <p className="text-xs text-text-secondary">
                  {new Date(cycle.startDate).toISOString().slice(0, 10)} ·{' '}
                  {cycle.microcycles.length} нед.
                </p>
              </Link>
              {user.role === 'COACH' && (
                <DeleteCycleButton cycleId={cycle.id} cycleName={cycle.name} />
              )}
            </div>
          </Card>
        ))}
      </div>
    </main>
  )
}
