import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// POST /api/cycles/:cycleId/duplicate { startDate, name? } — coach-only.
// Copies the whole plan (every microcycle/workout/exercise entry/set) as a
// brand-new Cycle for the same athlete, starting on the given date instead
// of the source plan's own startDate — the "+" on the Планы page, for
// reusing a plan (e.g. a past prep block) on a new date without rebuilding
// it by hand. Unlike duplicate-last-two-weeks (which appends onto the same
// cycle), this always creates a separate cycle, so the source plan is left
// untouched.
export async function POST(req: NextRequest, props: { params: Promise<{ cycleId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const source = await prisma.cycle.findUnique({
      where: { id: params.cycleId },
      include: {
        microcycles: {
          include: {
            workouts: {
              include: { exerciseEntries: { include: { sets: true } } },
            },
          },
        },
      },
    })
    if (!source) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    await assertAthleteBelongsToCoach(source.athleteId, coach.id)

    const currentOneRepMaxes = await prisma.athlete1RM.findMany({
      where: { athleteId: source.athleteId },
    })
    const currentOneRepMaxByExercise = new Map(
      currentOneRepMaxes.map((oneRepMax) => [oneRepMax.exerciseId, oneRepMax.value])
    )

    const body = (await req.json()) as { startDate?: string; name?: string }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    const newStartDate = new Date(body.startDate)
    if (Number.isNaN(newStartDate.getTime())) {
      return NextResponse.json({ error: 'Некорректная дата начала' }, { status: 400 })
    }
    const newName = body.name?.trim() || `${source.name} (копия)`

    const deltaDays = Math.round((newStartDate.getTime() - source.startDate.getTime()) / DAY_MS)

    const newCycleId = randomUUID()

    // Same "build every row in memory, then one createMany per table" shape
    // as duplicate-last-two-weeks/route.ts — avoids one round-trip per
    // workout/exercise entry, which for a full multi-week plan is enough
    // queries to reliably hit Supabase's pooled-connection transaction
    // limits.
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
      oneRepMax: number | null
    }[] = []
    const setsData: {
      exerciseEntryId: string
      setNumber: number
      weight: number
      reps: number
      rpe: number | null
      completed: boolean
    }[] = []

    for (const microcycle of source.microcycles) {
      const newMicrocycleId = randomUUID()
      microcyclesData.push({
        id: newMicrocycleId,
        cycleId: newCycleId,
        weekNumber: microcycle.weekNumber,
      })

      for (const workout of microcycle.workouts) {
        const newWorkoutId = randomUUID()
        workoutsData.push({
          id: newWorkoutId,
          microcycleId: newMicrocycleId,
          scheduledDate: new Date(workout.scheduledDate.getTime() + deltaDays * DAY_MS),
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
            // A duplicated plan is a newly scheduled plan, so start it with
            // the athlete's current 1RM rather than an old plan's snapshot.
            oneRepMax: currentOneRepMaxByExercise.get(entry.exerciseId) ?? entry.oneRepMax,
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
    }

    await prisma.$transaction([
      prisma.cycle.create({
        data: {
          id: newCycleId,
          athleteId: source.athleteId,
          name: newName,
          startDate: newStartDate,
          weeks: source.weeks,
        },
      }),
      ...(microcyclesData.length ? [prisma.microcycle.createMany({ data: microcyclesData })] : []),
      ...(workoutsData.length ? [prisma.workout.createMany({ data: workoutsData })] : []),
      ...(exerciseEntriesData.length
        ? [prisma.exerciseEntry.createMany({ data: exerciseEntriesData })]
        : []),
      ...(setsData.length ? [prisma.setEntry.createMany({ data: setsData })] : []),
    ])

    return NextResponse.json({ cycleId: newCycleId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
