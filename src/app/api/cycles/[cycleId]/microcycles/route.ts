import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/cycles/:cycleId/microcycles — coach-only. Appends one empty
// microcycle (next weekNumber, no workouts yet) to a plan — the cycle page's
// "+ Добавить микроцикл", the counterpart to DeleteMicrocycleButton. The
// coach adds actual training days for the new week afterward via the week's
// own page, same as any ad-hoc week. Doesn't touch Cycle.weeks — that's just
// an informational total (see duplicate-last-two-weeks/route.ts), already
// left untouched by delete for the same reason.
export async function POST(_req: NextRequest, props: { params: Promise<{ cycleId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({
      where: { id: params.cycleId },
      include: { microcycles: { select: { weekNumber: true } } },
    })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const nextWeek = cycle.microcycles.reduce((max, mc) => Math.max(max, mc.weekNumber), 0) + 1

    const microcycle = await prisma.microcycle.create({
      data: { cycleId: cycle.id, weekNumber: nextWeek },
    })

    return NextResponse.json(microcycle, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
