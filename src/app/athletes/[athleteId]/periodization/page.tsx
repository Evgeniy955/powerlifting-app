import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarX } from 'lucide-react'
import { PeriodizationView } from '@/components/PeriodizationView'
import { EmptyState } from '@/components/EmptyState'
import { athleteDisplayName } from '@/lib/athlete'

// Season overview for one athlete — the classic Период/Этап/Мезоцикл/Микроцикл
// periodization sheet, reproduced as a horizontal timeline: one column per
// microcycle (week) across every one of the athlete's cycles in chronological
// order, with Периоды/Этапы/Мезоциклы rendered as merged cells spanning the
// weeks that belong to them. A Cycle already *is* one mesocycle (a
// contiguous block of weeks with its own start date) — periodType/stageType/
// mesocycleType tag it into the timeline, microcycleType tags each week.
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
      cycles: {
        orderBy: { startDate: 'asc' },
        include: {
          microcycles: { orderBy: { weekNumber: 'asc' } },
        },
      },
    },
  })
  if (!athlete) redirect('/athletes')

  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  const cycles = athlete.cycles.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    startDate: cycle.startDate.toISOString(),
    weeks: cycle.weeks,
    periodType: cycle.periodType,
    stageType: cycle.stageType,
    mesocycleType: cycle.mesocycleType,
    microcycles: cycle.microcycles.map((mc) => ({
      id: mc.id,
      weekNumber: mc.weekNumber,
      microcycleType: mc.microcycleType,
    })),
  }))

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-none">
      <div className="mx-auto max-w-4xl">
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

      {cycles.length === 0 ? (
        <div className="mx-auto max-w-4xl">
          <EmptyState
            icon={CalendarX}
            title="Пока нет ни одного плана"
            description="Сначала создай план (мезоцикл) на странице «Планы» — периодизация строится поверх них."
          />
        </div>
      ) : (
        <PeriodizationView
          athleteId={athlete.id}
          cycles={cycles}
          canEdit={user.role === 'COACH'}
        />
      )}
    </main>
  )
}
