import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertCanAccessSet } from '@/lib/authorization'
import { coachEmailToNotify, queueChangeNotification } from '@/lib/email'
import { recordChangeLog } from '@/lib/changeLog'

// PATCH /api/sets/:setId { weight?, reps?, rpe?, completed? } — live edit as the
// user types (weight/reps/rpe) or toggles the "done" checkbox (completed).
// Debounced on the client; this route just persists whatever fields are sent.
export async function PATCH(req: NextRequest, { params }: { params: { setId: string } }) {
  try {
    const user = await requireUser()
    const chain = await assertCanAccessSet(params.setId, user)
    const body = (await req.json()) as {
      weight?: number
      reps?: number
      rpe?: number | null
      completed?: boolean
    }
    // Built field-by-field rather than passing `body` straight through —
    // SetEntry also has an `exerciseEntryId` FK column, and assertCanAccessSet
    // above only checks ownership of *this* set, not of whatever exerciseEntryId
    // a client could otherwise smuggle in to relocate it onto someone else's entry.
    const data: { weight?: number; reps?: number; rpe?: number | null; completed?: boolean } = {}
    if (body.weight !== undefined) data.weight = body.weight
    if (body.reps !== undefined) data.reps = body.reps
    if (body.rpe !== undefined) data.rpe = body.rpe
    if (body.completed !== undefined) data.completed = body.completed

    const set = await prisma.setEntry.update({
      where: { id: params.setId },
      data,
    })

    const coachEmail = await coachEmailToNotify(user.role, chain.athlete.coachId)
    if (coachEmail) {
      const base = {
        athleteId: chain.athlete.id,
        coachEmail,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseName: chain.exerciseEntry.exercise.name,
        setNumber: chain.set.setNumber,
        at: new Date(),
      } as const
      const logBase = {
        athleteId: chain.athlete.id,
        cycleId: chain.cycle.id,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseEntryId: chain.exerciseEntry.id,
        exerciseName: chain.exerciseEntry.exercise.name,
        setEntryId: params.setId,
        setNumber: chain.set.setNumber,
        actorId: user.id,
        actorRole: user.role,
      } as const

      if (body.weight !== undefined && body.weight !== chain.set.weight) {
        queueChangeNotification({
          ...base,
          kind: 'set-updated',
          field: 'weight',
          before: chain.set.weight,
          after: body.weight,
        })
        void recordChangeLog({
          ...logBase,
          kind: 'set-updated',
          field: 'weight',
          before: chain.set.weight,
          after: body.weight,
        })
      }
      if (body.reps !== undefined && body.reps !== chain.set.reps) {
        queueChangeNotification({
          ...base,
          kind: 'set-updated',
          field: 'reps',
          before: chain.set.reps,
          after: body.reps,
        })
        void recordChangeLog({
          ...logBase,
          kind: 'set-updated',
          field: 'reps',
          before: chain.set.reps,
          after: body.reps,
        })
      }
    }

    return NextResponse.json(set)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// DELETE /api/sets/:setId — remove a set row.
export async function DELETE(_req: NextRequest, { params }: { params: { setId: string } }) {
  try {
    const user = await requireUser()
    const chain = await assertCanAccessSet(params.setId, user)
    await prisma.setEntry.delete({ where: { id: params.setId } })

    const coachEmail = await coachEmailToNotify(user.role, chain.athlete.coachId)
    if (coachEmail) {
      queueChangeNotification({
        athleteId: chain.athlete.id,
        coachEmail,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseName: chain.exerciseEntry.exercise.name,
        kind: 'set-removed',
        setNumber: chain.set.setNumber,
        at: new Date(),
      })
      void recordChangeLog({
        athleteId: chain.athlete.id,
        cycleId: chain.cycle.id,
        workoutId: chain.workout.id,
        workoutDate: chain.workout.scheduledDate,
        weekNumber: chain.microcycle.weekNumber,
        dayNumber: chain.workout.dayNumber,
        exerciseEntryId: chain.exerciseEntry.id,
        exerciseName: chain.exerciseEntry.exercise.name,
        kind: 'set-removed',
        setEntryId: params.setId,
        setNumber: chain.set.setNumber,
        actorId: user.id,
        actorRole: user.role,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
