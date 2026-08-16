import { prisma } from './prisma'
import { ForbiddenError, NotFoundError, type SessionUser } from './session'

function ownsAthlete(athlete: { coachId: string | null; userId: string | null }, user: SessionUser) {
  return user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
}

export async function assertAthleteBelongsToCoach(athleteId: string, coachId: string) {
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new NotFoundError('Атлет не найден')
  if (athlete.coachId !== coachId) throw new ForbiddenError('Атлет не привязан к этому тренеру')
  return athlete
}

// Walks workoutId -> microcycle -> cycle -> athlete and checks ownership. Returns
// the resolved chain so callers (e.g. the change-notification queue) can reuse it
// instead of re-querying.
export async function assertCanAccessWorkout(workoutId: string, user: SessionUser) {
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    include: { microcycle: { include: { cycle: { include: { athlete: true } } } } },
  })
  if (!workout) throw new NotFoundError('Тренировка не найдена')
  const athlete = workout.microcycle.cycle.athlete
  if (!ownsAthlete(athlete, user)) throw new ForbiddenError('Нет доступа к этой тренировке')
  return { workout, microcycle: workout.microcycle, cycle: workout.microcycle.cycle, athlete }
}

export async function assertCanAccessExerciseEntry(entryId: string, user: SessionUser) {
  const entry = await prisma.exerciseEntry.findUnique({
    where: { id: entryId },
    include: {
      exercise: true,
      workout: { include: { microcycle: { include: { cycle: { include: { athlete: true } } } } } },
    },
  })
  if (!entry) throw new NotFoundError('Упражнение не найдено')
  const { workout } = entry
  const athlete = workout.microcycle.cycle.athlete
  if (!ownsAthlete(athlete, user)) throw new ForbiddenError('Нет доступа к этому упражнению')
  return { entry, workout, microcycle: workout.microcycle, cycle: workout.microcycle.cycle, athlete }
}

export async function assertCanAccessSet(setId: string, user: SessionUser) {
  const set = await prisma.setEntry.findUnique({
    where: { id: setId },
    include: {
      exerciseEntry: {
        include: {
          exercise: true,
          workout: { include: { microcycle: { include: { cycle: { include: { athlete: true } } } } } },
        },
      },
    },
  })
  if (!set) throw new NotFoundError('Подход не найден')
  const { exerciseEntry } = set
  const { workout } = exerciseEntry
  const athlete = workout.microcycle.cycle.athlete
  if (!ownsAthlete(athlete, user)) throw new ForbiddenError('Нет доступа к этому подходу')
  return {
    set,
    exerciseEntry,
    workout,
    microcycle: workout.microcycle,
    cycle: workout.microcycle.cycle,
    athlete,
  }
}
