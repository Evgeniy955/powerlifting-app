import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/periodization-microcycles/:id { microcycleType } — coach-only.
// Tags a single "Микроцикл" week with one of MICROCYCLE_PRESETS (or a
// custom label), same free-text-preset pattern as the rest of the
// periodization hierarchy.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const coach = await requireCoach()

    const microcycle = await prisma.periodizationMicrocycle.findUnique({
      where: { id: params.id },
      include: { mesocycle: { include: { stage: { include: { period: true } } } } },
    })
    if (!microcycle) return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(microcycle.mesocycle.stage.period.athleteId, coach.id)

    const body = (await req.json()) as { microcycleType?: string | null }
    const updated = await prisma.periodizationMicrocycle.update({
      where: { id: params.id },
      data: { microcycleType: body.microcycleType?.trim() || null },
    })
    return NextResponse.json(updated)
  } catch (e) {
    return apiErrorResponse(e)
  }
}
