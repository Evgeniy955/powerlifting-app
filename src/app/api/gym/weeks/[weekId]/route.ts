import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

// DELETE /api/gym/weeks/:weekId — coach-only. Deletes one week from a plan,
// cascading its workouts/exercise entries/sets via the relations declared
// in schema.prisma.
//
// Unlike DELETE /api/microcycles/:microcycleId on the powerlifting side
// (which deliberately leaves a gap in weekNumber — see that route's own
// comment), gym plans renumber every remaining week to a contiguous
// 1..N sequence afterward. Renumbering alone would desync "Неделя N" from
// what it actually shows, though: currentWeekNumber and
// isMicrocycleVisibleToAthlete (the Sunday-23:50 unlock) both derive a
// week's calendar slot purely from plan.startDate + weekNumber, so each
// affected week's workouts are shifted by the same number of weeks as its
// new number — the whole plan compacts in time, not just in label,
// keeping every week's number and its actual calendar dates in sync.
export async function DELETE(_req: Request, { params }: { params: Promise<{ weekId: string }> }) {
  try {
    const coach = await requireCoach()
    const { weekId } = await params

    const week = await prisma.gymWeek.findUnique({
      where: { id: weekId },
      include: { plan: true },
    })
    if (!week) return NextResponse.json({ error: 'Неделя не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(week.plan.clientId, coach.id)

    const remaining = await prisma.gymWeek.findMany({
      where: { planId: week.planId, id: { not: weekId } },
      orderBy: { weekNumber: 'asc' },
      include: { workouts: { select: { id: true, scheduledDate: true } } },
    })

    // Safe to apply in ascending order without temp/negative placeholders:
    // a remaining week's own weekNumber can only ever be >= its target
    // (1-based) position, so whichever row previously held a given target
    // number has already been moved off it (to an even smaller number) by
    // the time a later row needs to claim it — no @@unique([planId,
    // weekNumber]) collision at any step.
    //
    // Passed straight into $transaction([...]) as one array literal (not
    // built up into a separately-typed variable first) — same pattern the
    // duplicate-last-two-weeks route already uses, so TypeScript infers the
    // heterogeneous GymWeek/GymWorkout operation types contextually from
    // $transaction's own parameter type instead of narrowing to whichever
    // model the first element happens to be.
    await prisma.$transaction([
      prisma.gymWeek.delete({ where: { id: weekId } }),
      ...remaining.flatMap((w, index) => {
        const target = index + 1
        if (w.weekNumber === target) return []
        const deltaMs = (target - w.weekNumber) * WEEK_MS
        return [
          prisma.gymWeek.update({ where: { id: w.id }, data: { weekNumber: target } }),
          ...w.workouts.map((workout) =>
            prisma.gymWorkout.update({
              where: { id: workout.id },
              data: { scheduledDate: new Date(workout.scheduledDate.getTime() + deltaMs) },
            })
          ),
        ]
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
