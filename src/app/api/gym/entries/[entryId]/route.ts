import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function PATCH(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const coach = await requireCoach()
    const { entryId } = await params
    const entry = await prisma.gymExerciseEntry.findUnique({ where: { id: entryId }, include: { workout: { include: { week: { include: { plan: true } } } } } })
    if (!entry) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    const clientId = entry.workout.week.plan.clientId
    await assertGymClientBelongsToCoach(clientId, coach.id)
    const { oneRepMax } = await req.json() as { oneRepMax?: unknown }
    const value = Number(oneRepMax)
    if (!Number.isFinite(value) || value <= 0 || value > 3000) return NextResponse.json({ error: 'Некорректный максимум ПМ' }, { status: 400 })
    const [updated] = await prisma.$transaction([
      prisma.gymExerciseEntry.update({ where: { id: entryId }, data: { oneRepMax: value } }),
      prisma.gymClientMax.upsert({ where: { clientId_exerciseId: { clientId, exerciseId: entry.exerciseId } }, create: { clientId, exerciseId: entry.exerciseId, value }, update: { value } }),
    ])
    return NextResponse.json(updated)
  } catch (error) { return apiErrorResponse(error) }
}
