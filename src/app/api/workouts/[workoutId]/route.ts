import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, requireUser, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach, assertCanAccessWorkout } from '@/lib/authorization'
import { getWorkoutForDisplay, getRpeTable } from '@/lib/workout'

// GET /api/workouts/:workoutId — full day view payload + RPE table for client-side metrics.
export async function GET(_req: NextRequest, { params }: { params: { workoutId: string } }) {
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
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/workouts/:workoutId — coach-only. Removes one training day,
// cascading its exercise entries/sets. Counterpart to
// POST /api/microcycles/:microcycleId/workouts (AddWorkoutDayButton) — used
// by the "Перейти на 3 дня" side of ToggleFourthDayButton to drop a
// microcycle back from 4 days to 3.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { workoutId: string } }
) {
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
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
