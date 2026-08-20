import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/cycles/:cycleId/microcycles — coach-only. Appends one empty
// microcycle (next weekNumber, no workouts yet) to an existing mesocycle —
// the periodization table's "+" on the Микроциклы row, for extending a plan
// by a week without recreating it. The coach adds actual training days for
// the new week afterward via the cycle's own page, same as any ad-hoc week.
export async function POST(_req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({
      where: { id: params.cycleId },
      include: { microcycles: { select: { weekNumber: true } } },
    })
    if (!cycle) {
      return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const nextWeek = cycle.microcycles.reduce((max, mc) => Math.max(max, mc.weekNumber), 0) + 1

    const [microcycle] = await prisma.$transaction([
      prisma.microcycle.create({
        data: { id: randomUUID(), cycleId: params.cycleId, weekNumber: nextWeek },
      }),
      prisma.cycle.update({ where: { id: params.cycleId }, data: { weeks: nextWeek } }),
    ])

    return NextResponse.json(microcycle, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
