const KYIV_TZ = 'Europe/Kyiv'
const UNLOCK_BEFORE_MS = 10 * 60 * 1000 // 10 minutes
const DAY_MS = 24 * 60 * 60 * 1000

// Converts a wall-clock date+time as if it were observed in `timeZone` into
// the correct UTC instant, accounting for that zone's DST rules on that
// particular date (double-conversion trick: format a guess instant back
// through the zone, then correct by the observed drift). Not exact across
// the ~1hr DST-transition instant itself, which is an acceptable trade-off
// here — this is only ever evaluated at day boundaries, never during one.
function zonedWallTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0))
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(utcGuess)) if (p.type !== 'literal') parts[p.type] = p.value
  const hour = parts.hour === '24' ? 0 : Number(parts.hour)
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  )
  const offset = asIfUtc - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offset)
}

// The calendar date `date` falls on as observed on a Europe/Kyiv wall
// clock, normalized to a UTC-midnight Date so two calls can be diffed with
// plain millisecond subtraction to get a whole day count. Used to make sure
// "which week does Kyiv 'today' belong to" (currentWeekNumber) reads off
// the exact same calendar as "has this week's Kyiv midnight passed"
// (isMicrocycleVisibleToAthlete) — the two used to disagree because
// currentWeekNumber did raw UTC-millisecond math instead of going through
// this timezone conversion.
function kyivCalendarDate(date: Date, timeZone: string = KYIV_TZ): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') parts[p.type] = p.value
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)))
}

// A microcycle's designated calendar date, derived the same way the rest of
// the app shifts scheduled dates when copying weeks (see
// duplicate-last-two-weeks/route.ts): the cycle's own start date plus
// (weekNumber - 1) whole weeks. Only the calendar date matters here — the
// time-of-day component of cycleStartDate is ignored, same as every other
// date shown in the UI (toISOString().slice(0, 10)).
function microcycleStartDateParts(cycleStartDate: Date, weekNumber: number) {
  const shifted = new Date(cycleStartDate.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000)
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() }
}

// Athletes only ever see the current and past weeks of a plan, never a
// future one — with one exception: the coming week unlocks 10 minutes
// before it starts, so there's a chance to check Monday's session the
// night before. For the usual Monday-start week this lands on Sunday
// 23:50 Europe/Kyiv time; any week further out stays locked. Coaches are
// unaffected by this — call sites gate the check on role === 'ATHLETE'
// themselves, coaches always see everything.
export function isMicrocycleVisibleToAthlete(
  cycleStartDate: Date,
  weekNumber: number,
  now: Date = new Date()
): boolean {
  const { y, m, d } = microcycleStartDateParts(cycleStartDate, weekNumber)
  const weekStartUtc = zonedWallTimeToUtc(y, m, d, 0, 0, KYIV_TZ)
  return now.getTime() >= weekStartUtc.getTime() - UNLOCK_BEFORE_MS
}

// Which weekNumber "today" (a Europe/Kyiv wall-clock calendar date) falls
// into, on the same cycleStartDate + (N-1)*7-day grid every other
// week-numbering call site uses (duplicate-last-two-weeks/route.ts,
// isMicrocycleVisibleToAthlete above). Anchored to the same Kyiv calendar
// as isMicrocycleVisibleToAthlete — the cycle page used to compute this
// itself with raw UTC-millisecond math, which rolled over hours late
// relative to Kyiv wall time (a 2-3hr gap depending on DST) and left the
// "Текущий микроцикл" callout pointing at last week for that whole window,
// even after the athlete's own view had already unlocked the new one.
// Can land before week 1 (plan hasn't started yet) or past the last
// microcycle (plan's run its course) — callers check the result actually
// matches an existing microcycle before using it.
export function currentWeekNumber(cycleStartDate: Date, now: Date = new Date()): number {
  const startDay = kyivCalendarDate(cycleStartDate)
  const nowDay = kyivCalendarDate(now)
  const daysDiff = Math.round((nowDay.getTime() - startDay.getTime()) / DAY_MS)
  return Math.floor(daysDiff / 7) + 1
}
