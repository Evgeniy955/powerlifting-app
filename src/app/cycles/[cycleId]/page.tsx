import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { CopyLastTwoWeeksButton } from '@/components/CopyLastTwoWeeksButton'
import { DeleteCycleButton } from '@/components/DeleteCycleButton'
import { DeleteMicrocycleButton } from '@/components/DeleteMicrocycleButton'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, buttonVariants } from '@/components/ui'
import { BarChart3 } from 'lucide-react'

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
          <Link
            href={`/cycles/${cycle.id}/analytics`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <BarChart3 className="h-4 w-4" /> Аналитика мезоцикла
          </Link>
        )}
        <CopyLastTwoWeeksButton cycleId={cycle.id} role={user.role} />
      </div>

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {cycle.microcycles.map((mc) => (
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
            <div className="flex flex-wrap gap-2">
              {mc.workouts.map((w) => (
                <Link
                  key={w.id}
                  href={`/workout/${w.id}`}
                  className="rounded-lg bg-surface-2 px-3 py-1 text-sm transition-colors duration-150 hover:bg-accent hover:text-on-accent"
                >
                  День {w.dayNumber}
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </main>
  )
}
