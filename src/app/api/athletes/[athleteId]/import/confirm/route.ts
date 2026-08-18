import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import type { ParsedExerciseRow } from '@/lib/excelImport'

// POST /api/athletes/:athleteId/import/confirm { cycleName, entries }
// Commits coach-reviewed, recognized rows into a brand-new Cycle: groups entries by
// date into Workouts, buckets those into Microcycles by week offset from the
// earliest date, and upserts any 1RM values found along the way.
//
// NOTE: this deliberately avoids Prisma's *interactive* transaction
// (`prisma.$transaction(async (tx) => ...)`) — against Supabase's pooled/pgbouncer
// connection (transaction mode, used at runtime), a long-running interactive
// transaction with hundreds of round trips reliably dies with "Transaction API
// error: Transaction not found" once the pooler recycles the underlying
// connection mid-transaction. Instead, every id that a later row needs to
// reference is generated up front in JS (ids are client-side `uuid()` defaults
// anyway), and the whole import is issued as one *batched* `$transaction([...])`
// of plain creates/createMany calls — sent to the DB as a single request, so
// there's no window for the pooler to swap connections underneath it.
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

    const cycleId = randomUUID()

    const microcyclesData: { id: string; cycleId: string; weekNumber: number }[] = []
    const workoutsData: {
      id: string
      microcycleId: string
      scheduledDate: Date
      dayNumber: number
    }[] = []

    const microcycleByWeek = new Map<number, string>()
    const workoutByDate = new Map<string, string>()
    const dayCounterByWeek = new Map<number, number>()

    for (const dateStr of uniqueDates) {
      const date = new Date(dateStr)
      const weekNumber =
        Math.floor((date.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1

      let microcycleId = microcycleByWeek.get(weekNumber)
      if (!microcycleId) {
        microcycleId = randomUUID()
        microcycleByWeek.set(weekNumber, microcycleId)
        microcyclesData.push({ id: microcycleId, cycleId, weekNumber })
      }

      const dayNumber = (dayCounterByWeek.get(weekNumber) ?? 0) + 1
      dayCounterByWeek.set(weekNumber, dayNumber)

      const workoutId = randomUUID()
      workoutByDate.set(dateStr, workoutId)
      workoutsData.push({ id: workoutId, microcycleId, scheduledDate: date, dayNumber })
    }

    const exerciseEntriesData: {
      id: string
      workoutId: string
      exerciseId: string
      orderIndex: number
    }[] = []
    const setEntriesData: {
      exerciseEntryId: string
      setNumber: number
      weight: number
      reps: number
    }[] = []

    const orderCounterByDate = new Map<string, number>()
    const oneRepMaxByExercise = new Map<string, number>()

    for (const entry of validEntries) {
      const workoutId = workoutByDate.get(entry.date)!
      // Prefer the "Порядок" value that sat next to the exercise name in the
      // source sheet — it's the coach's actual intended exercise sequence for
      // that day, and isn't always the same as row order (e.g. a superset's
      // second exercise can be listed with a lower order than the first). Rows
      // that never had a value there (many don't) fall back to a per-date
      // positional counter, same as before.
      const fallback = orderCounterByDate.get(entry.date) ?? 0
      orderCounterByDate.set(entry.date, fallback + 1)
      const orderIndex = entry.sourceOrder ?? fallback

      const exerciseEntryId = randomUUID()
      exerciseEntriesData.push({
        id: exerciseEntryId,
        workoutId,
        exerciseId: entry.matchedExerciseId as string,
        orderIndex,
      })

      for (const [i, s] of entry.sets.entries()) {
        setEntriesData.push({
          exerciseEntryId,
          setNumber: i + 1,
          weight: s.weight,
          reps: s.reps,
        })
      }

      if (entry.oneRepMax) {
        const prev = oneRepMaxByExercise.get(entry.matchedExerciseId as string) ?? 0
        if (entry.oneRepMax > prev) {
          oneRepMaxByExercise.set(entry.matchedExerciseId as string, entry.oneRepMax)
        }
      }
    }

    await prisma.$transaction([
      prisma.cycle.create({
        data: {
          id: cycleId,
          athleteId: params.athleteId,
          name:
            cycleName?.trim() || `Импорт ${uniqueDates[0]} — ${uniqueDates[uniqueDates.length - 1]}`,
          startDate,
          weeks,
        },
      }),
      prisma.microcycle.createMany({ data: microcyclesData }),
      prisma.workout.createMany({ data: workoutsData }),
      prisma.exerciseEntry.createMany({ data: exerciseEntriesData }),
      ...(setEntriesData.length > 0 ? [prisma.setEntry.createMany({ data: setEntriesData })] : []),
      ...Array.from(oneRepMaxByExercise.entries()).map(([exerciseId, value]) =>
        prisma.athlete1RM.upsert({
          where: { athleteId_exerciseId: { athleteId: params.athleteId, exerciseId } },
          update: { value },
          create: { athleteId: params.athleteId, exerciseId, value },
        })
      ),
    ])

    return NextResponse.json(
      {
        cycleId,
        workoutsCreated: workoutByDate.size,
        exerciseEntriesCreated: validEntries.length,
      },
      { status: 201 }
    )
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
