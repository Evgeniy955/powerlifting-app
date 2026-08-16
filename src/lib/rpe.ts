// RPE ("ИУ" — Индекс усталости) engine, replacing the old Excel-derived fatigue
// coefficient curve entirely, per the coach's chart and spec.

export type RpePoint = { reps: number; rpe: number; percent1rm: number }

/**
 * Reverse-looks-up the RPE chart: given reps performed and the actual %1RM used,
 * estimates the "ИУ" (RPE, 1-10) value.
 *
 * Within a reps-column, %1RM increases monotonically with RPE, so we interpolate
 * linearly between the two bracketing table points (or extrapolate off the end
 * points, clamped to 1-10). If the exact rep count isn't tabulated, we first
 * estimate RPE against the nearest lower and upper rep columns that do have data,
 * then blend the two proportionally to how close `reps` is to each.
 */
export function estimateRpe(reps: number, percent1rm: number, table: RpePoint[]): number | null {
  if (table.length === 0) return null

  const repsAvailable = Array.from(new Set(table.map((p) => p.reps))).sort((a, b) => a - b)
  if (repsAvailable.includes(reps)) {
    return estimateRpeForRepsColumn(reps, percent1rm, table)
  }

  const lower = [...repsAvailable].reverse().find((r) => r < reps)
  const upper = repsAvailable.find((r) => r > reps)

  if (lower == null && upper == null) return null
  if (lower == null) return estimateRpeForRepsColumn(upper as number, percent1rm, table)
  if (upper == null) return estimateRpeForRepsColumn(lower, percent1rm, table)

  const rpeLower = estimateRpeForRepsColumn(lower, percent1rm, table)
  const rpeUpper = estimateRpeForRepsColumn(upper, percent1rm, table)
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
 * - Fatigue then accumulates by +0.25 *per set*, not just once for the block:
 *   e.g. 8 / 8.25 / 8.5 / 8.75 / 9 across 5 qualifying sets. Two independent
 *   triggers add this accumulation, and a set close to both takes whichever is
 *   larger (no double-stacking):
 *     (a) heavy sessions — every set at >=85%, counted in the order it appears
 *         (the 1st such set has +0, the 2nd +0.25, the 3rd +0.5, ...);
 *     (b) any run of >=4 consecutive sets at an identical weight that is
 *         itself >=80% — every set within that run accumulates the same way,
 *         by its position in the run (1st +0, 2nd +0.25, 3rd +0.5, ...).
 * - The block's aggregate index (shown under the exercise) is the average of
 *   the resulting per-set values among sets that clear the counting threshold —
 *   75% for heavy/regular sessions, 60% for light sessions. This is meant to
 *   capture actual "рабочие подходы" (working sets at/near the target weight),
 *   not ramp-up sets on the way there.
 * - Light sessions cap at 7.5; heavy/regular sessions cap at 10 (the scale's
 *   natural ceiling). The cap applies per-set too, not just to the aggregate.
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
  const cap = sessionType === 'light' ? 7.5 : 10

  const base = sets.map((s) => estimateRpe(s.reps, pct(s.weight), table))

  // Trigger (a): sequential position among >=85% sets in a heavy session.
  const bonusHeavy = new Array(sets.length).fill(0)
  if (sessionType === 'heavy') {
    let count = 0
    for (let i = 0; i < sets.length; i++) {
      if (pct(sets[i].weight) >= 0.85) {
        bonusHeavy[i] = 0.25 * count
        count++
      }
    }
  }

  // Trigger (b): position within a >=4-set run at an identical weight >=80%.
  const bonusSameWeight = new Array(sets.length).fill(0)
  let i = 0
  while (i < sets.length) {
    let j = i
    while (j + 1 < sets.length && sets[j + 1].weight === sets[i].weight) j++
    const runLength = j - i + 1
    if (pct(sets[i].weight) >= 0.8 && runLength >= 4) {
      for (let k = i; k <= j; k++) bonusSameWeight[k] = 0.25 * (k - i)
    }
    i = j + 1
  }

  const perSet = sets.map((s, idx) => {
    const b = base[idx]
    if (b == null) return null
    const bonus = Math.max(bonusHeavy[idx], bonusSameWeight[idx])
    return Math.min(round2(b + bonus), cap)
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
