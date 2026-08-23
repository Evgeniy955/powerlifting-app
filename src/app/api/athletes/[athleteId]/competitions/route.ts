import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertAthleteAccessible } from '@/lib/authorization'

// GET /api/athletes/:athleteId/competitions — list, most recent meet first.
// Accessible to the athlete themselves and their coach (same ownsAthlete
// rule as Спортпит and everything else athlete-scoped).
export async function GET(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertAthleteAccessible(params.athleteId, user)

    const competitions = await prisma.competition.findMany({
      where: { athleteId: params.athleteId },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(competitions)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// POST /api/athletes/:athleteId/competitions
// { name, date, weightClass?, bodyweight?, squat?, bench?, deadlift?, place?, notes? }
// Logs one meet's results. Only name and date are required — the three lift
// numbers, weight class, bodyweight and place are each independently
// optional, since a coach might record a meet before every result is in, or
// an athlete no-lifted one of the three.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertAthleteAccessible(params.athleteId, user)

    const body = await req.json()
    const {
      name,
      date,
      weightClass,
      bodyweight,
      squat,
      bench,
      deadlift,
      place,
      notes,
    } = body as {
      name: string
      date: string
      weightClass?: string | null
      bodyweight?: number | null
      squat?: number | null
      bench?: number | null
      deadlift?: number | null
      place?: number | null
      notes?: string | null
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Название соревнования обязательно' }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Дата обязательна' }, { status: 400 })
    }
    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 })
    }

    const numericFields = { bodyweight, squat, bench, deadlift }
    for (const [key, value] of Object.entries(numericFields)) {
      if (value !== undefined && value !== null && (typeof value !== 'number' || value < 0)) {
        return NextResponse.json({ error: `Некорректное значение поля «${key}»` }, { status: 400 })
      }
    }
    if (place !== undefined && place !== null && (!Number.isInteger(place) || place < 1)) {
      return NextResponse.json({ error: 'Место должно быть целым числом от 1' }, { status: 400 })
    }

    const competition = await prisma.competition.create({
      data: {
        athleteId: params.athleteId,
        name: name.trim(),
        date: parsedDate,
        weightClass: weightClass?.trim() || null,
        bodyweight: bodyweight ?? null,
        squat: squat ?? null,
        bench: bench ?? null,
        deadlift: deadlift ?? null,
        place: place ?? null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(competition, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
