import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessCompetition } from '@/lib/authorization'

// PATCH /api/athletes/:athleteId/competitions/:competitionId
// { name?, date?, weightClass?, bodyweight?, squat?, bench?, deadlift?, place?, notes? }
// Any field can be omitted to leave it unchanged; any nullable field can be
// explicitly set to null to clear it (e.g. a lift result gets corrected to
// "no result" without deleting the whole entry).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { athleteId: string; competitionId: string } }
) {
  try {
    const user = await requireUser()
    await assertCanAccessCompetition(params.competitionId, user)

    const body = (await req.json()) as {
      name?: string
      date?: string
      weightClass?: string | null
      bodyweight?: number | null
      squat?: number | null
      bench?: number | null
      deadlift?: number | null
      place?: number | null
      notes?: string | null
    }
    const data: {
      name?: string
      date?: Date
      weightClass?: string | null
      bodyweight?: number | null
      squat?: number | null
      bench?: number | null
      deadlift?: number | null
      place?: number | null
      notes?: string | null
    } = {}

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
      data.name = name
    }
    if (body.date !== undefined) {
      const parsedDate = new Date(body.date)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 })
      }
      data.date = parsedDate
    }
    if (body.weightClass !== undefined) {
      data.weightClass = body.weightClass?.trim() || null
    }
    if (body.notes !== undefined) {
      data.notes = body.notes?.trim() || null
    }

    if (body.bodyweight !== undefined) {
      if (body.bodyweight !== null && (typeof body.bodyweight !== 'number' || body.bodyweight < 0)) {
        return NextResponse.json({ error: 'Некорректный вес спортсмена' }, { status: 400 })
      }
      data.bodyweight = body.bodyweight
    }
    if (body.squat !== undefined) {
      if (body.squat !== null && (typeof body.squat !== 'number' || body.squat < 0)) {
        return NextResponse.json({ error: 'Некорректный результат в приседе' }, { status: 400 })
      }
      data.squat = body.squat
    }
    if (body.bench !== undefined) {
      if (body.bench !== null && (typeof body.bench !== 'number' || body.bench < 0)) {
        return NextResponse.json({ error: 'Некорректный результат в жиме' }, { status: 400 })
      }
      data.bench = body.bench
    }
    if (body.deadlift !== undefined) {
      if (body.deadlift !== null && (typeof body.deadlift !== 'number' || body.deadlift < 0)) {
        return NextResponse.json({ error: 'Некорректный результат в тяге' }, { status: 400 })
      }
      data.deadlift = body.deadlift
    }
    if (body.place !== undefined) {
      if (body.place !== null && (!Number.isInteger(body.place) || body.place < 1)) {
        return NextResponse.json({ error: 'Место должно быть целым числом от 1' }, { status: 400 })
      }
      data.place = body.place
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const updated = await prisma.competition.update({
      where: { id: params.competitionId },
      data,
    })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/athletes/:athleteId/competitions/:competitionId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { athleteId: string; competitionId: string } }
) {
  try {
    const user = await requireUser()
    await assertCanAccessCompetition(params.competitionId, user)

    await prisma.competition.delete({ where: { id: params.competitionId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
