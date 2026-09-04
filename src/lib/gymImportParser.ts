// Rule-based (non-AI) parser for gym workout plan documents.
//
// Recognises free-form training-log text like:
//   15.06.26
//   - Приседания гантель 6кг 3х15
//   - Жим штанги лежа широким хватом 40 1х5, 45-50 4х6
//   - Подтягивания 10-8-6-6
//
// A line is: <exercise name> <group>[, <group>...], where a group is
//   [<weight>[кг|kg]] <sets>[x|х|×|/]<reps>
// weight/reps may be a dash-range ("45-50", "15-20"), in which case the
// average (rounded to 0.5 / whole reps) is used. Groups without a
// recognisable "sets x reps" token are ignored — the exercise name keeps
// growing until one is found, so plain note lines never turn into exercises.
//
// Date headers (dd.mm.yy / dd.mm.yyyy, optionally split by markdown "**"
// bold markers as pasted from rich text) start a new workout day and are
// parsed into a real calendar date. Day-blocks are then sorted
// chronologically by that date (documents aren't always typed in order) and
// bucketed into weeks of 7 real calendar days starting from the earliest
// training date — so a plan built from a document that skips days (e.g.
// 15.06 then 17.06) keeps its actual training dates instead of being
// squashed into a fake 7-day-a-week schedule. If no date headers are
// present, everything becomes a single week/day with no explicit date.

export type ImportedSet = { weight: number; reps: number }
export type ImportedExercise = { name: string; sets: ImportedSet[]; oneRepMax: number | null }
export type ImportedWorkout = {
  week: number
  day: number
  // The real training date parsed from the document's date header, if any.
  // null when the document had no date headers at all (single-day paste).
  date: Date | null
  weekday: string | null
  exercises: ImportedExercise[]
}
export type ParsedGymPlan = {
  name: string
  weeks: number
  workouts: ImportedWorkout[]
  unmatchedLines: string[]
}

const DATE_LINE = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/
const WEEKDAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

// dd.mm.yy(yy) -> a real UTC date (noon, to stay clear of DST/timezone
// shifts when later formatted as YYYY-MM-DD). Two-digit years are assumed
// 20xx — training logs don't predate that. Returns null for an
// out-of-range day/month (e.g. a stray "32.13.26") so it's treated as
// unparseable rather than silently wrapping into a bogus date.
function parseDateHeader(match: RegExpMatchArray): Date | null {
  const day = Number(match[1])
  const month = Number(match[2])
  let year = Number(match[3])
  if (year < 100) year += 2000
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  // Guards against e.g. "31.02.26" silently rolling over into March.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return null
  }
  return date
}
const BULLET_PREFIX = /^[-*•●▪–—]\s*/
const NUMBER = /\d+(?:[.,]\d+)?/
const NUMBER_OR_RANGE = new RegExp(`${NUMBER.source}(?:\\s*-\\s*${NUMBER.source})*`)
const SET_SEP = /[xхX×\/]/ // latin x, cyrillic х, multiplication sign, slash

// weight (optional, with optional range/unit) + sets<sep>reps (required, with optional reps range)
const GROUP_RE = new RegExp(
  `(?:(${NUMBER_OR_RANGE.source})\\s*(?:кг|kg)?\\s+)?` + // optional weight
  `(\\d+)\\s*${SET_SEP.source}\\s*(${NUMBER_OR_RANGE.source})`, // sets x reps
  'gi',
)

function toAverage(rangeText: string): number {
  const numbers = rangeText
    .split('-')
    .map((part) => Number(part.trim().replace(',', '.')))
    .filter((n) => Number.isFinite(n))
  if (!numbers.length) return 0
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2
}

function stripFormatting(text: string): string {
  return text.replace(/\*\*/g, '').replace(/[_`]/g, '')
}

type Group = { weight: number; sets: number; reps: number }

function extractGroups(line: string): { name: string; groups: Group[] } {
  GROUP_RE.lastIndex = 0
  const groups: Group[] = []
  let firstIndex = -1
  let match: RegExpExecArray | null
  while ((match = GROUP_RE.exec(line))) {
    if (firstIndex === -1) firstIndex = match.index
    const weight = match[1] ? roundToHalf(toAverage(match[1])) : 0
    const sets = Math.round(Number(match[2]))
    const reps = Math.round(toAverage(match[3]))
    if (sets > 0 && sets <= 20 && reps > 0 && reps <= 100 && weight >= 0 && weight <= 2000) {
      groups.push({ weight, sets, reps })
    }
  }
  const name = (firstIndex === -1 ? line : line.slice(0, firstIndex))
    .replace(/[,;:\s]+$/, '')
    .trim()
  return { name, groups }
}

export function parseGymPlanText(rawText: string, planName?: string): ParsedGymPlan {
  const text = stripFormatting(rawText)
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  type DayBucket = { date: Date | null; sourceOrder: number; exercises: ImportedExercise[] }
  const days: DayBucket[] = []
  let current: DayBucket | null = null
  const unmatchedLines: string[] = []
  let firstDateLabel: string | null = null

  for (const rawLine of lines) {
    const dateMatch = rawLine.match(DATE_LINE)
    if (dateMatch) {
      current = { date: parseDateHeader(dateMatch), sourceOrder: days.length, exercises: [] }
      days.push(current)
      if (!firstDateLabel) firstDateLabel = rawLine
      continue
    }

    const line = rawLine.replace(BULLET_PREFIX, '').trim()
    if (!line) continue
    if (/^суперсет:?$/i.test(line)) continue // grouping note only, not an exercise

    const { name, groups } = extractGroups(line)
    if (!groups.length || !name) {
      unmatchedLines.push(rawLine)
      continue
    }

    if (!current) {
      current = { date: null, sourceOrder: days.length, exercises: [] }
      days.push(current)
    }

    const sets: ImportedSet[] = []
    for (const group of groups) {
      for (let i = 0; i < group.sets; i += 1) {
        sets.push({ weight: group.weight, reps: group.reps })
      }
    }
    current.exercises.push({ name: name.slice(0, 160), sets, oneRepMax: null })
  }

  const nonEmptyDays = days.filter((bucket) => bucket.exercises.length > 0)

  // Sort chronologically by the actual training date read from the
  // document — trainers don't always type dates strictly in order, and
  // week/day numbering below depends on real date order, not paste order.
  // Undated buckets (no date header found at all) keep the document's
  // original order and sort after every dated one.
  const sorted = [...nonEmptyDays].sort((a, b) => {
    if (a.date && b.date) return a.date.getTime() - b.date.getTime()
    if (a.date) return -1
    if (b.date) return 1
    return a.sourceOrder - b.sourceOrder
  })

  const firstDate = sorted.find((bucket) => bucket.date)?.date ?? null
  const DAY_MS = 24 * 60 * 60 * 1000

  // Week buckets of 7 real calendar days from the earliest training date —
  // not "7 entries per week" — so a document that skips days (15.06, then
  // 17.06) still lands in the right microcycle instead of an evenly-spaced
  // fake schedule. Within a week, day is just the sequential slot (1, 2,
  // 3...) among that week's training days, matching how GymWeekView already
  // labels them ("День 1" / "День 2") regardless of weekday.
  const dayCountByWeek = new Map<number, number>()
  const workouts: ImportedWorkout[] = sorted.map((bucket) => {
    const week = bucket.date && firstDate
      ? Math.floor((bucket.date.getTime() - firstDate.getTime()) / (7 * DAY_MS)) + 1
      : 1
    const day = (dayCountByWeek.get(week) ?? 0) + 1
    dayCountByWeek.set(week, day)
    return {
      week,
      day,
      date: bucket.date,
      weekday: bucket.date ? WEEKDAY_NAMES[bucket.date.getUTCDay()] : null,
      exercises: bucket.exercises,
    }
  })

  const weeks = workouts.reduce((max, workout) => Math.max(max, workout.week), 1)
  const name = planName?.trim() || (firstDateLabel ? `План с ${firstDateLabel}` : 'Импортированный план')

  return { name: name.slice(0, 120), weeks, workouts, unmatchedLines }
}
