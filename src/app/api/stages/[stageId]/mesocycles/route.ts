import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { addWeeks, rangeContains, rangesOverlap } from '@/lib/dateOverlap'

// POST /api/stages/:stageId/mesocycles { name, startDate, weeks } —
// coach-only. Creates a "Мезоцикл" inside a stage — deliberately a
// lightweight, standalone entity (name + duration), not a real training
// plan (Cycle) — see the Mesocycle model's comment in schema.prisma for why
// periodization and actual trainable plans are kept separate. Auto-creates
// its `weeks` PeriodizationMicrocycle rows (weekNumber 1..weeks), same
// "Микроциклы" row concept as before, just untagged until edited.
export async function POST(req: NextRequest, { params }: { params: { stageId: string } }) {
  try {
    const coach = await requireCoach()

    const stage = await prisma.stage.findUnique({
      where: { id: params.stageId },
      include: { period: true },
    })
    if (!stage) return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
    await assertAthleteBelongsToCoach(stage.period.athleteId, coach.id)

    const body = (await req.json()) as { name?: string; startDate?: string; weeks?: number }
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название мезоцикла обязательно' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    const weeks = body.weeks ?? 4
    if (!(weeks > 0 && weeks <= 52)) {
      return NextResponse.json({ error: 'Количество недель: 1-52' }, { status: 400 })
    }
    const startDate = new Date(body.startDate)
    if (Number.isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
    }

    // Each mesocycle inside a stage must own a distinct span of weeks —
    // otherwise their weeks interleave in the periodization timeline with
    // no way to tell them apart (this is exactly what happened with two
    // "Втягивающий" mesocycles both starting the same day).
    const siblings = await prisma.mesocycle.findMany({
      where: { stageId: params.stageId },
      select: { name: true, startDate: true, weeks: true },
    })
    const overlapping = siblings.find((s) => rangesOverlap(startDate, weeks, s.startDate, s.weeks))
    if (overlapping) {
      return NextResponse.json(
        { error: `Пересекается по датам с мезоциклом «${overlapping.name}» — выберите другую дату начала` },
        { status: 400 }
      )
    }

    // ...and must stay inside the stage's own span — otherwise the
    // mesocycle's weeks drift past the stage boundary and interleave with a
    // neighbouring stage, splitting this stage into disconnected columns in
    // the periodization table (see rangeContains doc comment).
    if (!rangeContains(stage.startDate, stage.endDate, startDate, addWeeks(startDate, weeks))) {
      return NextResponse.json(
        {
          error: `Даты мезоцикла должны быть в пределах этапа «${stage.name}» (${stage.startDate.toISOString().slice(0, 10)} – ${stage.endDate.toISOString().slice(0, 10)})`,
        },
        { status: 400 }
      )
    }

    const mesocycleId = randomUUID()
    const microcyclesData = Array.from({ length: weeks }, (_, i) => ({
      id: randomUUID(),
      mesocycleId,
      weekNumber: i + 1,
    }))

    const [mesocycle] = await prisma.$transaction([
      prisma.mesocycle.create({
        data: { id: mesocycleId, stageId: params.stageId, name: body.name.trim(), startDate, weeks },
      }),
      prisma.periodizationMicrocycle.createMany({ data: microcyclesData }),
    ])

    return NextResponse.json(mesocycle, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
