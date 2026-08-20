import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { dateRangesOverlap } from '@/lib/dateOverlap'

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

    if (data.startDate || data.endDate) {
      const effectiveStart = data.startDate instanceof Date ? data.startDate : stage.startDate
      const effectiveEnd = data.endDate instanceof Date ? data.endDate : stage.endDate
      const siblings = await prisma.stage.findMany({
        where: { periodId: stage.periodId, id: { not: params.stageId } },
        select: { name: true, startDate: true, endDate: true },
      })
      const overlapping = siblings.find((s) => dateRangesOverlap(effectiveStart, effectiveEnd, s.startDate, s.endDate))
      if (overlapping) {
        return NextResponse.json(
          { error: `Пересекается по датам с этапом «${overlapping.name}» — выберите другие даты` },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.stage.update({ where: { id: params.stageId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/stages/:stageId — coach-only. Cascades to its Mesocycles
// (schema onDelete: Cascade), which in turn cascade to their
// PeriodizationMicrocycles. Real training plans (Cycle) have no relation
// to Stage at all, so they're never affected by this.
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
