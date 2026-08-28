import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertCanAccessExerciseEntry } from '@/lib/authorization'
import { coachEmailToNotify, queueChangeNotification } from '@/lib/email'
import { recordChangeLog } from '@/lib/changeLog'

// PATCH /api/exercise-entries/:entryId { skipped?, exerciseId?, multiplier? } —
// toggles the "didn't get to this exercise" flag, and/or edits which catalog
// exercise this entry points to and its "Множ" multiplier. Coach or athlete,
// same access rule as everything else on the workout (assertCanAccessExerciseEntry).
export async function PATCH(req: NextRequest, { params }: { params: { entryId: string } }) {
  try {
    const user = await requireUser()
    const chain = await assertCanAccessExerciseEntry(params.entryId, user)

    const body = (await req.json()) as {
      skipped?: boolean
      exerciseId?: string
      multiplier?: number
    }
    // Built field-by-field rather than passing `body` straight through —
    // ExerciseEntry also has a `workoutId` FK column, and assertCanAccessExerciseEntry
    // above only checks ownership of *this* entry, not of whatever workoutId a
    // client could otherwise smuggle in to relocate it into someone else's plan.
    const data: {
      skipped?: boolean
      exerciseId?: string
      multiplier?: number
      oneRepMax?: number | null
    } = {}
    if (body.skipped !== undefined) data.skipped = body.skipped
    if (body.exerciseId !== undefined) {
      data.exerciseId = body.exerciseId
      const oneRepMax = await prisma.athlete1RM.findUnique({
        where: {
          athleteId_exerciseId: {
            athleteId: chain.athlete.id,
            exerciseId: body.exerciseId,
          },
        },
      })
      data.oneRepMax = oneRepMax?.value ?? null
    }
    if (body.multiplier !== undefined) data.multiplier = body.multiplier

    const entry = await prisma.exerciseEntry.update({
      where: { id: params.entryId },
      data,
      include: { exercise: true },
    })

    return NextResponse.json(entry)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// DELETE /api/exercise-entries/:entryId — removes this exercise (and its logged
// sets, via cascade) from the day's plan. This only ever touches ExerciseEntry —
// the underlying ExerciseCatalog row (and any other day that also uses it) is
// completely untouched.
export async function DELETE(_req: NextRequest, { params }: { params: { entryId: string } }) {
  try {
    const user = await requireUser()
    const chain = await assertCanAccessExerciseEntry(params.entryId, user)
    await prisma.exerciseEntry.delete({ where: { id: params.entryId } })

    const coachEmail = await coachEmailToNotify(user.role, chain.athlete.coachId)
    if (coachEmail) {
      queueChangeNotification({
        athleteId: chain.athlete.id,
        coachEmail,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseName: chain.entry.exercise.name,
        kind: 'exercise-removed',
        at: new Date(),
      })
      void recordChangeLog({
        athleteId: chain.athlete.id,
        cycleId: chain.cycle.id,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseEntryId: params.entryId,
        exerciseName: chain.entry.exercise.name,
        kind: 'exercise-removed',
        actorId: user.id,
        actorRole: user.role,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
