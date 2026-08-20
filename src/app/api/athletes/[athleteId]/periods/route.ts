import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/athletes/:athleteId/periods { name, startDate, endDate } —
// coach-only. Creates a top-level "Период" for this athlete's periodization
// timeline (/athletes/[athleteId]/periodization). Independent date range,
// not derived from anything nested inside it.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const body = (await req.json()) as { name?: string; startDate?: string; endDate?: string }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название периода обязательно' }, { status: 400 })
    }
    if (!body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'Укажите даты начала и окончания' }, { status: 400 })
    }
    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Некорректные даты' }, { status: 400 })
    }

    const period = await prisma.period.create({
      data: { athleteId: params.athleteId, name: body.name.trim(), startDate, endDate },
    })
    return NextResponse.json(period, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
