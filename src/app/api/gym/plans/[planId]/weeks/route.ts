import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// POST /api/gym/plans/:planId/weeks — coach-only. Appends one empty week
// (next weekNumber, no days yet) to a plan — the plan page's "+ Добавить
// неделю", counterpart to DeleteGymWeekButton. Mirrors
// /api/cycles/:cycleId/microcycles on the powerlifting side: the coach adds
// actual training days for the new week afterward via GymWeekView's own
// "Добавить день" (the week renders with an empty-state prompt in the
// meantime, same as a Microcycle with zero Workouts). Doesn't touch
// GymPlan.weeks — that's just an informational total, already left
// untouched by delete for the same reason.
export async function POST(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const coach = await requireCoach()
    const { planId } = await params

    const plan = await prisma.gymPlan.findUnique({
      where: { id: planId },
      include: { weeksData: { select: { weekNumber: true } } },
    })
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    await assertGymClientBelongsToCoach(plan.clientId, coach.id)

    const nextWeek = plan.weeksData.reduce((max, w) => Math.max(max, w.weekNumber), 0) + 1

    const week = await prisma.gymWeek.create({ data: { planId: plan.id, weekNumber: nextWeek } })

    return NextResponse.json(week, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
