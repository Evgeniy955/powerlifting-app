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
// bold markers as pasted from rich text) start a new workout day. Days are
// distributed 7 per week (day 1..7, then week 2 day 1..7, ...). If no date
// headers are present, everything becomes a single week/day.

export type ImportedSet = { weight: number; reps: number }
export type ImportedExercise = { name: string; sets: ImportedSet[]; oneRepMax: number | null }
export type ImportedWorkout = { week: number; day: number; exercises: ImportedExercise[] }
export type ParsedGymPlan = {
  name: string
  weeks: number
  workouts: ImportedWorkout[]
  unmatchedLines: string[]
}

const DATE_LINE = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/
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

  type DayBucket = { exercises: ImportedExercise[] }
  const days: DayBucket[] = []
  let current: DayBucket | null = null
  const unmatchedLines: string[] = []
  let firstDateLabel: string | null = null

  for (const rawLine of lines) {
    const dateMatch = rawLine.match(DATE_LINE)
    if (dateMatch) {
      current = { exercises: [] }
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
      current = { exercises: [] }
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

  const workouts: ImportedWorkout[] = days
    .map((bucket, index) => ({
      week: Math.floor(index / 7) + 1,
      day: (index % 7) + 1,
      exercises: bucket.exercises,
    }))
    .filter((workout) => workout.exercises.length > 0)

  const weeks = workouts.reduce((max, workout) => Math.max(max, workout.week), 1)
  const name = planName?.trim() || (firstDateLabel ? `План с ${firstDateLabel}` : 'Импортированный план')

  return { name: name.slice(0, 120), weeks, workouts, unmatchedLines }
}
