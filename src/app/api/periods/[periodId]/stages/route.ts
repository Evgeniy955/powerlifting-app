import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { dateRangesOverlap } from '@/lib/dateOverlap'

// POST /api/periods/:periodId/stages { name, startDate, endDate } —
// coach-only. Creates an "Этап" inside a period; several stages can sit
// under the same period. Own date range, independent of the mesocycles
// attached to it.
export async function POST(req: NextRequest, { params }: { params: { periodId: string } }) {
  try {
    const coach = await requireCoach()

    const period = await prisma.period.findUnique({ where: { id: params.periodId } })
    if (!period) return NextResponse.json({ error: 'Период не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(period.athleteId, coach.id)

    const body = (await req.json()) as { name?: string; startDate?: string; endDate?: string }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название этапа обязательно' }, { status: 400 })
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'Укажите даты начала и окончания' }, { status: 400 })
    }
    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Некорректные даты' }, { status: 400 })
    }

    // Stages inside one period must each own a distinct span of time — same
    // reasoning as the Period-vs-Period and Mesocycle-vs-Mesocycle checks.
    const siblings = await prisma.stage.findMany({
      where: { periodId: params.periodId },
      select: { name: true, startDate: true, endDate: true },
    })
    const overlapping = siblings.find((s) => dateRangesOverlap(startDate, endDate, s.startDate, s.endDate))
    if (overlapping) {
      return NextResponse.json(
        { error: `Пересекается по датам с этапом «${overlapping.name}» — выберите другие даты` },
        { status: 400 }
      )
    }

    const stage = await prisma.stage.create({
      data: { periodId: params.periodId, name: body.name.trim(), startDate, endDate },
    })
    return NextResponse.json(stage, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
