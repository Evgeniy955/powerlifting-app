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

// Parent-containment check: does [outerStart, outerEnd) fully contain
// [innerStart, innerEnd)? Siblings not overlapping each other isn't enough —
// a child (Этап inside a Период, or Мезоцикл inside an Этап) also has to
// stay inside its own parent's span. Without this, a child's dates can drift
// past its parent's range and into a *different* sibling's span, which
// silently splits that one child into several disconnected columns in the
// periodization table (it stops being date-adjacent to itself). Deleting
// any one of those columns then deletes the single underlying row and takes
// every other column of it with it — looking like several stages/mesocycles
// vanished when only one was ever selected.
export function rangeContains(outerStart: Date, outerEnd: Date, innerStart: Date, innerEnd: Date): boolean {
  return outerStart <= innerStart && innerEnd <= outerEnd
}
