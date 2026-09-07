import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymCanAccessSet } from '@/lib/authorization'
import { coachEmailToNotify, queueChangeNotification } from '@/lib/email'
import { recordGymChangeLog } from '@/lib/gymChangeLog'

// Set-level edits (weight/reps/toFailure, add/remove a set) are allowed for
// the coach OR the client the set belongs to — same as the powerlifting
// side letting an athlete log their own sets. Exercise-level actions (add/
// replace/remove an exercise, edit ПМ) stay coach-only; see
// /api/gym/entries/:entryId.
export async function PATCH(req: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const user = await requireUser(); const { setId } = await params; const set = await assertGymCanAccessSet(setId, user)
    const body = await req.json() as { weight?: unknown; reps?: unknown; toFailure?: unknown; completed?: unknown }; const data: { weight?: number; reps?: number; toFailure?: boolean; completed?: boolean } = {}
    if (body.weight !== undefined) { const weight = Number(body.weight); if (!Number.isFinite(weight) || weight < 0 || weight > 2000) return NextResponse.json({ error: 'Некорректный вес' }, { status: 400 }); data.weight = weight }
    if (body.reps !== undefined) { const reps = Number(body.reps); if (!Number.isInteger(reps) || reps < 0 || reps > 100) return NextResponse.json({ error: 'Некорректное число повторов' }, { status: 400 }); data.reps = reps }
    if (body.toFailure !== undefined) { if (typeof body.toFailure !== 'boolean') return NextResponse.json({ error: 'Некорректное значение «до отказа»' }, { status: 400 }); data.toFailure = body.toFailure }
    if (body.completed !== undefined) { if (typeof body.completed !== 'boolean') return NextResponse.json({ error: 'Некорректное значение отметки выполнения' }, { status: 400 }); data.completed = body.completed }
    if (!Object.keys(data).length) return NextResponse.json({ error: 'Нет данных для обновления' }, { status: 400 })
    const updated = await prisma.gymSetEntry.update({ where: { id: set.id }, data })

    // Only ever fires for a client's own edit — coachEmailToNotify returns
    // null for a coach's own change (role !== 'ATHLETE'), same gate the
    // powerlifting side uses. History (recordGymChangeLog) rides alongside
    // the email digest rather than its own separate condition, matching
    // that side's coupling exactly.
    const { workout, exercise } = set.entry
    const coachEmail = await coachEmailToNotify(user.role, workout.week.plan.client.coachId)
    if (coachEmail) {
      const base = {
        athleteId: workout.week.plan.clientId,
        coachEmail,
        workoutId: workout.id,
        workoutDate: workout.scheduledDate,
        weekNumber: workout.week.weekNumber,
        dayNumber: workout.dayNumber,
        exerciseName: exercise.name,
        setNumber: set.setNumber,
        at: new Date(),
      } as const
      const logBase = {
        clientId: workout.week.plan.clientId,
        planId: workout.week.planId,
        workoutId: workout.id,
        workoutDate: workout.scheduledDate,
        weekNumber: workout.week.weekNumber,
        dayNumber: workout.dayNumber,
        exerciseEntryId: set.entryId,
        exerciseName: exercise.name,
        setEntryId: set.id,
        setNumber: set.setNumber,
        actorId: user.id,
        actorRole: user.role,
      } as const

      if (data.weight !== undefined && data.weight !== set.weight) {
        queueChangeNotification({ ...base, kind: 'set-updated', field: 'weight', before: set.weight, after: data.weight })
        void recordGymChangeLog({ ...logBase, kind: 'set-updated', field: 'weight', before: set.weight, after: data.weight })
      }
      if (data.reps !== undefined && data.reps !== set.reps) {
        queueChangeNotification({ ...base, kind: 'set-updated', field: 'reps', before: set.reps, after: data.reps })
        void recordGymChangeLog({ ...logBase, kind: 'set-updated', field: 'reps', before: set.reps, after: data.reps })
      }
    }

    return NextResponse.json(updated)
  } catch (error) { return apiErrorResponse(error) }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ setId: string }> }) {
  try {
    const user = await requireUser(); const { setId } = await params; const set = await assertGymCanAccessSet(setId, user)
    if (await prisma.gymSetEntry.count({ where: { entryId: set.entryId } }) <= 1) return NextResponse.json({ error: 'В упражнении должен остаться хотя бы один подход' }, { status: 400 })
    await prisma.gymSetEntry.delete({ where: { id: set.id } })

    const { workout, exercise } = set.entry
    const coachEmail = await coachEmailToNotify(user.role, workout.week.plan.client.coachId)
    if (coachEmail) {
      queueChangeNotification({
        athleteId: workout.week.plan.clientId,
        coachEmail,
        workoutId: workout.id,
        workoutDate: workout.scheduledDate,
        weekNumber: workout.week.weekNumber,
        dayNumber: workout.dayNumber,
        exerciseName: exercise.name,
        kind: 'set-removed',
        setNumber: set.setNumber,
        at: new Date(),
      })
      void recordGymChangeLog({
        clientId: workout.week.plan.clientId,
        planId: workout.week.planId,
        workoutId: workout.id,
        workoutDate: workout.scheduledDate,
        weekNumber: workout.week.weekNumber,
        dayNumber: workout.dayNumber,
        exerciseEntryId: set.entryId,
        exerciseName: exercise.name,
        kind: 'set-removed',
        setEntryId: set.id,
        setNumber: set.setNumber,
        actorId: user.id,
        actorRole: user.role,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) { return apiErrorResponse(error) }
}
