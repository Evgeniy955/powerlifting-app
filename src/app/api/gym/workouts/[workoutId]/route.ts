import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// PATCH { notes } — coach-only. Sets (or clears, if blank) the workout's
// free-form closing instructions (stretching/cooldown, etc.) shown at the
// end of the whole day, not tied to any one exercise.
// PATCH { entryIds } — coach-only. GymWorkoutEditor's drag-to-reorder:
// `entryIds` is this day's exercise entries in their new intended order;
// orderIndex is rewritten to match array position (0, 1, 2, ...). Mirrors
// PATCH /api/workouts/:workoutId on the powerlifting side, except
// coach-only here (reordering is exercise-level — canManageExercises —
// same as add/replace/remove, not something a client can do). Rejects
// anything that isn't exactly this workout's current entry set, same
// reasoning as the powerlifting route: a stale/tampered list can't
// silently drop or duplicate a row.
export async function PATCH(req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach(); const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)

    const body = await req.json() as { notes?: unknown; entryIds?: unknown }

    if (body.entryIds !== undefined) {
      const entryIds = body.entryIds
      if (!Array.isArray(entryIds) || entryIds.length === 0 || !entryIds.every((id) => typeof id === 'string')) {
        return NextResponse.json({ error: 'entryIds обязателен' }, { status: 400 })
      }
      const existing = await prisma.gymExerciseEntry.findMany({ where: { workoutId }, select: { id: true } })
      const existingIds = new Set(existing.map((e) => e.id))
      const isSameSet = entryIds.length === existing.length && entryIds.every((id) => existingIds.has(id))
      if (!isSameSet) {
        return NextResponse.json({ error: 'Список упражнений не совпадает с текущей тренировкой' }, { status: 400 })
      }
      await prisma.$transaction(
        entryIds.map((id, index) => prisma.gymExerciseEntry.update({ where: { id }, data: { orderIndex: index } }))
      )
      return NextResponse.json({ ok: true })
    }

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
