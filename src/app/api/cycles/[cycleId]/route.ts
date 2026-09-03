import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// PATCH /api/cycles/:cycleId { name?, startDate? } — coach-only. Weeks is
// still only editable at creation (changing it would require adding/removing
// whole microcycles, not just a field).
//
// startDate moves the whole plan: every already-scheduled Workout under
// it is shifted by the same number of days, so the actual training days
// stay in sync with the new week 1.
export async function PATCH(req: NextRequest, props: { params: Promise<{ cycleId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const body = (await req.json()) as {
      name?: string
      startDate?: string
    }
    const data: Record<string, string | null | Date> = {}

    if (body.name !== undefined) {
      const trimmed = body.name.trim()
      if (!trimmed) {
        return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
      }
      data.name = trimmed
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
    return apiErrorResponse(e)
  }
}

// DELETE /api/cycles/:cycleId — coach-only. Deletes the cycle and everything under
// it (microcycles, workouts, exercise entries, sets) via the cascading relations
// declared in schema.prisma.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ cycleId: string }> }) {
  const params = await props.params;
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
    return apiErrorResponse(e)
  }
}
