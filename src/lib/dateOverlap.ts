// Shared helper for the Mesocycle overlap check — a stage's mesocycles must
// each own a distinct span of weeks (this is what actually went wrong when
// a coach ended up with two "Втягивающий" mesocycles both starting the same
// day: the periodization table has no way to tell them apart, so their
// weeks interleave in the timeline). Used by both the create route and the
// move-to-another-stage path of the update route.
const DAY_MS = 24 * 60 * 60 * 1000

export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * DAY_MS)
}

export function rangesOverlap(aStart: Date, aWeeks: number, bStart: Date, bWeeks: number): boolean {
  const aEnd = addWeeks(aStart, aWeeks)
  const bEnd = addWeeks(bStart, bWeeks)
  return aStart < bEnd && bStart < aEnd
}
