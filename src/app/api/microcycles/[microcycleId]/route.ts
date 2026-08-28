import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// DELETE /api/microcycles/:microcycleId — coach-only. Deletes one microcycle
// (= one week) from a plan, cascading its workouts/exercise entries/sets via
// the relations declared in schema.prisma. Doesn't renumber the remaining
// weeks or touch Cycle.weeks (an informational total, not an enforced cap —
// see duplicate-last-two-weeks/route.ts, which already appends past it) —
// a gap in weekNumber is harmless, same as any other list after a delete.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { microcycleId: string } }
) {
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

    await prisma.microcycle.delete({ where: { id: params.microcycleId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
