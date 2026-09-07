import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymCanAccessSet } from '@/lib/authorization'

// Set-level edits (weight/reps/toFailure, add/remove a set) are allowed for
// the coach OR the client the set belongs to — same as the powerlifting
// side letting an athlete log their own sets. Exercise-level actions (add/
// replace/remove an exercise, edit ПМ) stay coach-only; see
// /api/gym/entries/:entryId.
export async function PATCH(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const user = await requireUser(); const { setId } = await params; const set = await assertGymCanAccessSet(setId, user)
    const body = await req.json() as { weight?: unknown; reps?: unknown; toFailure?: unknown }; const data: { weight?: number; reps?: number; toFailure?: boolean } = {}
    if (body.weight !== undefined) { const weight = Number(body.weight); if (!Number.isFinite(weight) || weight < 0 || weight > 2000) return NextResponse.json({ error: 'Некорректный вес' }, { status: 400 }); data.weight = weight }
    if (body.reps !== undefined) { const reps = Number(body.reps); if (!Number.isInteger(reps) || reps < 0 || reps > 100) return NextResponse.json({ error: 'Некорректное число повторов' }, { status: 400 }); data.reps = reps }
    if (body.toFailure !== undefined) { if (typeof body.toFailure !== 'boolean') return NextResponse.json({ error: 'Некорректное значение «до отказа»' }, { status: 400 }); data.toFailure = body.toFailure }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Нет данных для обновления' }, { status: 400 })
    return NextResponse.json(await prisma.gymSetEntry.update({ where: { id: set.id }, data }))
  } catch (error) { return apiErrorResponse(error) }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const user = await requireUser(); const { setId } = await params; const set = await assertGymCanAccessSet(setId, user)
    if (await prisma.gymSetEntry.count({ where: { entryId: set.entryId } }) <= 1) return NextResponse.json({ error: 'В упражнении должен остаться хотя бы один подход' }, { status: 400 })
    await prisma.gymSetEntry.delete({ where: { id: set.id } }); return NextResponse.json({ ok: true })
  } catch (error) { return apiErrorResponse(error) }
}
