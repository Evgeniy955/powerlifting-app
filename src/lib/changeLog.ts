import { prisma } from './prisma'

export type ChangeLogKind = 'set-updated' | 'set-removed' | 'exercise-added' | 'exercise-removed'

type RecordChangeInput = {
  athleteId: string
  cycleId: string
  workoutId: string
  workoutDate: Date
  weekNumber: number
  dayNumber: number
  exerciseEntryId: string
  exerciseName: string
  kind: ChangeLogKind
  setEntryId?: string
  setNumber?: number
  field?: 'weight' | 'reps'
  before?: number | null
  after?: number | null
  actorId: string
  actorRole: string
}

// Persists one row per meaningful athlete-made edit — durable counterpart to
// the fire-and-forget email digest in lib/email.ts (queueChangeNotification).
// Read by the coach's "История" screen and by the workout view, which uses
// `seenByCoach` to highlight whatever changed since the coach last looked.
//
// Same call-site pattern as queueChangeNotification: called right alongside
// it, only when the actor is the ATHLETE and has a coach to show this to.
// Never throws — a logging failure must never fail the athlete's actual save.
export async function recordChangeLog(input: RecordChangeInput) {
  try {
    await prisma.changeLog.create({
      data: {
        athleteId: input.athleteId,
        cycleId: input.cycleId,
        workoutId: input.workoutId,
        workoutDate: input.workoutDate,
        weekNumber: input.weekNumber,
        dayNumber: input.dayNumber,
        exerciseEntryId: input.exerciseEntryId,
        exerciseName: input.exerciseName,
        kind: input.kind,
        setEntryId: input.setEntryId ?? null,
        setNumber: input.setNumber ?? null,
        field: input.field ?? null,
        beforeValue: input.before ?? null,
        afterValue: input.after ?? null,
        actorId: input.actorId,
        actorRole: input.actorRole,
      },
    })
  } catch (err) {
    console.error('recordChangeLog failed', err)
  }
}

// Shape returned by prisma.changeLog.findMany — kept minimal (just the
// fields describeChangeLog actually reads) so callers can pass either a
// full Prisma row or a plain object without importing the generated type.
export type ChangeLogEntry = {
  kind: string
  exerciseName: string
  setNumber: number | null
  field: string | null
  beforeValue: number | null
  afterValue: number | null
}

function fieldLabel(field: string | null): string {
  return field === 'weight' ? 'вес' : field === 'reps' ? 'повторы' : (field ?? '')
}

function fmtValue(field: string | null, value: number | null): string {
  if (value === null) return '—'
  return field === 'weight' ? `${value} кг` : String(value)
}

// One-line human-readable description of a change, e.g. "Присед, подход 2:
// вес 100 кг → 105 кг" — shared by the История screen and (kept identical in
// spirit to) the email digest's describeEvent in lib/email.ts.
export function describeChangeLog(entry: ChangeLogEntry): string {
  switch (entry.kind) {
    case 'exercise-added':
      return `+ Добавлено упражнение: ${entry.exerciseName}`
    case 'exercise-removed':
      return `− Удалено упражнение из плана: ${entry.exerciseName}`
    case 'set-removed':
      return `− Удалён подход ${entry.setNumber} (${entry.exerciseName})`
    case 'set-updated':
      return (
        `${entry.exerciseName} · подход ${entry.setNumber}: ${fieldLabel(entry.field)} ` +
        `${fmtValue(entry.field, entry.beforeValue)} → ${fmtValue(entry.field, entry.afterValue)}`
      )
    default:
      return entry.exerciseName
  }
}
