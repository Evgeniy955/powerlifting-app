import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { isTrainingGroup } from '@/lib/trainingGroups'

// PATCH /api/admin/exercises/:exerciseId { name?, category?, impactCoefficient?, trainingGroup? }
// Coach-only. Renaming here updates every training program that uses this
// exercise immediately — ExerciseEntry and Athlete1RM only store the
// exerciseId, the display name is always read live off ExerciseCatalog via
// the relation, never copied onto the entry. Nothing else to invalidate.
// trainingGroup is the "move to Базовые/СФП/ОФП" action — pass null to
// unassign.
export async function PATCH(req: NextRequest, { params }: { params: { exerciseId: string } }) {
  try {
    await requireCoach()

    const body = (await req.json()) as {
      name?: string
      category?: string | null
      impactCoefficient?: number
      trainingGroup?: string | null
    }
    const data: {
      name?: string
      category?: string | null
      impactCoefficient?: number
      trainingGroup?: string | null
    } = {}

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

// DELETE /api/admin/exercises/:exerciseId[?force=true] — coach-only.
//
// By default, refuses to delete an exercise that's actually in use (logged
// in any workout, or has a tracked 1RM) — returns 409 with the usage counts
// so the client can warn before retrying.
//
// With ?force=true, the coach has explicitly confirmed they want to delete
// it anyway: every ExerciseEntry referencing it (and, via the schema's
// existing cascade, their SetEntry rows) and every Athlete1RM referencing
// it are deleted first, in a transaction, then the catalog row itself. This
// is permanent and removes the exercise from training history for every
// athlete who ever logged it — the client is expected to have already made
// that consequence explicit before calling this route with force=true.
export async function DELETE(req: NextRequest, { params }: { params: { exerciseId: string } }) {
  try {
    await requireCoach()
    const force = req.nextUrl.searchParams.get('force') === 'true'

    const existing = await prisma.exerciseCatalog.findUnique({
      where: { id: params.exerciseId },
      include: { _count: { select: { exerciseEntries: true, oneRepMaxes: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const usageCount = existing._count.exerciseEntries + existing._count.oneRepMaxes
    if (usageCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `Упражнение используется (записей в тренировках: ${existing._count.exerciseEntries}, 1ПМ: ${existing._count.oneRepMaxes}).`,
          usage: {
            exerciseEntries: existing._count.exerciseEntries,
            oneRepMaxes: existing._count.oneRepMaxes,
          },
        },
        { status: 409 }
      )
    }

    if (usageCount > 0) {
      await prisma.$transaction([
        prisma.exerciseEntry.deleteMany({ where: { exerciseId: params.exerciseId } }),
        prisma.athlete1RM.deleteMany({ where: { exerciseId: params.exerciseId } }),
        prisma.exerciseCatalog.delete({ where: { id: params.exerciseId } }),
      ])
    } else {
      await prisma.exerciseCatalog.delete({ where: { id: params.exerciseId } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
