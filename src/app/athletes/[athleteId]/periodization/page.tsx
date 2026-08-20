import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarX } from 'lucide-react'
import { PeriodizationView } from '@/components/PeriodizationView'
import { EmptyState } from '@/components/EmptyState'
import { athleteDisplayName } from '@/lib/athlete'

// Season overview for one athlete — the classic Период/Этап/Мезоцикл/Микроцикл
// planning sheet, reproduced as a top-down hierarchy: Период (own date range)
// contains one or more Этапы (own date range), each of which one or more
// Мезоциклы (= existing training-plan Cycles, attached via Cycle.stageId)
// with their own Микроциклы (weeks) underneath, same as everywhere else in
// the app. Периоды/Этапы are real dated entities now, not tags derived from
// the mesocycles inside them.
export default async function PeriodizationPage({
  params,
}: {
  params: { athleteId: string }
}) {
  const user = await requireUser()

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: params.athleteId },
    include: {
      user: { select: { name: true, email: true } },
      periods: {
        orderBy: { startDate: 'asc' },
        include: {
          stages: {
            orderBy: { startDate: 'asc' },
            include: {
              cycles: {
                orderBy: { startDate: 'asc' },
                include: { microcycles: { orderBy: { weekNumber: 'asc' } } },
              },
            },
          },
        },
      },
      cycles: {
        where: { stageId: null },
        orderBy: { startDate: 'asc' },
        select: { id: true, name: true, startDate: true, weeks: true },
      },
    },
  })
  if (!athlete) redirect('/athletes')

  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  const periods = athlete.periods.map((period) => ({
    id: period.id,
    name: period.name,
    startDate: period.startDate.toISOString(),
    endDate: period.endDate.toISOString(),
    stages: period.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      startDate: stage.startDate.toISOString(),
      endDate: stage.endDate.toISOString(),
      cycles: stage.cycles.map((cycle) => ({
        id: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate.toISOString(),
        weeks: cycle.weeks,
        mesocycleType: cycle.mesocycleType,
        microcycles: cycle.microcycles.map((mc) => ({
          id: mc.id,
          weekNumber: mc.weekNumber,
          microcycleType: mc.microcycleType,
        })),
      })),
    })),
  }))

  const unassignedCycles = athlete.cycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    startDate: cycle.startDate.toISOString(),
    weeks: cycle.weeks,
  }))

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div>
        <Link
          href={`/athletes/${athlete.id}/cycles`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Планы
        </Link>
        <h1 className="font-display text-xl uppercase tracking-wide">
          Периодизация — {athleteDisplayName(athlete)}
        </h1>
      </div>

      {periods.length === 0 && unassignedCycles.length === 0 && user.role !== 'COACH' ? (
        <EmptyState
          icon={CalendarX}
          title="Периодизация ещё не составлена"
          description="Тренер пока не разбил подготовку на периоды."
        />
      ) : (
        <PeriodizationView
          athleteId={athlete.id}
          periods={periods}
          unassignedCycles={unassignedCycles}
          canEdit={user.role === 'COACH'}
        />
      )}
    </main>
  )
}
