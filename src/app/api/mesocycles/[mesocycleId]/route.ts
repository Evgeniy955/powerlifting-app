import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { addWeeks, rangeContains, rangesOverlap } from '@/lib/dateOverlap'

async function loadOwnedMesocycle(mesocycleId: string, coachId: string) {
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: mesocycleId },
    include: { stage: { include: { period: true } } },
  })
  if (!mesocycle) return null
  await assertAthleteBelongsToCoach(mesocycle.stage.period.athleteId, coachId)
  return mesocycle
}

// PATCH /api/mesocycles/:mesocycleId { name?, startDate?, weeks?, stageId? }
// — coach-only. `stageId` moves the mesocycle to a different stage (still
// within the same athlete — assertAthleteBelongsToCoach below re-checks
// ownership on whichever stage the caller names, so cross-athlete moves
// aren't possible even if the id were guessed). `weeks` resizes it —
// PeriodizationMicrocycle rows are added/removed to match at the end.
export async function PATCH(req: NextRequest, { params }: { params: { mesocycleId: string } }) {
  try {
    const coach = await requireCoach()
    const mesocycle = await loadOwnedMesocycle(params.mesocycleId, coach.id)
    if (!mesocycle) return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })

    const body = (await req.json()) as { name?: string; startDate?: string; weeks?: number; stageId?: string }
    const data: Record<string, string | Date | number> = {}

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return NextResponse.json({ error: 'Название мезоцикла обязательно' }, { status: 400 })
      }
      data.name = body.name.trim()
    }
    if (body.startDate !== undefined) {
      const startDate = new Date(body.startDate)
      if (Number.isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
      }
      data.startDate = startDate
    }
    if (body.weeks !== undefined) {
      if (!(body.weeks > 0 && body.weeks <= 52)) {
        return NextResponse.json({ error: 'Количество недель: 1-52' }, { status: 400 })
      }
      data.weeks = body.weeks
    }

    const effectiveStartDate = data.startDate instanceof Date ? data.startDate : mesocycle.startDate
    const effectiveWeeks = typeof data.weeks === 'number' ? data.weeks : mesocycle.weeks

    const movingStage = body.stageId !== undefined && body.stageId !== mesocycle.stageId
    if (movingStage) {
      const targetStage = await prisma.stage.findUnique({
        where: { id: body.stageId },
        include: { period: true },
      })
      if (!targetStage) return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
      await assertAthleteBelongsToCoach(targetStage.period.athleteId, coach.id)

      // Same non-overlap guarantee as creation — moving into a stage whose
      // existing mesocycles already cover these weeks would produce the
      // same interleaved-timeline problem.
      const siblings = await prisma.mesocycle.findMany({
        where: { stageId: body.stageId },
        select: { name: true, startDate: true, weeks: true },
      })
      const overlapping = siblings.find((s) => rangesOverlap(effectiveStartDate, effectiveWeeks, s.startDate, s.weeks))
      if (overlapping) {
        return NextResponse.json(
          { error: `Пересекается по датам с мезоциклом «${overlapping.name}» в этом этапе` },
          { status: 400 }
        )
      }

      // ...and must stay inside the *target* stage's own span (see
      // rangeContains doc comment).
      if (!rangeContains(targetStage.startDate, targetStage.endDate, effectiveStartDate, addWeeks(effectiveStartDate, effectiveWeeks))) {
        return NextResponse.json(
          {
            error: `Даты мезоцикла должны быть в пределах этапа «${targetStage.name}» (${targetStage.startDate.toISOString().slice(0, 10)} – ${targetStage.endDate.toISOString().slice(0, 10)})`,
          },
          { status: 400 }
        )
      }

      data.stageId = body.stageId as string
    } else if (data.startDate instanceof Date || typeof data.weeks === 'number') {
      // startDate and/or weeks changed but the mesocycle is staying in its
      // current stage — still must stay inside that stage's span, and not
      // collide with its other siblings there.
      const currentStage = mesocycle.stage
      const siblings = await prisma.mesocycle.findMany({
        where: { stageId: mesocycle.stageId, id: { not: params.mesocycleId } },
        select: { name: true, startDate: true, weeks: true },
      })
      const overlapping = siblings.find((s) => rangesOverlap(effectiveStartDate, effectiveWeeks, s.startDate, s.weeks))
      if (overlapping) {
        return NextResponse.json(
          { error: `Пересекается по датам с мезоциклом «${overlapping.name}» в этом этапе` },
          { status: 400 }
        )
      }
      if (!rangeContains(currentStage.startDate, currentStage.endDate, effectiveStartDate, addWeeks(effectiveStartDate, effectiveWeeks))) {
        return NextResponse.json(
          {
            error: `Даты мезоцикла должны быть в пределах этапа «${currentStage.name}» (${currentStage.startDate.toISOString().slice(0, 10)} – ${currentStage.endDate.toISOString().slice(0, 10)})`,
          },
          { status: 400 }
        )
      }
    }

    const [updated] = await prisma.$transaction([
      prisma.mesocycle.update({ where: { id: params.mesocycleId }, data }),
      // Grow: append new untagged weeks. Shrink: drop the trailing weeks
      // that no longer fit (loses whatever Микроцикл type was set on them —
      // same trade-off as shrinking a Этап out from under its mesocycles).
      ...(typeof data.weeks === 'number' && data.weeks > mesocycle.weeks
        ? [
            prisma.periodizationMicrocycle.createMany({
              data: Array.from({ length: data.weeks - mesocycle.weeks }, (_, i) => ({
                id: randomUUID(),
                mesocycleId: params.mesocycleId,
                weekNumber: mesocycle.weeks + i + 1,
              })),
            }),
          ]
        : typeof data.weeks === 'number' && data.weeks < mesocycle.weeks
          ? [
              prisma.periodizationMicrocycle.deleteMany({
                where: { mesocycleId: params.mesocycleId, weekNumber: { gt: data.weeks } },
              }),
            ]
          : []),
    ])
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/mesocycles/:mesocycleId — coach-only. Cascades to its
// PeriodizationMicrocycle rows via the schema relation.
export async function DELETE(_req: NextRequest, { params }: { params: { mesocycleId: string } }) {
  try {
    const coach = await requireCoach()
    const mesocycle = await loadOwnedMesocycle(params.mesocycleId, coach.id)
    if (!mesocycle) return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })

    await prisma.mesocycle.delete({ where: { id: params.mesocycleId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
