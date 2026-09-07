import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// PATCH { notes } — coach-only. Sets (or clears, if blank) the workout's
// free-form closing instructions (stretching/cooldown, etc.) shown at the
// end of the whole day, not tied to any one exercise.
export async function PATCH(req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach(); const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)

    const body = await req.json() as { notes?: unknown }
    if (typeof body.notes !== 'string') return NextResponse.json({ error: 'Некорректный текст' }, { status: 400 })

    const updated = await prisma.gymWorkout.update({
      where: { id: workoutId },
      data: { notes: body.notes.trim().slice(0, 2000) || null },
    })
    return NextResponse.json(updated)
  } catch (error) { return apiErrorResponse(error) }
}

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
