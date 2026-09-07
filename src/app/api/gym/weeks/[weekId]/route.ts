import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// DELETE /api/gym/weeks/:weekId — coach-only. Deletes one week from a plan,
// cascading its workouts/exercise entries/sets via the relations declared
// in schema.prisma. Mirrors DELETE /api/microcycles/:microcycleId: doesn't
// renumber the remaining weeks or touch GymPlan.weeks (an informational
// total, not an enforced cap) — a gap in weekNumber is harmless, same as
// any other list after a delete.
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

    await prisma.gymWeek.delete({ where: { id: weekId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
