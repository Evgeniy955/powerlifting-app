import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, requireUser, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach, assertCanAccessWorkout } from '@/lib/authorization'
import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'

// GET /api/workouts/:workoutId — full day view payload + RPE table for client-side metrics.
export async function GET(_req: NextRequest, props: { params: Promise<{ workoutId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser()
    await assertCanAccessWorkout(params.workoutId, user)
    const [workout, rpeTable] = await Promise.all([
      getWorkoutForDisplay(params.workoutId),
      getRpeTable(),
    ])
    if (!workout) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json({ workout, rpeTable })
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// PATCH /api/workouts/:workoutId { entryIds } — coach or the athlete
// themselves (same access rule as everything else on the workout), for
// WeekDayTable's drag-to-reorder. `entryIds` is the exercise entries of this
// day in their new intended order; orderIndex is rewritten to match array
// position (0, 1, 2, ...). Rejects anything that isn't exactly this
// workout's current entry set — a client couldn't move an entry into a
// different day's plan this way, and a stale/tampered list can't silently
// drop or duplicate a row.
export async function PATCH(req: NextRequest, props: { params: Promise<{ workoutId: string }> }) {
  const params = await props.params;
  try {
    const user = await requireUser()
    await assertCanAccessWorkout(params.workoutId, user)

    const body = (await req.json()) as { entryIds?: string[] }
    const entryIds = body.entryIds
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json({ error: 'entryIds обязателен' }, { status: 400 })
    }

    const existing = await prisma.exerciseEntry.findMany({
      where: { workoutId: params.workoutId },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((e) => e.id))
    const isSameSet =
      entryIds.length === existing.length && entryIds.every((id) => existingIds.has(id))
    if (!isSameSet) {
      return NextResponse.json(
        { error: 'Список упражнений не совпадает с текущим днём' },
        { status: 400 }
      )
    }

    await prisma.$transaction(
      entryIds.map((id, index) =>
        prisma.exerciseEntry.update({ where: { id }, data: { orderIndex: index } })
      )
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// DELETE /api/workouts/:workoutId — coach-only. Removes one training day,
// cascading its exercise entries/sets. Counterpart to
// POST /api/microcycles/:microcycleId/workouts (AddWorkoutDayButton) — used
// by the "Перейти на 3 дня" side of ToggleFourthDayButton to drop a
// microcycle back from 4 days to 3.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ workoutId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const workout = await prisma.workout.findUnique({
      where: { id: params.workoutId },
      include: { microcycle: { include: { cycle: true } } },
    })
    if (!workout) {
      return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(workout.microcycle.cycle.athleteId, coach.id)

    await prisma.workout.delete({ where: { id: params.workoutId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
