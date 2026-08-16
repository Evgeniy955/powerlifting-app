// Reactive metrics engine — mirrors the formulas found in the source Excel workbook
// (sheet "1 в день"): tonnage, avg weight, relative intensity, KPSH, load coefficient
// (KO). All computed client-side for instant feedback as the coach/athlete types,
// mirroring the original spreadsheet's live recalculation.
//
// "Индекс усталости" (fatigue index / ИУ / RPE) is computed separately by
// computeBlockFatigue in ./rpe — it replaced the original Excel-derived
// non-linear coefficient curve entirely, per the coach's own RPE chart.

import { computeBlockFatigue, type RpePoint } from './rpe'

export type Set = {
  weight: number
  reps: number
}

export type ExerciseMetricsInput = {
  sets: Set[]
  oneRepMax: number // "ПМ" for this athlete + exercise
  impactCoefficient: number // from ExerciseCatalog, e.g. squat = 1.2, isolation = 0.3
  multiplier?: number // "Множ", default 1 (e.g. dumbbell exercises counted x2)
}

export type ExerciseMetrics = {
  tonnage: number // Тоннаж
  avgWeight: number // Сред.вес
  relativeIntensity: number // Инт.Отн (0..1+)
  kpsh: number // КПШ — total reps across all sets
  loadCoefficient: number // КО = КПШ × Инт.Отн
  fatigueIndex: number | null // Индекс усталости (ИУ / RPE) — null if not computable
  sessionType: 'heavy' | 'light' | null
  fatiguePerSet: (number | null)[] // ИУ per set, same order as input sets, with accumulation
}

export function computeExerciseMetrics(
  input: ExerciseMetricsInput,
  rpeTable: RpePoint[]
): ExerciseMetrics {
  const { sets, oneRepMax, multiplier = 1 } = input

  const kpsh = sets.reduce((sum, s) => sum + s.reps, 0)

  const rawTonnage = sets.reduce((sum, s) => sum + s.weight * s.reps, 0)
  const tonnage = rawTonnage * multiplier

  const avgWeight = kpsh > 0 ? (rawTonnage * multiplier) / kpsh : 0

  const relativeIntensity = oneRepMax > 0 ? avgWeight / oneRepMax : 0

  const loadCoefficient = kpsh * relativeIntensity

  const fatigue = computeBlockFatigue(sets, oneRepMax, rpeTable)

  return {
    tonnage: round2(tonnage),
    avgWeight: round2(avgWeight),
    relativeIntensity: round4(relativeIntensity),
    kpsh,
    loadCoefficient: round2(loadCoefficient),
    fatigueIndex: fatigue.aggregate,
    sessionType: fatigue.sessionType,
    fatiguePerSet: fatigue.perSet,
  }
}

/** Aggregate metrics across multiple exercises (e.g. all squat variants in a microcycle,
 * matching the "П"/"Ж"/"Т" summary sheets in the original workbook). fatigueIndex is
 * averaged (not summed) across entries that have one — RPE-like values aren't additive
 * the way tonnage/KPSH are. */
export function aggregateMetrics(
  all: ExerciseMetrics[]
): Omit<ExerciseMetrics, 'relativeIntensity' | 'sessionType' | 'fatiguePerSet'> & {
  relativeIntensity: number
} {
  const tonnage = round2(all.reduce((s, m) => s + m.tonnage, 0))
  const kpsh = all.reduce((s, m) => s + m.kpsh, 0)
  const avgWeight = kpsh > 0 ? round2(tonnage / kpsh) : 0
  const loadCoefficient = round2(all.reduce((s, m) => s + m.loadCoefficient, 0))

  const withFatigue = all.filter((m): m is ExerciseMetrics & { fatigueIndex: number } => m.fatigueIndex != null)
  const fatigueIndex =
    withFatigue.length > 0
      ? round2(withFatigue.reduce((s, m) => s + m.fatigueIndex, 0) / withFatigue.length)
      : null

  // relative intensity of the aggregate is a weighted figure; approximate via
  // loadCoefficient / kpsh (mirrors AF = AK/AJ derived relation in the sheet).
  const relativeIntensity = kpsh > 0 ? round4(loadCoefficient / kpsh) : 0

  return { tonnage, avgWeight, kpsh, loadCoefficient, fatigueIndex, relativeIntensity }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
