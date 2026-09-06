import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

// PATCH /api/admin/gym-exercises/:exerciseId { name?, category?, archived? } — coach-only.
// Mirrors PATCH /api/admin/exercises/:exerciseId (powerlifting catalog):
// renaming here updates every gym plan that uses this exercise immediately,
// since GymExerciseEntry/GymClientMax only store the exerciseId and always
// read the display name live off GymExerciseCatalog via the relation.
// `archived: false` restores a soft-deleted exercise (see DELETE below).
export async function PATCH(req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()

    const body = (await req.json()) as { name?: string; category?: string | null; archived?: boolean }
    const data: { name?: string; category?: string | null; archivedAt?: Date | null } = {}

    if (body.archived !== undefined) {
      data.archivedAt = body.archived ? new Date() : null
    }
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
      }
      data.name = name
    }
    if (body.category !== undefined) {
      data.category = body.category?.trim() || null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const existing = await prisma.gymExerciseCatalog.findUnique({ where: { id: params.exerciseId } })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const updated = await prisma.gymExerciseCatalog.update({ where: { id: params.exerciseId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    // Unique constraint on GymExerciseCatalog.name (P2002) — surface as a
    // normal 400, not a 500.
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Упражнение с таким названием уже есть' }, { status: 400 })
    }
    return apiErrorResponse(e)
  }
}

// DELETE /api/admin/gym-exercises/:exerciseId — coach-only.
// Mirrors DELETE /api/admin/exercises/:exerciseId (powerlifting catalog): an
// unused exercise (no workout entries, no tracked client max) is hard-
// deleted; an exercise that's in use is archived instead (archivedAt =
// now()) so every existing GymExerciseEntry/GymClientMax FK stays intact and
// keeps resolving the name/category live via the relation — plans, PDF/Excel
// exports and client maxes are unaffected. Archiving only hides it from the
// catalog list and from the workout-entry exercise picker
// (GET /api/admin/gym-exercises). Reversible via PATCH { archived: false }.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()

    const existing = await prisma.gymExerciseCatalog.findUnique({
      where: { id: params.exerciseId },
      include: { _count: { select: { exercises: true, maxes: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const usageCount = existing._count.exercises + existing._count.maxes
    if (usageCount > 0) {
      const archived = await prisma.gymExerciseCatalog.update({
        where: { id: params.exerciseId },
        data: { archivedAt: new Date() },
      })
      return NextResponse.json({ archived: true, exercise: archived })
    }

    await prisma.gymExerciseCatalog.delete({ where: { id: params.exerciseId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
