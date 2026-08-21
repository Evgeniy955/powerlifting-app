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

  // Sibling days in the same microcycle, for prev/next navigation on the day
  // page — ordered by dayNumber (not creation order), same reasoning as
  // prevWeek/nextWeek below: stays correct even if days were created out of
  // order (e.g. via import).
  const siblingDays = await prisma.workout.findMany({
    where: { microcycleId: workout.microcycleId },
    orderBy: { dayNumber: 'asc' },
    select: { id: true, dayNumber: true, scheduledDate: true },
  })
  const currentDayIndex = siblingDays.findIndex((w) => w.id === workout.id)
  const prevDay = currentDayIndex > 0 ? siblingDays[currentDayIndex - 1] : null
  const nextDay =
    currentDayIndex >= 0 && currentDayIndex < siblingDays.length - 1
      ? siblingDays[currentDayIndex + 1]
      : null

  return {
    id: workout.id,
    scheduledDate: workout.scheduledDate,
    dayNumber: workout.dayNumber,
    weekNumber: workout.microcycle.weekNumber,
    microcycleId: workout.microcycleId,
    athleteId,
    cycleId: workout.microcycle.cycleId,
    cycleStartDate: workout.microcycle.cycle.startDate,
    prevDay,
    nextDay,
    exerciseEntries: workout.exerciseEntries.map((entry) => ({
      id: entry.id,
      orderIndex: entry.orderIndex,
      multiplier: entry.multiplier,
      skipped: entry.skipped,
      exercise: {
        id: entry.exercise.id,
        name: entry.exercise.name,
        category: entry.exercise.category,
        impactCoefficient: entry.exercise.impactCoefficient,
        trainingGroup: entry.exercise.trainingGroup,
      },
      oneRepMax: oneRepMaxByExercise.get(entry.exerciseId) ?? null,
      sets: entry.sets.map((s) => ({
        id: s.id,
        setNumber: s.setNumber,
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        completed: s.completed,
      })),
    })),
  }
}

/**
 * Loads a microcycle (week) with every workout (day) in it, each carrying the
 * same shape `getWorkoutForDisplay` returns per day — so the week page can render
 * one <WorkoutView> per day on a single scrollable page instead of the coach/athlete
 * having to click into each day separately. The 1RM lookup is batched once across
 * every exercise used anywhere in the week, rather than once per day.
 */
export async function getMicrocycleForDisplay(microcycleId: string) {
  const microcycle = await prisma.microcycle.findUnique({
    where: { id: microcycleId },
    include: {
      cycle: true,
      workouts: {
        orderBy: { dayNumber: 'asc' },
        include: {
          exerciseEntries: {
            orderBy: { orderIndex: 'asc' },
            include: {
              exercise: true,
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
      },
    },
  })
  if (!microcycle) return null

  const athleteId = microcycle.cycle.athleteId
  const exerciseIds = Array.from(
    new Set(microcycle.workouts.flatMap((w) => w.exerciseEntries.map((e) => e.exerciseId)))
  )

  const oneRepMaxes = exerciseIds.length
    ? await prisma.athlete1RM.findMany({
        where: { athleteId, exerciseId: { in: exerciseIds } },
      })
    : []
  const oneRepMaxByExercise = new Map(oneRepMaxes.map((rm) => [rm.exerciseId, rm.value]))

  // Sibling weeks in the same cycle, for prev/next navigation on the week page —
  // ordered by weekNumber (not creation order), so "next" always means "the
  // following week" even if weeks were created out of order (e.g. via import).
  const siblingWeeks = await prisma.microcycle.findMany({
    where: { cycleId: microcycle.cycleId },
    orderBy: { weekNumber: 'asc' },
    select: { id: true, weekNumber: true },
  })
  const currentIndex = siblingWeeks.findIndex((w) => w.id === microcycle.id)
  const prevWeek = currentIndex > 0 ? siblingWeeks[currentIndex - 1] : null
  const nextWeek =
    currentIndex >= 0 && currentIndex < siblingWeeks.length - 1
      ? siblingWeeks[currentIndex + 1]
      : null

  return {
    id: microcycle.id,
    weekNumber: microcycle.weekNumber,
    cycleId: microcycle.cycleId,
    cycleName: microcycle.cycle.name,
    cycleStartDate: microcycle.cycle.startDate,
    athleteId,
    prevWeek,
    nextWeek,
    workouts: microcycle.workouts.map((workout) => ({
      id: workout.id,
      dayNumber: workout.dayNumber,
      scheduledDate: workout.scheduledDate,
      exerciseEntries: workout.exerciseEntries.map((entry) => ({
        id: entry.id,
        orderIndex: entry.orderIndex,
        multiplier: entry.multiplier,
        skipped: entry.skipped,
        exercise: {
          id: entry.exercise.id,
          name: entry.exercise.name,
          category: entry.exercise.category,
          impactCoefficient: entry.exercise.impactCoefficient,
          trainingGroup: entry.exercise.trainingGroup,
        },
        oneRepMax: oneRepMaxByExercise.get(entry.exerciseId) ?? null,
        sets: entry.sets.map((s) => ({
          id: s.id,
          setNumber: s.setNumber,
          weight: s.weight,
          reps: s.reps,
          rpe: s.rpe,
          completed: s.completed,
        })),
      })),
    })),
  }
}

export async function getRpeTable() {
  const rows = await prisma.rpeTable.findMany()
  return rows.map((r) => ({ reps: r.reps, rpe: r.rpe, percent1rm: r.percent1rm }))
}
