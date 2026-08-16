import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, requireUser, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// GET /api/athletes/:athleteId/one-rep-max — list all tracked 1RMs for this athlete.
// Athletes can read their own; coach can read any of their athletes'.
export async function GET(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    if (user.role === 'COACH') {
      await assertAthleteBelongsToCoach(params.athleteId, user.id)
    }
    const oneRepMaxes = await prisma.athlete1RM.findMany({
      where: { athleteId: params.athleteId },
      include: { exercise: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json(oneRepMaxes)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// POST /api/athletes/:athleteId/one-rep-max { exerciseId, value } — coach-only upsert.
// Used inline when picking an exercise from the autocomplete, to bind/update 1RM.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const { exerciseId, value } = (await req.json()) as { exerciseId: string; value: number }
    if (!exerciseId || !(value > 0)) {
      return NextResponse.json({ error: 'exerciseId и value > 0 обязательны' }, { status: 400 })
    }

    const record = await prisma.athlete1RM.upsert({
      where: { athleteId_exerciseId: { athleteId: params.athleteId, exerciseId } },
      update: { value },
      create: { athleteId: params.athleteId, exerciseId, value },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
