import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { dateRangesOverlap } from '@/lib/dateOverlap'

// PATCH /api/periods/:periodId { name?, startDate?, endDate? } — coach-only.
// Period's own date range is edited directly here (a date-range picker on
// the periodization page), independent of the stages/mesocycles inside it.
export async function PATCH(req: NextRequest, { params }: { params: { periodId: string } }) {
  try {
    const coach = await requireCoach()

    const period = await prisma.period.findUnique({ where: { id: params.periodId } })
    if (!period) return NextResponse.json({ error: 'Период не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(period.athleteId, coach.id)

    const body = (await req.json()) as { name?: string; startDate?: string; endDate?: string }
    const data: Record<string, string | Date> = {}
    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Название периода обязательно' }, { status: 400 })
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
      const effectiveStart = data.startDate instanceof Date ? data.startDate : period.startDate
      const effectiveEnd = data.endDate instanceof Date ? data.endDate : period.endDate
      const siblings = await prisma.period.findMany({
        where: { athleteId: period.athleteId, id: { not: params.periodId } },
        select: { name: true, startDate: true, endDate: true },
      })
      const overlapping = siblings.find((s) => dateRangesOverlap(effectiveStart, effectiveEnd, s.startDate, s.endDate))
      if (overlapping) {
        return NextResponse.json(
          { error: `Пересекается по датам с периодом «${overlapping.name}» — выберите другие даты` },
          { status: 400 }
        )
      }
    }

    const updated = await prisma.period.update({ where: { id: params.periodId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/periods/:periodId — coach-only. Cascades to its Stages
// (schema onDelete: Cascade), which in turn cascade to their Mesocycles and
// PeriodizationMicrocycles. Real training plans (Cycle) are a completely
// separate model with no relation to Period/Stage at all, so they're never
// affected by this.
export async function DELETE(_req: NextRequest, { params }: { params: { periodId: string } }) {
  try {
    const coach = await requireCoach()

    const period = await prisma.period.findUnique({ where: { id: params.periodId } })
    if (!period) return NextResponse.json({ error: 'Период не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(period.athleteId, coach.id)

    await prisma.period.delete({ where: { id: params.periodId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
