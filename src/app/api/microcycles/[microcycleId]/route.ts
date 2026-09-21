import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// DELETE /api/microcycles/:microcycleId — coach-only. Deletes one microcycle
// (= one week) from a plan, cascading its workouts/exercise entries/sets via
// the relations declared in schema.prisma.
//
// Every remaining microcycle then compacts to a contiguous 1..N sequence:
// the week that followed the deleted one takes over its number AND its
// calendar slot. A week's calendar slot is derived purely from
// cycle.startDate + weekNumber (see weekAccess.ts: currentWeekNumber and
// isMicrocycleVisibleToAthlete's Sunday-23:50 unlock), so renumbering alone
// would desync "Микроцикл N" from the dates it actually shows — each
// renumbered week's workouts are shifted by the same number of whole weeks
// as its number changed, keeping label and dates in sync. Deleting weeks
// 1..10 of 12 therefore leaves the last two as weeks 1 and 2, dated from the
// plan's original start. Same behaviour as DELETE /api/gym/weeks/:weekId.
//
// Doesn't touch Cycle.weeks (an informational total, not an enforced cap —
// see duplicate-last-two-weeks/route.ts, which already appends past it).
// Existing plans that already have a gap in weekNumber get it closed on
// their next delete.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ microcycleId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const microcycle = await prisma.microcycle.findUnique({
      where: { id: params.microcycleId },
      include: { cycle: true },
    })
    if (!microcycle) {
      return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(microcycle.cycle.athleteId, coach.id)

    const remaining = await prisma.microcycle.findMany({
      where: { cycleId: microcycle.cycleId, id: { not: params.microcycleId } },
      orderBy: { weekNumber: 'asc' },
      include: { workouts: { select: { id: true, scheduledDate: true } } },
    })

    // Applied in ascending order without temp/negative placeholders: a
    // remaining week's own weekNumber can only ever be >= its 1-based target
    // position, so whichever row previously held a given target number has
    // already been moved off it (to an even smaller number) by the time a
    // later row claims it — no @@unique([cycleId, weekNumber]) collision at
    // any step. Passed as one array literal to $transaction so TypeScript
    // infers the mixed Microcycle/Workout operation types contextually (same
    // pattern as duplicate-last-two-weeks and the gym week delete).
    await prisma.$transaction([
      prisma.microcycle.delete({ where: { id: params.microcycleId } }),
      ...remaining.flatMap((mc, index) => {
        const target = index + 1
        if (mc.weekNumber === target) return []
        const deltaMs = (target - mc.weekNumber) * WEEK_MS
        return [
          prisma.microcycle.update({ where: { id: mc.id }, data: { weekNumber: target } }),
          ...mc.workouts.map((workout) =>
            prisma.workout.update({
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
