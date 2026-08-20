import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/stages/:stageId { name?, startDate?, endDate? } — coach-only.
export async function PATCH(req: NextRequest, { params }: { params: { stageId: string } }) {
  try {
    const coach = await requireCoach()

    const stage = await prisma.stage.findUnique({
      where: { id: params.stageId },
      include: { period: true },
    })
    if (!stage) return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(stage.period.athleteId, coach.id)

    const body = (await req.json()) as { name?: string; startDate?: string; endDate?: string }
    const data: Record<string, string | Date> = {}
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Название этапа обязательно' }, { status: 400 })
      }
      data.name = body.name.trim()
    }
    if (body.startDate !== undefined) {
      const d = new Date(body.startDate)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
      }
      data.startDate = d
    }
    if (body.endDate !== undefined) {
      const d = new Date(body.endDate)
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата окончания' }, { status: 400 })
      }
      data.endDate = d
    }

    const updated = await prisma.stage.update({ where: { id: params.stageId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/stages/:stageId — coach-only. Cascades away the Stage row;
// any Cycles attached to it are detached (stageId -> null), not deleted.
export async function DELETE(_req: NextRequest, { params }: { params: { stageId: string } }) {
  try {
    const coach = await requireCoach()

    const stage = await prisma.stage.findUnique({
      where: { id: params.stageId },
      include: { period: true },
    })
    if (!stage) return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(stage.period.athleteId, coach.id)

    await prisma.stage.delete({ where: { id: params.stageId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
