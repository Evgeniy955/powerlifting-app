// Shared overlap check for every level of the Период → Этап → Мезоцикл
// hierarchy. Siblings at the same level (periods for one athlete, stages
// inside one period, mesocycles inside one stage) must each own a distinct
// span of time — otherwise two identically-named siblings with the same
// dates render interleaved and indistinguishable in the periodization
// table (this is exactly what happened with two "Втягивающий" mesocycles,
// and later two identical Periods, both starting the same day).
const DAY_MS = 24 * 60 * 60 * 1000

export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * DAY_MS)
}

// Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd).
export function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

// Convenience wrapper for the Mesocycle case, which stores a week count
// instead of an explicit end date.
export function rangesOverlap(aStart: Date, aWeeks: number, bStart: Date, bWeeks: number): boolean {
  return dateRangesOverlap(aStart, addWeeks(aStart, aWeeks), bStart, addWeeks(bStart, bWeeks))
}
