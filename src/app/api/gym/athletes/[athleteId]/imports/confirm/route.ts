import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { estimateGymOneRepMax } from '@/lib/gym'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { gymExerciseNameKey } from '@/lib/gymExerciseMatch'
import type { ImportedExercise } from '@/lib/gymImportParser'

// Shape of the JSON round-tripped from .../imports/preview — Date fields
// arrive as ISO strings (or null) since they crossed a JSON boundary, not
// as ParsedGymPlan's actual Date type.
type PreviewWorkout = {
  week: number
  day: number
  date: string | null
  exercises: ImportedExercise[]
}
type PreviewPlan = { name: string; weeks: number; workouts: PreviewWorkout[] }

// POST /api/gym/athletes/:athleteId/imports/confirm { parsed, nameToExerciseId, planName? }
// — coach-only. `parsed` is exactly what .../imports/preview returned (the
// client resends it rather than the server re-parsing the document);
// `nameToExerciseId` maps every exercise name the coach resolved (either an
// exact/fuzzy catalog match they accepted, or a brand-new catalog exercise
// they just created) to a GymExerciseCatalog id — a name missing from the
// map means the coach chose to skip it (a note/typo row, not a real
// exercise), so its sets are left out of the import entirely.
//
// NOTE: this deliberately avoids an *interactive* transaction
// (`prisma.$transaction(async (tx) => ...)`) — see
// /api/athletes/:athleteId/import/confirm on the powerlifting side for the
// full rationale, which applies identically here: against Supabase's
// pooled/pgbouncer connection (transaction mode), a transaction held open
// across dozens of sequential round trips (one real plan here can be 12
// workouts × ~8 exercises × ~4 sets, plus a 1RM upsert per newly-seen
// exercise) reliably died mid-way with a generic 500 once the pooler
// recycled the underlying connection — reported as "Внутренняя ошибка
// сервера" on the confirm request with no useful detail. Every id a later
// row needs is generated in JS up front instead, and the whole import goes
// out as one batched `$transaction([...])` of plain creates/createMany
// calls — sent to the DB as a single request, so there's no window for the
// pooler to swap connections underneath it. Mirrors both the powerlifting
// import confirm route and this app's own gym plan duplicate route, which
// already uses the same batched pattern.
export async function POST(req: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  try {
    const coach = await requireCoach()
    const { athleteId: clientId } = await params
    await assertGymClientBelongsToCoach(clientId, coach.id)

    const body = await req.json() as {
      parsed?: PreviewPlan
      nameToExerciseId?: Record<string, string>
      planName?: string
    }
    if (!body.parsed || !body.nameToExerciseId) {
      return NextResponse.json({ error: 'Нет данных для импорта' }, { status: 400 })
    }
    const nameToExerciseId = body.nameToExerciseId
    const parsedPlan = body.parsed

    const workouts = parsedPlan.workouts
      .map((workout) => ({
        ...workout,
        date: workout.date ? new Date(workout.date) : null,
        exercises: workout.exercises.filter((exercise) => nameToExerciseId[gymExerciseNameKey(exercise.name)]),
      }))
      .filter((workout) => workout.exercises.length > 0)

    if (!workouts.length) {
      return NextResponse.json({ error: 'Нет распознанных упражнений для импорта' }, { status: 400 })
    }

    const planName = body.planName?.trim().slice(0, 120) || parsedPlan.name

    // The document's own earliest training date, when it had date
    // headers — falls back to today only for a plain undated paste (a
    // single day's exercises with no "15.06.26"-style header at all).
    const startDate = workouts.find((workout) => workout.date)?.date ?? new Date()

    const planId = randomUUID()

    const weekIdByNumber = new Map<number, string>()
    const weeksData: { id: string; planId: string; weekNumber: number }[] = []
    for (let weekNumber = 1; weekNumber <= parsedPlan.weeks; weekNumber += 1) {
      const id = randomUUID()
      weekIdByNumber.set(weekNumber, id)
      weeksData.push({ id, planId, weekNumber })
    }

    const workoutsData: { id: string; weekId: string; scheduledDate: Date; dayNumber: number }[] = []
    const entriesData: { id: string; workoutId: string; exerciseId: string; orderIndex: number; oneRepMax: number | null }[] = []
    const setsData: { entryId: string; setNumber: number; weight: number; reps: number; toFailure: boolean }[] = []

    // Existing 1RM baselines — read once up front instead of once per
    // exercise inside a held-open transaction (see NOTE above).
    const existingMaxes = await prisma.gymClientMax.findMany({ where: { clientId } })
    const maxByExercise = new Map(existingMaxes.map((max) => [max.exerciseId, max.value]))
    const newMaxByExercise = new Map<string, number>()

    for (const workout of workouts) {
      // A workout can land in a week beyond parsedPlan.weeks in principle
      // (weeks is derived from the same workouts, so this shouldn't
      // normally happen) — guard rather than crash on a missing week row.
      let weekId = weekIdByNumber.get(workout.week)
      if (!weekId) {
        weekId = randomUUID()
        weekIdByNumber.set(workout.week, weekId)
        weeksData.push({ id: weekId, planId, weekNumber: workout.week })
      }

      const workoutId = randomUUID()
      const scheduledDate = workout.date
        // Real date from the document when it had one — otherwise fall
        // back to the old evenly-spaced guess so an undated paste still
        // gets a sensible schedule.
        ?? new Date(startDate.getTime() + ((workout.week - 1) * 7 + workout.day - 1) * 86400000)
      workoutsData.push({ id: workoutId, weekId, scheduledDate, dayNumber: workout.day })

      workout.exercises.forEach((exercise, orderIndex) => {
        const exerciseId = nameToExerciseId[gymExerciseNameKey(exercise.name)]
        const currentMax = maxByExercise.get(exerciseId) ?? newMaxByExercise.get(exerciseId)
        const firstWeightedSet = exercise.sets.find((set) => set.weight > 0) ?? exercise.sets[0]
        const estimatedMax = firstWeightedSet.weight > 0
          ? estimateGymOneRepMax(firstWeightedSet.weight, firstWeightedSet.reps)
          : null
        const resolvedMax = currentMax ?? estimatedMax ?? null
        if (estimatedMax && !currentMax) newMaxByExercise.set(exerciseId, estimatedMax)

        const entryId = randomUUID()
        entriesData.push({ id: entryId, workoutId, exerciseId, orderIndex, oneRepMax: resolvedMax })
        exercise.sets.forEach((set, setIndex) => {
          setsData.push({
            entryId,
            setNumber: setIndex + 1,
            weight: set.weight,
            reps: set.reps,
            toFailure: set.toFailure ?? false,
          })
        })
      })
    }

    await prisma.$transaction([
      prisma.gymPlan.create({ data: { id: planId, clientId, name: planName, weeks: parsedPlan.weeks, startDate } }),
      prisma.gymWeek.createMany({ data: weeksData }),
      prisma.gymWorkout.createMany({ data: workoutsData }),
      prisma.gymExerciseEntry.createMany({ data: entriesData }),
      ...(setsData.length ? [prisma.gymSetEntry.createMany({ data: setsData })] : []),
      ...Array.from(newMaxByExercise.entries()).map(([exerciseId, value]) =>
        prisma.gymClientMax.upsert({
          where: { clientId_exerciseId: { clientId, exerciseId } },
          update: { value },
          create: { clientId, exerciseId, value },
        })
      ),
    ])

    return NextResponse.json({ planId, workouts: workouts.length })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
