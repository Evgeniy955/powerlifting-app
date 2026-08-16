import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import type { ParsedExerciseRow } from '@/lib/excelImport'

// POST /api/athletes/:athleteId/import/confirm { cycleName, entries }
// Commits coach-reviewed, recognized rows into a brand-new Cycle: groups entries by
// date into Workouts, buckets those into Microcycles by week offset from the
// earliest date, and upserts any 1RM values found along the way.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const { cycleName, entries } = (await req.json()) as {
      cycleName: string
      entries: ParsedExerciseRow[]
    }

    const validEntries = entries.filter((e) => e.matchedExerciseId)
    if (validEntries.length === 0) {
      return NextResponse.json({ error: 'Нет распознанных строк для импорта' }, { status: 400 })
    }

    const uniqueDates = Array.from(new Set(validEntries.map((e) => e.date))).sort()
    const startDate = new Date(uniqueDates[0])
    const lastDate = new Date(uniqueDates[uniqueDates.length - 1])
    const weeks = Math.max(
      1,
      Math.ceil((lastDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
    )

    const result = await prisma.$transaction(async (tx) => {
      const cycle = await tx.cycle.create({
        data: {
          athleteId: params.athleteId,
          name: cycleName?.trim() || `Импорт ${uniqueDates[0]} — ${uniqueDates[uniqueDates.length - 1]}`,
          startDate,
          weeks,
        },
      })

      const microcycleByWeek = new Map<number, string>()
      const workoutByDate = new Map<string, { id: string; weekNumber: number }>()
      const dayCounterByWeek = new Map<number, number>()

      for (const dateStr of uniqueDates) {
        const date = new Date(dateStr)
        const weekNumber =
          Math.floor((date.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1

        let microcycleId = microcycleByWeek.get(weekNumber)
        if (!microcycleId) {
          const mc = await tx.microcycle.create({ data: { cycleId: cycle.id, weekNumber } })
          microcycleId = mc.id
          microcycleByWeek.set(weekNumber, microcycleId)
        }

        const dayNumber = (dayCounterByWeek.get(weekNumber) ?? 0) + 1
        dayCounterByWeek.set(weekNumber, dayNumber)

        const workout = await tx.workout.create({
          data: { microcycleId, scheduledDate: date, dayNumber },
        })
        workoutByDate.set(dateStr, { id: workout.id, weekNumber })
      }

      let orderCounterByDate = new Map<string, number>()
      const oneRepMaxByExercise = new Map<string, number>()

      for (const entry of validEntries) {
        const workout = workoutByDate.get(entry.date)!
        const orderIndex = orderCounterByDate.get(entry.date) ?? 0
        orderCounterByDate.set(entry.date, orderIndex + 1)

        const exerciseEntry = await tx.exerciseEntry.create({
          data: {
            workoutId: workout.id,
            exerciseId: entry.matchedExerciseId as string,
            orderIndex,
          },
        })

        await tx.setEntry.createMany({
          data: entry.sets.map((s, i) => ({
            exerciseEntryId: exerciseEntry.id,
            setNumber: i + 1,
            weight: s.weight,
            reps: s.reps,
          })),
        })

        if (entry.oneRepMax) {
          const prev = oneRepMaxByExercise.get(entry.matchedExerciseId as string) ?? 0
          if (entry.oneRepMax > prev) {
            oneRepMaxByExercise.set(entry.matchedExerciseId as string, entry.oneRepMax)
          }
        }
      }

      for (const [exerciseId, value] of oneRepMaxByExercise.entries()) {
        await tx.athlete1RM.upsert({
          where: { athleteId_exerciseId: { athleteId: params.athleteId, exerciseId } },
          update: { value },
          create: { athleteId: params.athleteId, exerciseId, value },
        })
      }

      return {
        cycleId: cycle.id,
        workoutsCreated: workoutByDate.size,
        exerciseEntriesCreated: validEntries.length,
      }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
