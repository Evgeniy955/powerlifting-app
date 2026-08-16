import { NextRequest, NextResponse } from 'next/server'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessWorkout } from '@/lib/authorization'
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
