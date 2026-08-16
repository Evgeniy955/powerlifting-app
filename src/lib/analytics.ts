import { prisma } from './prisma'
import { computeExerciseMetrics, aggregateMetrics } from './metrics'
import type { RpePoint } from './rpe'

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
