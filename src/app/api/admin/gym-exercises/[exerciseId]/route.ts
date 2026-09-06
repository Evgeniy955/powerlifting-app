import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

// PATCH /api/admin/gym-exercises/:exerciseId { name?, category? } — coach-only.
// Mirrors PATCH /api/admin/exercises/:exerciseId (powerlifting catalog):
// renaming here updates every gym plan that uses this exercise immediately,
// since GymExerciseEntry/GymClientMax only store the exerciseId and always
// read the display name live off GymExerciseCatalog via the relation.
export async function PATCH(req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()

    const body = (await req.json()) as { name?: string; category?: string | null }
    const data: { name?: string; category?: string | null } = {}

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

// DELETE /api/admin/gym-exercises/:exerciseId[?force=true] — coach-only.
// Same usage-guard/force-delete pattern as DELETE /api/admin/exercises/:exerciseId:
// refuses by default if the exercise is logged in any workout entry or has a
// tracked client max, returning 409 with the counts; ?force=true deletes
// those referencing rows first (in a transaction), then the catalog row.
export async function DELETE(req: NextRequest, props: { params: Promise<{ exerciseId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()
    const force = req.nextUrl.searchParams.get('force') === 'true'

    const existing = await prisma.gymExerciseCatalog.findUnique({
      where: { id: params.exerciseId },
      include: { _count: { select: { exercises: true, maxes: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    }

    const usageCount = existing._count.exercises + existing._count.maxes
    if (usageCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `Упражнение используется (записей в тренировках: ${existing._count.exercises}, максимумов: ${existing._count.maxes}).`,
          usage: { exercises: existing._count.exercises, maxes: existing._count.maxes },
        },
        { status: 409 }
      )
    }

    if (usageCount > 0) {
      await prisma.$transaction([
        prisma.gymExerciseEntry.deleteMany({ where: { exerciseId: params.exerciseId } }),
        prisma.gymClientMax.deleteMany({ where: { exerciseId: params.exerciseId } }),
        prisma.gymExerciseCatalog.delete({ where: { id: params.exerciseId } }),
      ])
    } else {
      await prisma.gymExerciseCatalog.delete({ where: { id: params.exerciseId } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
