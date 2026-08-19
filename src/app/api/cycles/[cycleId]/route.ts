import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/cycles/:cycleId { periodType?, stageType?, mesocycleType? } —
// coach-only. Tags this cycle (= one mesocycle) with its place in the season
// periodization timeline (/athletes/[athleteId]/periodization); pass null to
// clear a tag back to "not set". Doesn't touch name/startDate/weeks — those
// are still only editable at creation.
export async function PATCH(req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const body = (await req.json()) as {
      periodType?: string | null
      stageType?: string | null
      mesocycleType?: string | null
    }
    const data: Record<string, string | null> = {}
    if ('periodType' in body) data.periodType = body.periodType?.trim() || null
    if ('stageType' in body) data.stageType = body.stageType?.trim() || null
    if ('mesocycleType' in body) data.mesocycleType = body.mesocycleType?.trim() || null

    const updated = await prisma.cycle.update({ where: { id: params.cycleId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/cycles/:cycleId — coach-only. Deletes the cycle and everything under
// it (microcycles, workouts, exercise entries, sets) via the cascading relations
// declared in schema.prisma.
export async function DELETE(_req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    await prisma.cycle.delete({ where: { id: params.cycleId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
