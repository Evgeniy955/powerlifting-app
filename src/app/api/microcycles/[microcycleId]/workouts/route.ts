import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/microcycles/:microcycleId/workouts { scheduledDate } — coach-only.
// Appends one empty training day (Workout, no exercises yet) to a microcycle
// that already exists — the "+ Добавить день" counterpart to
// AddMicrocycleButton for a week that's missing one. Needed because a
// manually-added microcycle (POST /api/cycles/:cycleId/microcycles) starts
// with zero workouts and, until this route existed, had no way to ever get
// any: MicrocycleWeekView only renders a day's card (and the "Редактировать
// неделю" unlock toggle) once workouts.length > 0, so an empty week was a
// dead end with no edit or add-day affordance anywhere in the UI.
// dayNumber is just "next in this microcycle" — unlike the bulk plan-creation
// route, a single manually-added day has no weekday pattern to stay aligned
// with, so the coach picks its calendar date directly.
export async function POST(
  req: NextRequest,
  { params }: { params: { microcycleId: string } }
) {
  try {
    const coach = await requireCoach()

    const microcycle = await prisma.microcycle.findUnique({
      where: { id: params.microcycleId },
      include: { cycle: true, workouts: { select: { dayNumber: true } } },
    })
    if (!microcycle) {
      return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(microcycle.cycle.athleteId, coach.id)

    const body = (await req.json()) as { scheduledDate?: string }
    if (!body.scheduledDate) {
      return NextResponse.json({ error: 'Дата обязательна' }, { status: 400 })
    }
    const scheduledDate = new Date(body.scheduledDate)
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 })
    }

    const nextDayNumber =
      microcycle.workouts.reduce((max, w) => Math.max(max, w.dayNumber), 0) + 1

    const workout = await prisma.workout.create({
      data: { microcycleId: microcycle.id, scheduledDate, dayNumber: nextDayNumber },
    })

    return NextResponse.json(workout, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
