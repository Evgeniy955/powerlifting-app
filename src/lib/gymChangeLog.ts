import { prisma } from './prisma'

// Gym-side counterpart to lib/changeLog.ts — same shape, one narrower kind
// set: a gym client can only ever change a set's weight/reps/toFailure or
// remove a set (see GymWorkoutEditor's canEdit vs canManageExercises split),
// never add/remove/replace an exercise, so there's no "exercise-added"/
// "exercise-removed" kind here at all.
export type GymChangeLogKind = 'set-updated' | 'set-removed'

type RecordChangeInput = {
  clientId: string
  planId: string
  workoutId: string
  workoutDate: Date
  weekNumber: number
  dayNumber: number
  exerciseEntryId: string
  exerciseName: string
  kind: GymChangeLogKind
  setEntryId?: string
  setNumber?: number
  field?: 'weight' | 'reps'
  before?: number | null
  after?: number | null
  actorId: string
  actorRole: string
}

// Persists one row per meaningful client-made edit — durable counterpart to
// the fire-and-forget email digest in lib/email.ts (queueChangeNotification,
// reused as-is for gym: it only ever treats athleteId as an opaque grouping
// key, so a GymClient id works exactly the same as an AthleteProfile id).
// Read by the plan's "История" screen and the workout view's unseen-change
// dot, via seenByCoach. Never throws — a logging failure must never fail
// the client's actual save.
export async function recordGymChangeLog(input: RecordChangeInput) {
  try {
    await prisma.gymChangeLog.create({
      data: {
        clientId: input.clientId,
        planId: input.planId,
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
    console.error('recordGymChangeLog failed', err)
  }
}

// Shape returned by prisma.gymChangeLog.findMany — kept minimal (just the
// fields describeGymChangeLog actually reads), same reasoning as
// changeLog.ts's ChangeLogEntry.
export type GymChangeLogEntry = {
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
// вес 100 кг → 105 кг" — same wording as changeLog.ts's describeChangeLog.
export function describeGymChangeLog(entry: GymChangeLogEntry): string {
  switch (entry.kind) {
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
