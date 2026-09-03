import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function POST(_: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const coach = await requireCoach(); const { entryId } = await params
    const entry = await prisma.gymExerciseEntry.findUnique({ where: { id: entryId }, include: { workout: { include: { week: { include: { plan: true } } } }, sets: { orderBy: { setNumber: 'desc' }, take: 1 } } })
    if (!entry) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    await assertGymClientBelongsToCoach(entry.workout.week.plan.clientId, coach.id)
    const previous = entry.sets[0]
    const set = await prisma.gymSetEntry.create({ data: { entryId, setNumber: (previous?.setNumber ?? 0) + 1, weight: previous?.weight ?? 0, reps: previous?.reps ?? 10 } })
    return NextResponse.json(set, { status: 201 })
  } catch (error) { return apiErrorResponse(error) }
}
