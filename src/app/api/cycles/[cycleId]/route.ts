import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// PATCH /api/cycles/:cycleId { mesocycleType?, stageId?, startDate? } —
// coach-only. mesocycleType tags this cycle (= one mesocycle) with its
// "Мезоциклы" preset; pass null to clear it. stageId attaches/detaches this
// mesocycle to/from a Stage in the periodization hierarchy (pass null to
// detach back to "unassigned"). Doesn't touch name/weeks — those are still
// only editable at creation.
//
// startDate moves the whole mesocycle: every already-scheduled Workout under
// it is shifted by the same number of days, so the actual training days stay
// in sync with the new week 1 instead of drifting out of sync with what the
// periodization timeline shows (which is *computed* from startDate + weekNumber,
// not stored per week).
export async function PATCH(req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const body = (await req.json()) as {
      mesocycleType?: string | null
      stageId?: string | null
      startDate?: string
    }
    const data: Record<string, string | null | Date> = {}
    if ('mesocycleType' in body) data.mesocycleType = body.mesocycleType?.trim() || null
    if ('stageId' in body) {
      if (body.stageId) {
        const stage = await prisma.stage.findUnique({
          where: { id: body.stageId },
          include: { period: true },
        })
        if (!stage || stage.period.athleteId !== cycle.athleteId) {
          return NextResponse.json({ error: 'Этап не найден' }, { status: 400 })
        }
      }
      data.stageId = body.stageId ?? null
    }

    let deltaDays = 0
    if (body.startDate) {
      const nextStart = new Date(body.startDate)
      if (Number.isNaN(nextStart.getTime())) {
        return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
      }
      deltaDays = Math.round((nextStart.getTime() - cycle.startDate.getTime()) / DAY_MS)
      data.startDate = nextStart
    }

    if (deltaDays !== 0) {
      // One raw UPDATE instead of looping per-workout — a 52-week cycle can
      // have ~350+ workouts, and a loop of individual updates inside a
      // transaction reliably breaks against Supabase's pooled connection
      // once it recycles mid-transaction (see import/confirm/route.ts for
      // the same issue and fix).
      const [updated] = await prisma.$transaction([
        prisma.cycle.update({ where: { id: params.cycleId }, data }),
        prisma.$executeRaw`
          UPDATE "Workout" SET "scheduledDate" = "scheduledDate" + make_interval(days => ${deltaDays})
          WHERE "microcycleId" IN (SELECT id FROM "Microcycle" WHERE "cycleId" = ${params.cycleId})
        `,
      ])
      return NextResponse.json(updated)
    }

    const updated = await prisma.cycle.update({ where: { id: params.cycleId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/cycles/:cycleId — coach-only. Deletes the cycle and everything under
// it (microcycles, workouts, exercise entries, sets) via the cascading relations
// declared in schema.prisma.
export async function DELETE(_req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    await prisma.cycle.delete({ where: { id: params.cycleId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
