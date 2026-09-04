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
// exercise), so its sets are left out of the import entirely. Mirrors
// /api/athletes/:athleteId/import/confirm on the powerlifting side.
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

    const plan = await prisma.$transaction(async (tx) => {
      const maxes = await tx.gymClientMax.findMany({ where: { clientId } })
      const maxByExercise = new Map(maxes.map((max) => [max.exerciseId, max.value]))
      const prepared = [] as { week: number; day: number; date: Date | null; exercises: (ImportedExercise & { exerciseId: string; resolvedMax: number | null })[] }[]

      for (const workout of workouts) {
        const exercises = [] as (ImportedExercise & { exerciseId: string; resolvedMax: number | null })[]
        for (const exercise of workout.exercises) {
          const exerciseId = nameToExerciseId[gymExerciseNameKey(exercise.name)]
          const currentMax = maxByExercise.get(exerciseId)
          const firstWeightedSet = exercise.sets.find((set) => set.weight > 0) ?? exercise.sets[0]
          const estimatedMax = firstWeightedSet.weight > 0
            ? estimateGymOneRepMax(firstWeightedSet.weight, firstWeightedSet.reps)
            : null
          const resolvedMax = (!currentMax ? estimatedMax : null) ?? currentMax ?? null
          if (estimatedMax && !currentMax) {
            await tx.gymClientMax.upsert({
              where: { clientId_exerciseId: { clientId, exerciseId } },
              create: { clientId, exerciseId, value: estimatedMax },
              update: { value: estimatedMax },
            })
            maxByExercise.set(exerciseId, estimatedMax)
          }
          exercises.push({ ...exercise, exerciseId, resolvedMax })
        }
        prepared.push({ week: workout.week, day: workout.day, date: workout.date, exercises })
      }

      // The document's own earliest training date, when it had date
      // headers — falls back to today only for a plain undated paste (a
      // single day's exercises with no "15.06.26"-style header at all).
      const startDate = prepared.find((workout) => workout.date)?.date ?? new Date()
      return tx.gymPlan.create({
        data: {
          clientId,
          name: planName,
          weeks: parsedPlan.weeks,
          startDate,
          weeksData: {
            create: Array.from({ length: parsedPlan.weeks }, (_, index) => {
              const weekNumber = index + 1
              return {
                weekNumber,
                workouts: {
                  create: prepared
                    .filter((workout) => workout.week === weekNumber)
                    .map((workout) => ({
                      dayNumber: workout.day,
                      // Real date from the document when it had one —
                      // otherwise fall back to the old evenly-spaced guess
                      // so an undated paste still gets a sensible schedule.
                      scheduledDate: workout.date
                        ?? new Date(startDate.getTime() + ((weekNumber - 1) * 7 + workout.day - 1) * 86400000),
                      entries: {
                        create: workout.exercises.map((exercise, orderIndex) => ({
                          exerciseId: exercise.exerciseId,
                          orderIndex,
                          oneRepMax: exercise.resolvedMax,
                          sets: {
                            create: exercise.sets.map((set, setIndex) => ({
                              setNumber: setIndex + 1,
                              weight: set.weight,
                              reps: set.reps,
                              toFailure: set.toFailure ?? false,
                            })),
                          },
                        })),
                      },
                    })),
                },
              }
            }),
          },
        },
      })
    })

    return NextResponse.json({ planId: plan.id, workouts: workouts.length })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
