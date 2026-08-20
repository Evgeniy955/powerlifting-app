import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { rangesOverlap } from '@/lib/dateOverlap'

async function loadOwnedMesocycle(mesocycleId: string, coachId: string) {
  const mesocycle = await prisma.mesocycle.findUnique({
    where: { id: mesocycleId },
    include: { stage: { include: { period: true } } },
  })
  if (!mesocycle) return null
  await assertAthleteBelongsToCoach(mesocycle.stage.period.athleteId, coachId)
  return mesocycle
}

// PATCH /api/mesocycles/:mesocycleId { name?, startDate?, stageId? } —
// coach-only. `stageId` moves the mesocycle to a different stage (still
// within the same athlete — assertAthleteBelongsToCoach below re-checks
// ownership on whichever stage the caller names, so cross-athlete moves
// aren't possible even if the id were guessed).
export async function PATCH(req: NextRequest, { params }: { params: { mesocycleId: string } }) {
  try {
    const coach = await requireCoach()
    const mesocycle = await loadOwnedMesocycle(params.mesocycleId, coach.id)
    if (!mesocycle) return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })

    const body = (await req.json()) as { name?: string; startDate?: string; stageId?: string }
    const data: Record<string, string | Date> = {}

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
    if (body.stageId !== undefined && body.stageId !== mesocycle.stageId) {
      const targetStage = await prisma.stage.findUnique({
        where: { id: body.stageId },
        include: { period: true },
      })
      if (!targetStage) return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
      await assertAthleteBelongsToCoach(targetStage.period.athleteId, coach.id)

      // Same non-overlap guarantee as creation — moving into a stage whose
      // existing mesocycles already cover these weeks would produce the
      // same interleaved-timeline problem.
      const effectiveStartDate = data.startDate instanceof Date ? data.startDate : mesocycle.startDate
      const siblings = await prisma.mesocycle.findMany({
        where: { stageId: body.stageId },
        select: { name: true, startDate: true, weeks: true },
      })
      const overlapping = siblings.find((s) => rangesOverlap(effectiveStartDate, mesocycle.weeks, s.startDate, s.weeks))
      if (overlapping) {
        return NextResponse.json(
          { error: `Пересекается по датам с мезоциклом «${overlapping.name}» в этом этапе` },
          { status: 400 }
        )
      }

      data.stageId = body.stageId
    }

    const updated = await prisma.mesocycle.update({ where: { id: params.mesocycleId }, data })
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
