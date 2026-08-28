import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/cycles/:cycleId/duplicate-last-two-weeks
// Coach-only. Duplicates the last 2 microcycles (by weekNumber) — including every
// workout, exercise entry, and set — appended as two new weeks at the end of the cycle.
// This is the "Копировать последние 2 недели" button; deliberately not exposed to athletes.
export async function POST(_req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const coach = await requireCoach()

    const cycle = await prisma.cycle.findUnique({ where: { id: params.cycleId } })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(cycle.athleteId, coach.id)

    const lastTwoMicrocycles = await prisma.microcycle.findMany({
      where: { cycleId: cycle.id },
      orderBy: { weekNumber: 'desc' },
      take: 2,
      include: {
        workouts: {
          include: { exerciseEntries: { include: { sets: true } } },
        },
      },
    })

    if (lastTwoMicrocycles.length === 0) {
      return NextResponse.json({ error: 'В цикле пока нет микроциклов для копирования' }, { status: 400 })
    }

    // Preserve chronological order (oldest of the two first) when re-appending.
    const sourceWeeks = [...lastTwoMicrocycles].sort((a, b) => a.weekNumber - b.weekNumber)

    const maxWeek = await prisma.microcycle.aggregate({
      where: { cycleId: cycle.id },
      _max: { weekNumber: true },
    })
    let nextWeekNumber = (maxWeek._max.weekNumber ?? 0) + 1

    const created: { id: string; weekNumber: number }[] = []

    // Build every row to insert in memory first (ids generated up front, since
    // children need their parent's id before the parent row actually exists in
    // the DB), then insert with one createMany per table inside a single
    // transaction — instead of one sequential await per microcycle/workout/
    // exercise entry, which was O(workouts × exercises) round-trips and made
    // this very slow for cycles with a few weeks of real training data.
    const microcyclesData: { id: string; cycleId: string; weekNumber: number }[] = []
    const workoutsData: {
      id: string
      microcycleId: string
      scheduledDate: Date
      dayNumber: number
    }[] = []
    const exerciseEntriesData: {
      id: string
      workoutId: string
      exerciseId: string
      orderIndex: number
      multiplier: number
      skipped: boolean
    }[] = []
    const setsData: {
      exerciseEntryId: string
      setNumber: number
      weight: number
      reps: number
      rpe: number | null
      completed: boolean
    }[] = []

    for (const source of sourceWeeks) {
      const newMicrocycleId = randomUUID()
      microcyclesData.push({ id: newMicrocycleId, cycleId: cycle.id, weekNumber: nextWeekNumber })

      for (const workout of source.workouts) {
        const newWorkoutId = randomUUID()
        workoutsData.push({
          id: newWorkoutId,
          microcycleId: newMicrocycleId,
          // shift the scheduled date forward by however many weeks separate
          // the source week from its new slot
          scheduledDate: new Date(
            workout.scheduledDate.getTime() +
              (nextWeekNumber - source.weekNumber) * 7 * 24 * 60 * 60 * 1000
          ),
          dayNumber: workout.dayNumber,
        })

        for (const entry of workout.exerciseEntries) {
          const newEntryId = randomUUID()
          exerciseEntriesData.push({
            id: newEntryId,
            workoutId: newWorkoutId,
            exerciseId: entry.exerciseId,
            orderIndex: entry.orderIndex,
            multiplier: entry.multiplier,
            skipped: false,
          })

          for (const s of entry.sets) {
            setsData.push({
              exerciseEntryId: newEntryId,
              setNumber: s.setNumber,
              weight: s.weight,
              reps: s.reps,
              rpe: s.rpe,
              completed: false,
            })
          }
        }
      }

      created.push({ id: newMicrocycleId, weekNumber: nextWeekNumber })
      nextWeekNumber += 1
    }

    await prisma.$transaction([
      prisma.microcycle.createMany({ data: microcyclesData }),
      prisma.workout.createMany({ data: workoutsData }),
      ...(exerciseEntriesData.length
        ? [prisma.exerciseEntry.createMany({ data: exerciseEntriesData })]
        : []),
      ...(setsData.length ? [prisma.setEntry.createMany({ data: setsData })] : []),
    ])

    return NextResponse.json({ createdMicrocycles: created }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
