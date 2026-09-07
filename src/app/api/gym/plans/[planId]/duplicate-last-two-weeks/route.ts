import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// POST /api/gym/plans/:planId/duplicate-last-two-weeks
// Coach-only. Duplicates the last 2 weeks (by weekNumber) — including every
// workout, exercise entry, and set — appended as two new weeks at the end
// of the plan. Mirrors /api/cycles/:cycleId/duplicate-last-two-weeks; this
// is the "Копировать последние 2 недели" button, deliberately not exposed
// to clients.
export async function POST(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const coach = await requireCoach()
    const { planId } = await params

    const plan = await prisma.gymPlan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    await assertGymClientBelongsToCoach(plan.clientId, coach.id)

    const currentMaxes = await prisma.gymClientMax.findMany({ where: { clientId: plan.clientId } })
    const currentMaxByExercise = new Map(currentMaxes.map((max) => [max.exerciseId, max.value]))

    const lastTwoWeeks = await prisma.gymWeek.findMany({
      where: { planId: plan.id },
      orderBy: { weekNumber: 'desc' },
      take: 2,
      include: {
        workouts: {
          include: { entries: { include: { sets: true } } },
        },
      },
    })

    if (lastTwoWeeks.length === 0) {
      return NextResponse.json({ error: 'В плане пока нет недель для копирования' }, { status: 400 })
    }

    // Preserve chronological order (oldest of the two first) when re-appending.
    const sourceWeeks = [...lastTwoWeeks].sort((a, b) => a.weekNumber - b.weekNumber)

    const maxWeek = await prisma.gymWeek.aggregate({
      where: { planId: plan.id },
      _max: { weekNumber: true },
    })
    let nextWeekNumber = (maxWeek._max.weekNumber ?? 0) + 1

    const created: { id: string; weekNumber: number }[] = []

    // Same batched-insert shape as the powerlifting route: build every row
    // in memory (ids generated up front, since children need their
    // parent's id before the parent row exists in the DB), then insert with
    // one createMany per table inside a single transaction, instead of one
    // sequential await per week/workout/entry.
    const weeksData: { id: string; planId: string; weekNumber: number }[] = []
    const workoutsData: { id: string; weekId: string; scheduledDate: Date; dayNumber: number }[] = []
    const entriesData: {
      id: string
      workoutId: string
      exerciseId: string
      orderIndex: number
      oneRepMax: number | null
    }[] = []
    const setsData: { entryId: string; setNumber: number; weight: number; reps: number; toFailure: boolean }[] = []

    for (const source of sourceWeeks) {
      const newWeekId = randomUUID()
      weeksData.push({ id: newWeekId, planId: plan.id, weekNumber: nextWeekNumber })

      for (const workout of source.workouts) {
        const newWorkoutId = randomUUID()
        workoutsData.push({
          id: newWorkoutId,
          weekId: newWeekId,
          // shift the scheduled date forward by however many weeks separate
          // the source week from its new slot
          scheduledDate: new Date(
            workout.scheduledDate.getTime() + (nextWeekNumber - source.weekNumber) * 7 * 24 * 60 * 60 * 1000
          ),
          dayNumber: workout.dayNumber,
        })

        for (const entry of workout.entries) {
          const newEntryId = randomUUID()
          entriesData.push({
            id: newEntryId,
            workoutId: newWorkoutId,
            exerciseId: entry.exerciseId,
            orderIndex: entry.orderIndex,
            oneRepMax: currentMaxByExercise.get(entry.exerciseId) ?? entry.oneRepMax,
          })

          for (const set of entry.sets) {
            setsData.push({
              entryId: newEntryId,
              setNumber: set.setNumber,
              weight: set.weight,
              reps: set.reps,
              toFailure: set.toFailure,
            })
          }
        }
      }

      created.push({ id: newWeekId, weekNumber: nextWeekNumber })
      nextWeekNumber += 1
    }

    await prisma.$transaction([
      prisma.gymWeek.createMany({ data: weeksData }),
      prisma.gymWorkout.createMany({ data: workoutsData }),
      ...(entriesData.length ? [prisma.gymExerciseEntry.createMany({ data: entriesData })] : []),
      ...(setsData.length ? [prisma.gymSetEntry.createMany({ data: setsData })] : []),
    ])

    return NextResponse.json({ createdWeeks: created }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
