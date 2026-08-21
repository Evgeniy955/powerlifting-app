import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/microcycles/:microcycleId { microcycleType? } — coach-only. Tags
// this microcycle (= one week) with its place in the season periodization
// timeline (/athletes/[athleteId]/periodization) — the "Микроциклы" row.
// Pass null to clear the tag back to "not set". No other Microcycle field is
// editable this way (weekNumber/cycleId are structural, not planning data).
export async function PATCH(req: NextRequest, { params }: { params: { microcycleId: string } }) {
  try {
    const coach = await requireCoach()

    const microcycle = await prisma.microcycle.findUnique({
      where: { id: params.microcycleId },
      include: { cycle: true },
    })
    if (!microcycle) {
      return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(microcycle.cycle.athleteId, coach.id)

    const body = (await req.json()) as { microcycleType?: string | null }
    if (!('microcycleType' in body)) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    const data: Record<string, string | null> = {
      microcycleType: body.microcycleType?.trim() || null,
    }
    const updated = await prisma.microcycle.update({
      where: { id: params.microcycleId },
      data,
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
