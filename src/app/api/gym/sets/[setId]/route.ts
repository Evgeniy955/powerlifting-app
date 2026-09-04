import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

async function resolveSetForCoach(setId: string, coachId: string) {
  const set = await prisma.gymSetEntry.findUnique({ where: { id: setId }, include: { entry: { include: { workout: { include: { week: { include: { plan: true } } } } } } } })
  if (!set) return null
  await assertGymClientBelongsToCoach(set.entry.workout.week.plan.clientId, coachId)
  return set
}

export async function PATCH(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const coach = await requireCoach(); const { setId } = await params; const set = await resolveSetForCoach(setId, coach.id)
    if (!set) return NextResponse.json({ error: 'Подход не найден' }, { status: 404 })
    const body = await req.json() as { weight?: unknown; reps?: unknown; toFailure?: unknown }; const data: { weight?: number; reps?: number; toFailure?: boolean } = {}
    if (body.weight !== undefined) { const weight = Number(body.weight); if (!Number.isFinite(weight) || weight < 0 || weight > 2000) return NextResponse.json({ error: 'Некорректный вес' }, { status: 400 }); data.weight = weight }
    if (body.reps !== undefined) { const reps = Number(body.reps); if (!Number.isInteger(reps) || reps < 0 || reps > 100) return NextResponse.json({ error: 'Некорректное число повторов' }, { status: 400 }); data.reps = reps }
    if (body.toFailure !== undefined) { if (typeof body.toFailure !== 'boolean') return NextResponse.json({ error: 'Некорректное значение «до отказа»' }, { status: 400 }); data.toFailure = body.toFailure }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Нет данных для обновления' }, { status: 400 })
    return NextResponse.json(await prisma.gymSetEntry.update({ where: { id: setId }, data }))
  } catch (error) { return apiErrorResponse(error) }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const coach = await requireCoach(); const { setId } = await params; const set = await resolveSetForCoach(setId, coach.id)
    if (!set) return NextResponse.json({ error: 'Подход не найден' }, { status: 404 })
    if (await prisma.gymSetEntry.count({ where: { entryId: set.entryId } }) <= 1) return NextResponse.json({ error: 'В упражнении должен остаться хотя бы один подход' }, { status: 400 })
    await prisma.gymSetEntry.delete({ where: { id: setId } }); return NextResponse.json({ ok: true })
  } catch (error) { return apiErrorResponse(error) }
}
