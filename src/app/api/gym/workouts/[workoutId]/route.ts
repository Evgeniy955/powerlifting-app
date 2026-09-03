import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function DELETE(_: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach(); const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)
    await prisma.gymWorkout.delete({ where: { id: workoutId } })
    return NextResponse.json({ ok: true })
  } catch (error) { return apiErrorResponse(error) }
}
