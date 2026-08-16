import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessWorkout } from '@/lib/authorization'
import { coachEmailToNotify, queueChangeNotification } from '@/lib/email'

// POST /api/exercise-entries { workoutId, exerciseId, multiplier? }
// Adds an exercise block to a workout. Coach normally plans it; athlete could also
// log an ad-hoc exercise not originally planned.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const { workoutId, exerciseId, multiplier } = (await req.json()) as {
      workoutId: string
      exerciseId: string
      multiplier?: number
    }
    if (!workoutId || !exerciseId) {
      return NextResponse.json({ error: 'workoutId и exerciseId обязательны' }, { status: 400 })
    }
    const chain = await assertCanAccessWorkout(workoutId, user)

    const maxOrder = await prisma.exerciseEntry.aggregate({
      where: { workoutId },
      _max: { orderIndex: true },
    })

    const entry = await prisma.exerciseEntry.create({
      data: {
        workoutId,
        exerciseId,
        multiplier: multiplier ?? 1,
        orderIndex: (maxOrder._max.orderIndex ?? -1) + 1,
      },
      include: { exercise: true, sets: true },
    })

    const coachEmail = await coachEmailToNotify(user.role, chain.athlete.coachId)
    if (coachEmail) {
      queueChangeNotification({
        athleteId: chain.athlete.id,
        coachEmail,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseName: entry.exercise.name,
        kind: 'exercise-added',
        at: new Date(),
      })
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
