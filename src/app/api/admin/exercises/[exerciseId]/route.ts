import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { isTrainingGroup } from '@/lib/trainingGroups'

// PATCH /api/admin/exercises/:exerciseId { name?, category?, impactCoefficient?, trainingGroup?, archived? }
// Coach-only. Renaming here updates every training program that uses this
// exercise immediately — ExerciseEntry and Athlete1RM only store the
// exerciseId, the display name is always read live off ExerciseCatalog via
// the relation, never copied onto the entry. Nothing else to invalidate.
// trainingGroup is the "move to Базовые/СФП/ОФП" action — pass null to
// unassign. `archived: false` restores a soft-deleted exercise (undoes the
// archivedAt set by DELETE below) without needing a separate endpoint.
export async function PATCH(req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params;
  try {
    await requireCoach()

    const body = (await req.json()) as {
      name?: string
      category?: string | null
      impactCoefficient?: number
      trainingGroup?: string | null
      archived?: boolean
    }
    const data: {
      name?: string
      category?: string | null
      impactCoefficient?: number
      trainingGroup?: string | null
      archivedAt?: Date | null
    } = {}

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
    if (body.impactCoefficient !== undefined) {
      if (!Number.isFinite(body.impactCoefficient) || body.impactCoefficient <= 0) {
        return NextResponse.json(
          { error: 'Коэффициент воздействия должен быть положительным числом' },
          { status: 400 }
        )
      }
      data.impactCoefficient = body.impactCoefficient
    }
    if (body.trainingGroup !== undefined) {
      if (body.trainingGroup !== null && !isTrainingGroup(body.trainingGroup)) {
        return NextResponse.json(
          { error: 'Блок должен быть BASE, SPP, GPP или null' },
          { status: 400 }
        )
      }
      data.trainingGroup = body.trainingGroup
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const existing = await prisma.exerciseCatalog.findUnique({ where: { id: params.exerciseId } })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const updated = await prisma.exerciseCatalog.update({
      where: { id: params.exerciseId },
      data,
    })
    return NextResponse.json(updated)
  } catch (e) {
    // Unique constraint on ExerciseCatalog.name (P2002) — surface as a normal
    // 400, not a 500.
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'Упражнение с таким названием уже существует' },
        { status: 400 }
      )
    }
    return apiErrorResponse(e)
  }
}

// DELETE /api/admin/exercises/:exerciseId — coach-only.
//
// An exercise with no usage at all (never logged, no tracked 1RM) is hard-
// deleted — nothing references it, nothing to preserve. An exercise that IS
// in use is archived instead (archivedAt = now()): the catalog row and
// every ExerciseEntry/Athlete1RM FK pointing at it stay intact, so training
// history, PDF/Excel exports and analytics keep resolving its name/category
// live via the relation exactly as before. Archiving only hides it from the
// catalog list and from the exercise picker used when building new
// workouts (GET /api/exercises). Reversible via PATCH { archived: false }.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params;
  try {
    await requireCoach()

    const existing = await prisma.exerciseCatalog.findUnique({
      where: { id: params.exerciseId },
      include: { _count: { select: { exerciseEntries: true, oneRepMaxes: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const usageCount = existing._count.exerciseEntries + existing._count.oneRepMaxes
    if (usageCount > 0) {
      const archived = await prisma.exerciseCatalog.update({
        where: { id: params.exerciseId },
        data: { archivedAt: new Date() },
      })
      return NextResponse.json({ archived: true, exercise: archived })
    }

    await prisma.exerciseCatalog.delete({ where: { id: params.exerciseId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
