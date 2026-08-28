// RPE ("ИУ" — Индекс усталости) engine, replacing the old Excel-derived fatigue
// coefficient curve entirely, per the coach's chart and spec.

export type RpePoint = { reps: number; rpe: number; percent1rm: number }

/**
 * Reverse-looks-up the RPE chart: given reps performed and the actual %1RM used,
 * estimates the "ИУ" (RPE, 1-10) value.
 *
 * Within a reps-column, %1RM increases monotonically with RPE, so we interpolate
 * linearly between the two bracketing table points (or extrapolate off the end
 * points, clamped to 1-10). The chart and UI both use whole %1RM values, so
 * the input is rounded to that same precision before the lookup. If the exact
 * rep count isn't tabulated, we first
 * estimate RPE against the nearest lower and upper rep columns that do have data,
 * then blend the two proportionally to how close `reps` is to each.
 */
export function estimateRpe(reps: number, percent1rm: number, table: RpePoint[]): number | null {
  if (table.length === 0) return null

  // A set such as 210 kg at a 1RM that produces 86.6% is displayed as 87%.
  // Looking it up as 86.6% made the displayed percentage and its ИУ disagree
  // (8.8 instead of the chart's exact 9 for 3 reps at 87%).
  const chartPercent1rm = Math.round(percent1rm * 100) / 100

  const repsAvailable = Array.from(new Set(table.map((p) => p.reps))).sort((a, b) => a - b)
  if (repsAvailable.includes(reps)) {
    return estimateRpeForRepsColumn(reps, chartPercent1rm, table)
  }

  const lower = [...repsAvailable].reverse().find((r) => r < reps)
  const upper = repsAvailable.find((r) => r > reps)

  if (lower == null && upper == null) return null
  if (lower == null) return estimateRpeForRepsColumn(upper as number, chartPercent1rm, table)
  if (upper == null) return estimateRpeForRepsColumn(lower, chartPercent1rm, table)

  const rpeLower = estimateRpeForRepsColumn(lower, chartPercent1rm, table)
  const rpeUpper = estimateRpeForRepsColumn(upper, chartPercent1rm, table)
  if (rpeLower == null || rpeUpper == null) return rpeLower ?? rpeUpper

  const t = (reps - lower) / (upper - lower)
  return round2(rpeLower + (rpeUpper - rpeLower) * t)
}

function estimateRpeForRepsColumn(reps: number, percent1rm: number, table: RpePoint[]): number | null {
  const column = table.filter((p) => p.reps === reps).sort((a, b) => a.rpe - b.rpe)
  if (column.length === 0) return null
  if (column.length === 1) return column[0].rpe

  if (percent1rm <= column[0].percent1rm) {
    const [a, b] = column
    return clampRpe(extrapolate(a, b, percent1rm))
  }
  const last = column[column.length - 1]
  if (percent1rm >= last.percent1rm) {
    const a = column[column.length - 2]
    const b = last
    return clampRpe(extrapolate(a, b, percent1rm))
  }

  for (let i = 0; i < column.length - 1; i++) {
    const a = column[i]
    const b = column[i + 1]
    if (percent1rm >= a.percent1rm && percent1rm <= b.percent1rm) {
      const t = (percent1rm - a.percent1rm) / (b.percent1rm - a.percent1rm)
      return round2(a.rpe + (b.rpe - a.rpe) * t)
    }
  }
  return null
}

function extrapolate(a: RpePoint, b: RpePoint, percent1rm: number): number {
  const slope = (b.rpe - a.rpe) / (b.percent1rm - a.percent1rm)
  return a.rpe + slope * (percent1rm - a.percent1rm)
}

function clampRpe(v: number): number {
  return round2(Math.max(1, Math.min(10, v)))
}

export type BlockFatigueResult = {
  perSet: (number | null)[] // same order/length as the input sets
  aggregate: number | null // the value shown under the exercise block
  sessionType: 'heavy' | 'light' | null
}

/**
 * Per-set "Индекс усталости" (ИУ) for one exercise block, per the coach's spec:
 *
 * - Session type is auto-detected from the heaviest set in the block: >=80% 1RM
 *   is a heavy/regular session, otherwise light.
 * - Each set's own base ИУ comes from the RPE chart (its own reps + %1RM).
 * - Fatigue accumulates by +0.25 per set only in either of these cases:
 *     (a) all sets at >=85% 1RM, counted in their order; or
 *     (b) consecutive identical sets (same weight and reps), counted within
 *         that run. The first set has +0, the second +0.25, and so on.
 *   If both rules apply, only the larger one is used — the bonus is not
 *   double-counted.
 * - The block's aggregate index (shown under the exercise) is the average of
 *   the resulting per-set values among sets that clear the counting threshold —
 *   75% for heavy/regular sessions, 60% for light sessions. This is meant to
 *   capture actual "рабочие подходы" (working sets at/near the target weight),
 *   not ramp-up sets on the way there.
 * - Both light and heavy sessions use the full 1-10 scale from the RPE chart.
 *   The cap applies per-set too, not just to the aggregate.
 */
export function computeBlockFatigue(
  sets: { weight: number; reps: number }[],
  oneRepMax: number,
  table: RpePoint[]
): BlockFatigueResult {
  if (oneRepMax <= 0 || sets.length === 0) {
    return { perSet: sets.map(() => null), aggregate: null, sessionType: null }
  }

  const pct = (w: number) => w / oneRepMax
  const maxPct = Math.max(...sets.map((s) => pct(s.weight)))
  const sessionType: 'heavy' | 'light' = maxPct >= 0.8 ? 'heavy' : 'light'
  const threshold = sessionType === 'heavy' ? 0.75 : 0.6
  const cap = 10

  const base = sets.map((s) => estimateRpe(s.reps, pct(s.weight), table))

  // Sets at 85%+ accumulate fatigue in the order they occur, regardless of
  // whether their weights/reps are the same.
  const bonusHeavy = new Array(sets.length).fill(0)
  let heavySetCount = 0
  for (let i = 0; i < sets.length; i++) {
    if (pct(sets[i].weight) >= 0.85) {
      bonusHeavy[i] = 0.25 * heavySetCount
      heavySetCount++
    }
  }

  // Any repeated, consecutive weight+rep prescription is the same approach.
  // It accumulates independently of intensity, starting from the second set.
  const bonusSameSet = new Array(sets.length).fill(0)
  let i = 0
  while (i < sets.length) {
    let j = i
    while (
      j + 1 < sets.length &&
      sets[j + 1].weight === sets[i].weight &&
      sets[j + 1].reps === sets[i].reps
    ) {
      j++
    }
    if (j > i) {
      for (let k = i; k <= j; k++) bonusSameSet[k] = 0.25 * (k - i)
    }
    i = j + 1
  }

  const perSet = base.map((value, idx) => {
    if (value == null) return null
    return Math.min(round2(value + Math.max(bonusHeavy[idx], bonusSameSet[idx])), cap)
  })

  const qualifyingValues = sets
    .map((s, idx) => (pct(s.weight) >= threshold ? perSet[idx] : null))
    .filter((v): v is number => v != null)

  // Aggregate = average across working sets only (sets below the counting
  // threshold — warmups, ramp-up work under 60/75% — don't count).
  const aggregate =
    qualifyingValues.length > 0
      ? round2(qualifyingValues.reduce((sum, v) => sum + v, 0) / qualifyingValues.length)
      : null

  return { perSet, aggregate, sessionType }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
