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
// squashed into a fake 7-day-a-week schedule.
//
// Templates that number training days instead of dating them ("1", "2", "3"
// alone on their own line) also start a new day — with no real date, but
// still a new workout bucket, so the whole document doesn't collapse into
// one giant "day". Undated buckets fall back to positional 7-per-week
// bucketing (same as when a document has no day headers at all).

// toFailure marks a set that the source document wrote as "до отказа"
// ("max"/"макс"/"отказ", no fixed rep count) rather than a real prescribed
// number — reps then holds a placeholder (see TO_FAILURE_PLACEHOLDER_REPS)
// so the schema's required Int column still has a value, but every UI
// surface must check this flag and show "до отказа" instead of the number.
export type ImportedSet = { weight: number; reps: number; toFailure?: boolean }
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
// A day header that's just a bare number ("1", "2", ... on its own line) —
// common in templates that number training days instead of dating them
// ("День 1", "Тренировка 2"). No real calendar date to attach, but it must
// still start a new workout bucket — without this, a whole multi-day
// document with no dd.mm.yy headers collapses into a single giant "day"
// (every exercise from every numbered day dumped into one workout).
const BARE_DAY_LINE = /^\d{1,3}$/
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

// "до отказа" written as max/максимум/отказ instead of a rep count — see
// ImportedSet.toFailure. Reps then gets this placeholder so the required
// Int column still has a value; every display surface must check the flag
// and show "до отказа" rather than treating it as a literal prescribed
// number.
const MAX_WORD = /max|макс(?:имум)?|отказ[а-я]*/i
export const TO_FAILURE_PLACEHOLDER_REPS = 12

// weight (optional, with optional range/unit) + sets<sep>reps (required — a
// numeric rep count/range, or a "до отказа" word)
const GROUP_RE = new RegExp(
  `(?:(${NUMBER_OR_RANGE.source})\\s*(?:кг|kg)?\\s+)?` + // optional weight
  `(\\d+)\\s*${SET_SEP.source}\\s*(${NUMBER_OR_RANGE.source}|${MAX_WORD.source})`, // sets x reps
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

type Group = { weight: number; sets: number; reps: number; toFailure: boolean }

// Fallback for a line with no "sets×reps" token at all, just a bare
// dash-separated sequence of per-set rep counts — "12-10-8-6-4" (pyramid:
// 5 sets, 12 reps then 10 then 8...), "10-8-6-6". Very common in real
// training logs and otherwise indistinguishable from a stray number, so
// it's only tried once the primary GROUP_RE has found nothing: at least 2
// numbers, each a plausible rep count (1-100).
const BARE_SEQUENCE_RE = /\d{1,3}(?:\s*-\s*\d{1,3}){1,9}/

function extractGroups(line: string): { name: string; groups: Group[] } {
  GROUP_RE.lastIndex = 0
  const groups: Group[] = []
  let firstIndex = -1
  let match: RegExpExecArray | null
  while ((match = GROUP_RE.exec(line))) {
    if (firstIndex === -1) firstIndex = match.index
    const weight = match[1] ? roundToHalf(toAverage(match[1])) : 0
    const repsText = match[3]
    const toFailure = MAX_WORD.test(repsText)
    let sets = Math.round(Number(match[2]))
    let reps = toFailure ? TO_FAILURE_PLACEHOLDER_REPS : Math.round(toAverage(repsText))
    // Some exercises are written rep-count-first, set-count-second — e.g.
    // "Подъем штанги на бицепс 21х4" means 21 reps for 4 sets, not 21
    // sets of 4 (which would be nonsense). If the primary reading has an
    // implausible set count (>20) but swapping the two numbers gives an
    // ordinary sets×reps pair, use the swap instead of discarding the line.
    if (!toFailure && sets > 20 && sets <= 100 && reps > 0 && reps <= 20) {
      const swapped = { sets: reps, reps: sets }
      sets = swapped.sets
      reps = swapped.reps
    }
    if (sets > 0 && sets <= 20 && reps > 0 && reps <= 100 && weight >= 0 && weight <= 2000) {
      groups.push({ weight, sets, reps, toFailure })
    }
  }

  if (!groups.length) {
    const seqMatch = line.match(BARE_SEQUENCE_RE)
    if (seqMatch) {
      const reps = seqMatch[0].split('-').map((part) => Math.round(Number(part.trim())))
      if (reps.length >= 2 && reps.every((r) => r > 0 && r <= 100)) {
        firstIndex = seqMatch.index ?? -1
        for (const r of reps) groups.push({ weight: 0, sets: 1, reps: r, toFailure: false })
      }
    }
  }

  const name = (firstIndex === -1 ? line : line.slice(0, firstIndex))
    .replace(/[,;:\s]+$/, '')
    .trim()
  return { name, groups }
}

// Common gym-program splits, most-preferred first — used only when a
// document has no real dates at all to bucket by (see trainingsPerWeekGuess
// above). Prefers whichever of these evenly divides the total workout
// count (12 -> 3/week for 4 weeks), and otherwise falls back to whichever
// leaves the smallest remainder so only the last week is short.
const COMMON_TRAININGS_PER_WEEK = [3, 4, 5, 6, 2]

function guessTrainingsPerWeek(total: number): number {
  if (total <= 1) return total || 1
  for (const d of COMMON_TRAININGS_PER_WEEK) {
    if (d <= total && total % d === 0) return d
  }
  let best = COMMON_TRAININGS_PER_WEEK[0]
  let bestRemainder = total % best
  for (const d of COMMON_TRAININGS_PER_WEEK.slice(1)) {
    if (d > total) continue
    const remainder = total % d
    if (remainder < bestRemainder) {
      best = d
      bestRemainder = remainder
    }
  }
  return best
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
    if (BARE_DAY_LINE.test(rawLine)) {
      current = { date: null, sourceOrder: days.length, exercises: [] }
      days.push(current)
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
        sets.push({ weight: group.weight, reps: group.reps, ...(group.toFailure ? { toFailure: true } : {}) })
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

  // A document with no date headers at all — just numbered day markers
  // ("1", "2", "3"...) or a single undated paste — has no real calendar to
  // bucket by. Guess a plausible trainings-per-week split from the total
  // count instead of assuming a fixed 7-per-week (which would cram a whole
  // week's worth of training into a few real days): 12 numbered workouts
  // most likely means 3 sessions/week for 4 weeks, not 7 then 5.
  const trainingsPerWeekGuess = firstDate ? null : guessTrainingsPerWeek(sorted.length)

  // Week buckets of 7 real calendar days from the earliest training date —
  // not "7 entries per week" — so a document that skips days (15.06, then
  // 17.06) still lands in the right microcycle instead of an evenly-spaced
  // fake schedule. A bucket with no real date at all (the whole document is
  // undated) instead buckets by the guessed trainings-per-week above.
  // Within a week, day is just the sequential slot (1, 2, 3...) among that
  // week's training days, matching how GymWeekView already labels them
  // ("День 1" / "День 2") regardless of weekday.
  const dayCountByWeek = new Map<number, number>()
  const workouts: ImportedWorkout[] = sorted.map((bucket, index) => {
    let week: number
    if (bucket.date && firstDate) {
      const daysSinceStart = Math.round((bucket.date.getTime() - firstDate.getTime()) / DAY_MS)
      week = Math.floor(daysSinceStart / 7) + 1
    } else if (trainingsPerWeekGuess) {
      week = Math.floor(index / trainingsPerWeekGuess) + 1
    } else {
      // Mixed dated/undated document — an undated bucket among dated ones
      // has no per-week guess to lean on, so it keeps the old positional
      // fallback (7 slots/week) rather than a guess based on the whole
      // document's count, which wouldn't mean much here.
      week = Math.floor(index / 7) + 1
    }
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
