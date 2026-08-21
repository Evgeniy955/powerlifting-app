import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PeriodizationView } from '@/components/PeriodizationView'
import { athleteDisplayName } from '@/lib/athlete'

// Season overview for one athlete — the classic Период/Этап/Мезоцикл/Микроцикл
// planning sheet, reproduced as a spreadsheet-style table: one column per
// mesocycle, four fixed rows underneath (Период / Этап / Мезоцикл /
// Микроцикл). Периоды/Этапы are real dated entities (own startDate/endDate,
// added independently), not tags derived from the mesocycles inside them —
// each column cascades: pick a Период, which reveals the Этап dropdown
// scoped to it, which reveals the Мезоцикл (a standalone name+duration
// entity — see the Mesocycle model's comment in schema.prisma for why this
// is deliberately NOT a real training plan/Cycle), whose Микроциклы (weeks)
// show underneath. A coach must add at least one Период before the table
// appears.
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
              mesocycles: {
                orderBy: { startDate: 'asc' },
                include: {
                  microcycles: { orderBy: { weekNumber: 'asc' } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!athlete) redirect('/athletes')

  // Coach-only: this is season-planning scaffolding for the coach to sketch
  // out ahead of time, not something an athlete needs to see or should be
  // able to poke at — unlike the rest of the athlete-facing pages (cycles,
  // periodization's own parent link), which are shared read/write with
  // read-only athlete access.
  if (user.role !== 'COACH' || athlete.coachId !== user.id) redirect('/')

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
    })),
  }))

  const columns = athlete.periods.flatMap((period) =>
    period.stages.flatMap((stage) =>
      stage.mesocycles.map((mesocycle) => ({
        id: mesocycle.id,
        name: mesocycle.name,
        startDate: mesocycle.startDate.toISOString(),
        weeks: mesocycle.weeks,
        stageId: mesocycle.stageId,
        periodId: period.id,
        microcycles: mesocycle.microcycles.map((mc) => ({
          id: mc.id,
          weekNumber: mc.weekNumber,
          microcycleType: mc.microcycleType,
        })),
      }))
    )
  )

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-none">
      <div className="mx-auto max-w-6xl">
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

      <div className="mx-auto max-w-6xl">
        <PeriodizationView athleteId={athlete.id} periods={periods} columns={columns} canEdit />
      </div>
    </main>
  )
}
