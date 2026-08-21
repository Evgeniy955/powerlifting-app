import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/mesocycles/:mesocycleId/microcycles — coach-only. Appends one
// more "Микроцикл" week (weekNumber = current max + 1) and bumps the
// mesocycle's own `weeks` count to match, mirroring the "+ Неделя" action
// that used to add a Microcycle onto a Cycle.
export async function POST(_req: NextRequest, { params }: { params: { mesocycleId: string } }) {
  try {
    const coach = await requireCoach()

    const mesocycle = await prisma.mesocycle.findUnique({
      where: { id: params.mesocycleId },
      include: { stage: { include: { period: true } }, microcycles: true },
    })
    if (!mesocycle) return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(mesocycle.stage.period.athleteId, coach.id)

    const nextWeekNumber = mesocycle.microcycles.reduce((max, m) => Math.max(max, m.weekNumber), 0) + 1

    const [, created] = await prisma.$transaction([
      prisma.mesocycle.update({ where: { id: params.mesocycleId }, data: { weeks: nextWeekNumber } }),
      prisma.periodizationMicrocycle.create({
        data: { id: randomUUID(), mesocycleId: params.mesocycleId, weekNumber: nextWeekNumber },
      }),
    ])

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
