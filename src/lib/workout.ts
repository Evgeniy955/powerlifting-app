import { prisma } from './prisma'

/**
 * Loads a workout with everything the day-view UI needs to render and compute
 * metrics client-side: exercise entries, their sets, exercise catalog info
 * (impactCoefficient), and the athlete's 1RM for each exercise used that day.
 * Also resolves the owning athleteId (via microcycle -> cycle) for authorization checks.
 */
export async function getWorkoutForDisplay(workoutId: string) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: {
      microcycle: { include: { cycle: true } },
      exerciseEntries: {
        orderBy: { orderIndex: 'asc' },
        include: {
          exercise: true,
          sets: { orderBy: { setNumber: 'asc' } },
        },
      },
    },
  })
  if (!workout) return null

  const athleteId = workout.microcycle.cycle.athleteId
  const exerciseIds = workout.exerciseEntries.map((e) => e.exerciseId)

  const oneRepMaxes = exerciseIds.length
    ? await prisma.athlete1RM.findMany({
        where: { athleteId, exerciseId: { in: exerciseIds } },
      })
    : []
  const oneRepMaxByExercise = new Map(oneRepMaxes.map((rm) => [rm.exerciseId, rm.value]))

  return {
    id: workout.id,
    scheduledDate: workout.scheduledDate,
    dayNumber: workout.dayNumber,
    weekNumber: workout.microcycle.weekNumber,
    athleteId,
    cycleId: workout.microcycle.cycleId,
    exerciseEntries: workout.exerciseEntries.map((entry) => ({
      id: entry.id,
      orderIndex: entry.orderIndex,
      multiplier: entry.multiplier,
      exercise: {
        id: entry.exercise.id,
        name: entry.exercise.name,
        category: entry.exercise.category,
        impactCoefficient: entry.exercise.impactCoefficient,
      },
      oneRepMax: oneRepMaxByExercise.get(entry.exerciseId) ?? null,
      sets: entry.sets.map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
      })),
    })),
  }
}

export async function getRpeTable() {
  const rows = await prisma.rpeTable.findMany()
  return rows.map((r) => ({ reps: r.reps, rpe: r.rpe, percent1rm: r.percent1rm }))
}
