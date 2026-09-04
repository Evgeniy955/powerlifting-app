import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// POST /api/gym/plans/:planId/duplicate { startDate, name? } — coach-only.
// Copies the whole plan (every week, workout, exercise entry and set) as a
// brand-new GymPlan for the same client, starting on the given date instead
// of the source plan's own startDate. Mirrors
// /api/cycles/:cycleId/duplicate for the powerlifting side; every
// scheduledDate is shifted by the same delta as the plan's own startDate so
// the whole plan stays internally consistent.
export async function POST(req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const coach = await requireCoach()
    const { planId } = await params

    const source = await prisma.gymPlan.findUnique({
      where: { id: planId },
      include: {
        weeksData: {
          include: {
            workouts: {
              include: { entries: { include: { sets: true } } },
            },
          },
        },
      },
    })
    if (!source) {
      return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    }
    await assertGymClientBelongsToCoach(source.clientId, coach.id)

    const body = await req.json() as { startDate?: string; name?: string }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    const newStartDate = new Date(body.startDate)
    if (Number.isNaN(newStartDate.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
    }
    const newName = body.name?.trim().slice(0, 120) || `${source.name} (копия)`

    const deltaDays = Math.round((newStartDate.getTime() - source.startDate.getTime()) / DAY_MS)
    const newPlanId = randomUUID()

    // Build every row in memory, then one createMany per table — same shape
    // as /api/cycles/:cycleId/duplicate, avoiding one round-trip per
    // workout/entry which for a full multi-week plan can exhaust Supabase's
    // pooled-connection transaction limits.
    const weeksData: { id: string; planId: string; weekNumber: number }[] = []
    const workoutsData: { id: string; weekId: string; scheduledDate: Date; dayNumber: number }[] = []
    const entriesData: {
      id: string
      workoutId: string
      exerciseId: string
      orderIndex: number
      oneRepMax: number | null
    }[] = []
    const setsData: { entryId: string; setNumber: number; weight: number; reps: number }[] = []

    for (const week of source.weeksData) {
      const newWeekId = randomUUID()
      weeksData.push({ id: newWeekId, planId: newPlanId, weekNumber: week.weekNumber })

      for (const workout of week.workouts) {
        const newWorkoutId = randomUUID()
        workoutsData.push({
          id: newWorkoutId,
          weekId: newWeekId,
          scheduledDate: new Date(workout.scheduledDate.getTime() + deltaDays * DAY_MS),
          dayNumber: workout.dayNumber,
        })

        for (const entry of workout.entries) {
          const newEntryId = randomUUID()
          entriesData.push({
            id: newEntryId,
            workoutId: newWorkoutId,
            exerciseId: entry.exerciseId,
            orderIndex: entry.orderIndex,
            oneRepMax: entry.oneRepMax,
          })

          for (const set of entry.sets) {
            setsData.push({
              entryId: newEntryId,
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.reps,
            })
          }
        }
      }
    }

    await prisma.$transaction([
      prisma.gymPlan.create({
        data: {
          id: newPlanId,
          clientId: source.clientId,
          name: newName,
          startDate: newStartDate,
          weeks: source.weeks,
        },
      }),
      ...(weeksData.length ? [prisma.gymWeek.createMany({ data: weeksData })] : []),
      ...(workoutsData.length ? [prisma.gymWorkout.createMany({ data: workoutsData })] : []),
      ...(entriesData.length ? [prisma.gymExerciseEntry.createMany({ data: entriesData })] : []),
      ...(setsData.length ? [prisma.gymSetEntry.createMany({ data: setsData })] : []),
    ])

    return NextResponse.json({ planId: newPlanId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
