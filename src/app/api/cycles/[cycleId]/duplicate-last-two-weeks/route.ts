import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
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

    for (const source of sourceWeeks) {
      const newMicrocycle = await prisma.microcycle.create({
        data: { cycleId: cycle.id, weekNumber: nextWeekNumber },
      })

      for (const workout of source.workouts) {
        const newWorkout = await prisma.workout.create({
          data: {
            microcycleId: newMicrocycle.id,
            // shift the scheduled date forward by however many weeks separate
            // the source week from its new slot
            scheduledDate: new Date(
              workout.scheduledDate.getTime() +
                (nextWeekNumber - source.weekNumber) * 7 * 24 * 60 * 60 * 1000
            ),
            dayNumber: workout.dayNumber,
          },
        })

        for (const entry of workout.exerciseEntries) {
          const newEntry = await prisma.exerciseEntry.create({
            data: {
              workoutId: newWorkout.id,
              exerciseId: entry.exerciseId,
              orderIndex: entry.orderIndex,
              multiplier: entry.multiplier,
            },
          })

          if (entry.sets.length) {
            await prisma.setEntry.createMany({
              data: entry.sets.map((s) => ({
                exerciseEntryId: newEntry.id,
                setNumber: s.setNumber,
                weight: s.weight,
                reps: s.reps,
                rpe: s.rpe,
              })),
            })
          }
        }
      }

      created.push({ id: newMicrocycle.id, weekNumber: nextWeekNumber })
      nextWeekNumber += 1
    }

    return NextResponse.json({ createdMicrocycles: created }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
