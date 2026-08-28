import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertAthleteAccessible } from '@/lib/authorization'

// GET /api/athletes/:athleteId/supplements — list, newest intake first.
// Accessible to the athlete themselves and their coach (same ownsAthlete
// rule as everything else athlete-scoped).
export async function GET(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertAthleteAccessible(params.athleteId, user)

    const supplements = await prisma.supplement.findMany({
      where: { athleteId: params.athleteId },
      orderBy: { startDate: 'desc' },
    })
    return NextResponse.json(supplements)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// POST /api/athletes/:athleteId/supplements { name, startDate, endDate?, notes? }
// Athlete logs a supplement they're taking (or a coach, on their behalf) — a
// name plus an intake period. endDate is optional (still taking it / open-ended).
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertAthleteAccessible(params.athleteId, user)

    const body = await req.json()
    const { name, startDate, endDate, notes } = body as {
      name: string
      startDate: string
      endDate?: string | null
      notes?: string | null
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    }
    if (!startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    const start = new Date(startDate)
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
    }
    let end: Date | null = null
    if (endDate) {
      end = new Date(endDate)
      if (isNaN(end.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата окончания' }, { status: 400 })
      }
      if (end < start) {
        return NextResponse.json(
          { error: 'Дата окончания раньше даты начала' },
          { status: 400 }
        )
      }
    }

    const supplement = await prisma.supplement.create({
      data: {
        athleteId: params.athleteId,
        name: name.trim(),
        startDate: start,
        endDate: end,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(supplement, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
