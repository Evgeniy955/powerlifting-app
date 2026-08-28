import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import {
  assertAthleteAccessible,
  assertAthleteBelongsToCoach,
  assertCanAccessWorkout,
} from '@/lib/authorization'

// GET /api/athletes/:athleteId/one-rep-max — list all tracked 1RMs for this athlete.
// Athletes can read their own; coach can read any of their athletes'.
export async function GET(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    if (user.role === 'COACH') {
      await assertAthleteBelongsToCoach(params.athleteId, user.id)
    }
    const oneRepMaxes = await prisma.athlete1RM.findMany({
      where: { athleteId: params.athleteId },
      include: { exercise: true },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json(oneRepMaxes)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// POST /api/athletes/:athleteId/one-rep-max { exerciseId, value, workoutId } — upsert.
// Coach can set any exercise's 1RM for their athletes. An athlete may only
// set their own, and only for ОФП (GPP) exercises — Базовые/СФП figures
// anchor %1RM-based programming across the whole plan and stay coach-only.
// Used inline when picking an exercise from the autocomplete, to bind/update 1RM.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertAthleteAccessible(params.athleteId, user)

    const { exerciseId, value, workoutId } = (await req.json()) as {
      exerciseId: string
      value: number
      workoutId: string
    }
    if (!exerciseId || !workoutId || !Number.isFinite(value) || !(value > 0)) {
      return NextResponse.json(
        { error: 'exerciseId, workoutId и value > 0 обязательны' },
        { status: 400 }
      )
    }

    const workoutChain = await assertCanAccessWorkout(workoutId, user)
    if (workoutChain.athlete.id !== params.athleteId) {
      return NextResponse.json({ error: 'Тренировка принадлежит другому атлету' }, { status: 403 })
    }

    if (user.role === 'ATHLETE') {
      const exercise = await prisma.exerciseCatalog.findUnique({ where: { id: exerciseId } })
      if (!exercise || exercise.trainingGroup !== 'GPP') {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
      }
    }

    // This is deliberately an upsert rather than a "keep the highest value"
    // operation: a coach may correct 1RM down as well as up. The same value is
    // copied only into this workout and workouts scheduled after it; earlier
    // entries retain their historical 1RM snapshot.
    const [record] = await prisma.$transaction([
      prisma.athlete1RM.upsert({
        where: { athleteId_exerciseId: { athleteId: params.athleteId, exerciseId } },
        update: { value },
        create: { athleteId: params.athleteId, exerciseId, value },
      }),
      prisma.exerciseEntry.updateMany({
        where: {
          exerciseId,
          workout: {
            scheduledDate: { gte: workoutChain.workout.scheduledDate },
            microcycle: { cycle: { athleteId: params.athleteId } },
          },
        },
        data: { oneRepMax: value },
      }),
    ])

    return NextResponse.json(record, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
