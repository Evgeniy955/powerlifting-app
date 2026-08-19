import { prisma } from './prisma'
import { computeExerciseMetrics, aggregateMetrics } from './metrics'
import type { RpePoint } from './rpe'
import { isMainLiftVariation } from './mainLifts'

export type WeeklyLoadPoint = {
  weekNumber: number
  cycleId: string
  cycleName: string
  tonnage: number
  kpsh: number
  avgWeight: number
  loadCoefficient: number
  fatigueIndex: number | null
}

export type ProgressPoint = {
  date: string // ISO date of the workout
  weight: number // heaviest single set that day for this exercise
  estimated1rm: number // Epley estimate from that top set, for trend context
}

/**
 * Weekly load distribution across every cycle/microcycle the athlete has, in
 * chronological order. Mirrors the "тоннаж/КПШ по неделям" summary sheet.
 */
export async function getWeeklyLoadDistribution(
  athleteId: string,
  rpeTable: RpePoint[]
): Promise<WeeklyLoadPoint[]> {
  const cycles = await prisma.cycle.findMany({
    where: { athleteId },
    orderBy: { startDate: 'asc' },
    include: {
      microcycles: {
        orderBy: { weekNumber: 'asc' },
        include: {
          workouts: {
            include: {
              exerciseEntries: {
                include: { exercise: true, sets: true },
              },
            },
          },
        },
      },
    },
  })

  const oneRepMaxes = await prisma.athlete1RM.findMany({ where: { athleteId } })
  const oneRepMaxByExercise = new Map(oneRepMaxes.map((rm) => [rm.exerciseId, rm.value]))

  const points: WeeklyLoadPoint[] = []

  for (const cycle of cycles) {
    for (const mc of cycle.microcycles) {
      const entryMetrics = mc.workouts.flatMap((w) =>
        w.exerciseEntries.map((entry) =>
          computeExerciseMetrics(
            {
              sets: entry.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
              oneRepMax: oneRepMaxByExercise.get(entry.exerciseId) ?? 0,
              impactCoefficient: entry.exercise.impactCoefficient,
              multiplier: entry.multiplier,
            },
            rpeTable
          )
        )
      )
      const agg = aggregateMetrics(entryMetrics)
      points.push({
        weekNumber: mc.weekNumber,
        cycleId: cycle.id,
        cycleName: cycle.name,
        tonnage: agg.tonnage,
        kpsh: agg.kpsh,
        avgWeight: agg.avgWeight,
        loadCoefficient: agg.loadCoefficient,
        fatigueIndex: agg.fatigueIndex,
      })
    }
  }

  return points
}

export type CycleWeeklyPoint = {
  weekNumber: number
  microcycleId: string
  tonnage: number
  kpsh: number
  avgWeight: number
  relativeIntensity: number
  loadCoefficient: number
  fatigueIndex: number | null
}

export type CycleAnalyticsExercise = { exerciseId: string; name: string }

export type CycleAnalytics = {
  cycleId: string
  cycleName: string
  totalWeeks: number
  selectedExerciseId: string | null
  exercises: CycleAnalyticsExercise[]
  weeks: CycleWeeklyPoint[]
  summary: {
    tonnage: number
    kpsh: number
    avgWeight: number
    relativeIntensity: number
    loadCoefficient: number
    fatigueIndex: number | null
  }
}

/**
 * Per-week analytics for one mesocycle (cycle), mirroring the source Excel
 * per-movement sheet (e.g. "Приседания"): one row per week with tonnage,
 * average weight, relative intensity, KPSH and KO, plus a whole-mesocycle
 * summary — feeds the cycle analytics page's table + 4 line charts.
 *
 * When `exerciseId` is given, only entries for that exercise are counted
 * (reproducing the per-lift sheets). Omitted, every exercise in the cycle is
 * aggregated together (whole-week training load, like the microcycle page's
 * MetricsBadge, but broken out per week across the whole mesocycle).
 */
export async function getCycleAnalytics(
  cycleId: string,
  rpeTable: RpePoint[],
  exerciseId?: string | null
): Promise<CycleAnalytics | null> {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: {
      microcycles: {
        orderBy: { weekNumber: 'asc' },
        include: {
          workouts: {
            include: {
              exerciseEntries: {
                include: { exercise: true, sets: true },
              },
            },
          },
        },
      },
    },
  })
  if (!cycle) return null

  const oneRepMaxes = await prisma.athlete1RM.findMany({ where: { athleteId: cycle.athleteId } })
  const oneRepMaxByExercise = new Map(oneRepMaxes.map((rm) => [rm.exerciseId, rm.value]))

  const exerciseById = new Map<string, string>()
  for (const mc of cycle.microcycles) {
    for (const w of mc.workouts) {
      for (const entry of w.exerciseEntries) {
        exerciseById.set(entry.exerciseId, entry.exercise.name)
      }
    }
  }
  // Only squat/bench/deadlift variations are offered in the per-exercise
  // picker — accessory and isolation work is excluded even if it was logged
  // in this cycle (see lib/mainLifts.ts for the classification rules).
  const exercises: CycleAnalyticsExercise[] = Array.from(exerciseById.entries())
    .filter(([, name]) => isMainLiftVariation(name))
    .map(([exerciseId, name]) => ({ exerciseId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  // Defense in depth: if a caller passes an exerciseId that isn't a
  // main-lift variation (e.g. a stale link), fall back to the whole-cycle
  // aggregate rather than silently computing per-exercise analytics for an
  // accessory movement.
  if (exerciseId) {
    const name = exerciseById.get(exerciseId)
    if (!name || !isMainLiftVariation(name)) exerciseId = null
  }

  const weeks: CycleWeeklyPoint[] = []
  const allFilteredMetrics: ReturnType<typeof computeExerciseMetrics>[] = []

  for (const mc of cycle.microcycles) {
    const entries = mc.workouts
      .flatMap((w) => w.exerciseEntries)
      .filter((entry) => !exerciseId || entry.exerciseId === exerciseId)

    const entryMetrics = entries.map((entry) =>
      computeExerciseMetrics(
        {
          sets: entry.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          oneRepMax: oneRepMaxByExercise.get(entry.exerciseId) ?? 0,
          impactCoefficient: entry.exercise.impactCoefficient,
          multiplier: entry.multiplier,
        },
        rpeTable
      )
    )
    allFilteredMetrics.push(...entryMetrics)

    const agg = aggregateMetrics(entryMetrics)
    weeks.push({
      weekNumber: mc.weekNumber,
      microcycleId: mc.id,
      tonnage: agg.tonnage,
      kpsh: agg.kpsh,
      avgWeight: agg.avgWeight,
      relativeIntensity: agg.relativeIntensity,
      loadCoefficient: agg.loadCoefficient,
      fatigueIndex: agg.fatigueIndex,
    })
  }

  const summaryAgg = aggregateMetrics(allFilteredMetrics)

  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    totalWeeks: cycle.weeks,
    selectedExerciseId: exerciseId ?? null,
    exercises,
    weeks,
    summary: {
      tonnage: summaryAgg.tonnage,
      kpsh: summaryAgg.kpsh,
      avgWeight: summaryAgg.avgWeight,
      relativeIntensity: summaryAgg.relativeIntensity,
      loadCoefficient: summaryAgg.loadCoefficient,
      fatigueIndex: summaryAgg.fatigueIndex,
    },
  }
}

/**
 * Progress series for a single exercise: one point per workout day it appears in,
 * using the heaviest set of that day. Powers the "Присед/Жим/Тяга" progress charts —
 * pass the squat/bench/deadlift exerciseId to reproduce the original "П"/"Ж"/"Т" sheets,
 * or any other catalog exerciseId for accessory-lift progress.
 */
export async function getExerciseProgress(
  athleteId: string,
  exerciseId: string
): Promise<ProgressPoint[]> {
  const entries = await prisma.exerciseEntry.findMany({
    where: {
      exerciseId,
      workout: { microcycle: { cycle: { athleteId } } },
    },
    include: {
      sets: true,
      workout: { select: { scheduledDate: true } },
    },
    orderBy: { workout: { scheduledDate: 'asc' } },
  })

  return entries
    .map((entry) => {
      const topWeight = entry.sets.reduce((max, s) => (s.weight > max ? s.weight : max), 0)
      const topSet = entry.sets.find((s) => s.weight === topWeight)
      const reps = topSet?.reps ?? 0
      // Epley formula: 1RM ≈ weight × (1 + reps/30)
      const estimated1rm = topWeight > 0 ? Math.round(topWeight * (1 + reps / 30) * 10) / 10 : 0
      return {
        date: entry.workout.scheduledDate.toISOString().slice(0, 10),
        weight: topWeight,
        estimated1rm,
      }
    })
    .filter((p) => p.weight > 0)
}
