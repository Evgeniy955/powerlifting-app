import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// PATCH { oneRepMax } — sets this entry's (and the client's tracked) 1RM
// for its exercise.
// PATCH { exerciseId } — swaps which catalog exercise this entry points to
// (rename/replace, mirrors PATCH /api/exercise-entries/:entryId on the
// powerlifting side), re-pricing oneRepMax off the client's tracked max for
// the new exercise (or clearing it if there isn't one yet).
// PATCH { notes } — sets (or clears, if blank) the coach's note on this
// exercise — visible to the client, editable coach-only like everything
// else this route handles.
export async function PATCH(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const coach = await requireCoach()
    const { entryId } = await params
    const entry = await prisma.gymExerciseEntry.findUnique({ where: { id: entryId }, include: { workout: { include: { week: { include: { plan: true } } } } } })
    if (!entry) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    const clientId = entry.workout.week.plan.clientId
    await assertGymClientBelongsToCoach(clientId, coach.id)
    const body = await req.json() as { oneRepMax?: unknown; exerciseId?: string; notes?: unknown }

    if (body.exerciseId !== undefined) {
      const exercise = await prisma.gymExerciseCatalog.findUnique({ where: { id: body.exerciseId } })
      if (!exercise) return NextResponse.json({ error: 'Упражнение не найдено в справочнике' }, { status: 404 })
      if (exercise.archivedAt) return NextResponse.json({ error: 'Упражнение архивировано и недоступно для выбора' }, { status: 400 })
      const existingMax = await prisma.gymClientMax.findUnique({ where: { clientId_exerciseId: { clientId, exerciseId: body.exerciseId } } })
      const updated = await prisma.gymExerciseEntry.update({
        where: { id: entryId },
        data: { exerciseId: body.exerciseId, oneRepMax: existingMax?.value ?? null },
        include: { exercise: true },
      })
      return NextResponse.json(updated)
    }

    if (body.notes !== undefined) {
      if (typeof body.notes !== 'string') return NextResponse.json({ error: 'Некорректный комментарий' }, { status: 400 })
      const updated = await prisma.gymExerciseEntry.update({
        where: { id: entryId },
        data: { notes: body.notes.trim().slice(0, 1000) || null },
      })
      return NextResponse.json(updated)
    }

    const value = Number(body.oneRepMax)
    if (!Number.isFinite(value) || value <= 0 || value > 3000) return NextResponse.json({ error: 'Некорректный максимум ПМ' }, { status: 400 })
    const [updated] = await prisma.$transaction([
      prisma.gymExerciseEntry.update({ where: { id: entryId }, data: { oneRepMax: value } }),
      prisma.gymClientMax.upsert({ where: { clientId_exerciseId: { clientId, exerciseId: entry.exerciseId } }, create: { clientId, exerciseId: entry.exerciseId, value }, update: { value } }),
    ])
    return NextResponse.json(updated)
  } catch (error) { return apiErrorResponse(error) }
}

// DELETE /api/gym/entries/:entryId — removes this exercise (and its logged
// sets, via cascade) from the workout. Only ever touches GymExerciseEntry —
// the GymExerciseCatalog row (and any other workout that also uses it) is
// untouched, same as DELETE /api/exercise-entries/:entryId on the
// powerlifting side.
export async function DELETE(_req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const coach = await requireCoach()
    const { entryId } = await params
    const entry = await prisma.gymExerciseEntry.findUnique({ where: { id: entryId }, include: { workout: { include: { week: { include: { plan: true } } } } } })
    if (!entry) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    await assertGymClientBelongsToCoach(entry.workout.week.plan.clientId, coach.id)
    await prisma.gymExerciseEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ ok: true })
  } catch (error) { return apiErrorResponse(error) }
}
