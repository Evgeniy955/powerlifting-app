import { prisma } from './prisma'
import { ForbiddenError, NotFoundError, type SessionUser } from './session'

// Defense in depth alongside auth/callback/route.ts's invite-token check:
// even if some future code path ever set userId without also flipping
// inviteStatus to 'ACCEPTED' (the callback only does both together), an
// athlete/client who hasn't actually accepted their invite should still be
// treated as having no access of their own — coaches are unaffected, this
// only narrows the non-coach branch.
function ownsAthlete(
  athlete: { coachId: string | null; userId: string | null; inviteStatus: string },
  user: SessionUser
) {
  return user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id && athlete.inviteStatus === 'ACCEPTED'
}

export async function assertAthleteBelongsToCoach(athleteId: string, coachId: string) {
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new NotFoundError('Атлет не найден')
  if (athlete.coachId !== coachId) throw new ForbiddenError('Атлет не привязан к этому тренеру')
  return athlete
}

// Same coach-or-self ownership check as ownsAthlete(), but as a standalone
// assertion that resolves the AthleteProfile itself — for routes/pages keyed
// directly by athleteId (e.g. Спортпит) rather than by some nested id that
// needs walking up to an athlete first, like the assertCanAccess* helpers
// below.
export async function assertAthleteAccessible(athleteId: string, user: SessionUser) {
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new NotFoundError('Атлет не найден')
  if (!ownsAthlete(athlete, user)) throw new ForbiddenError('Нет доступа к этому атлету')
  return athlete
}

// Same reasoning as ownsAthlete above.
function ownsGymClient(
  client: { coachId: string | null; userId: string | null; inviteStatus: string },
  user: SessionUser
) {
  return user.role === 'COACH' ? client.coachId === user.id : client.userId === user.id && client.inviteStatus === 'ACCEPTED'
}

export async function assertGymClientBelongsToCoach(clientId: string, coachId: string) {
  const client = await prisma.gymClient.findUnique({ where: { id: clientId } })
  if (!client) throw new NotFoundError('Клиент не найден')
  if (client.coachId !== coachId) throw new ForbiddenError('Клиент не привязан к этому тренеру')
  return client
}

export async function assertGymClientAccessible(clientId: string, user: SessionUser) {
  const client = await prisma.gymClient.findUnique({ where: { id: clientId } })
  if (!client) throw new NotFoundError('Клиент не найден')
  if (!ownsGymClient(client, user)) throw new ForbiddenError('Нет доступа к этому клиенту')
  return client
}

// Walks gymSetEntry -> entry -> workout -> week -> plan -> client and checks
// ownership (coach-of-client or the client themselves) — same coach-or-self
// shape as assertCanAccessSet on the powerlifting side, letting a gym client
// edit their own sets (weight/reps/toFailure) directly, not just their coach.
export async function assertGymCanAccessSet(setId: string, user: SessionUser) {
  const set = await prisma.gymSetEntry.findUnique({
    where: { id: setId },
    include: { entry: { include: { workout: { include: { week: { include: { plan: { include: { client: true } } } } } } } } },
  })
  if (!set) throw new NotFoundError('Подход не найден')
  const client = set.entry.workout.week.plan.client
  if (!ownsGymClient(client, user)) throw new ForbiddenError('Нет доступа к этому подходу')
  return set
}

// Same coach-or-self ownership check, scoped to a GymExerciseEntry — used by
// the "add a set" endpoint (a set-level action, unlike editing the entry's
// exercise/ПМ, which stays coach-only).
export async function assertGymCanAccessEntry(entryId: string, user: SessionUser) {
  const entry = await prisma.gymExerciseEntry.findUnique({
    where: { id: entryId },
    include: { workout: { include: { week: { include: { plan: { include: { client: true } } } } } } },
  })
  if (!entry) throw new NotFoundError('Упражнение не найдено')
  const client = entry.workout.week.plan.client
  if (!ownsGymClient(client, user)) throw new ForbiddenError('Нет доступа к этому упражнению')
  return entry
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

export async function assertCanAccessSupplement(supplementId: string, user: SessionUser) {
  const supplement = await prisma.supplement.findUnique({
    where: { id: supplementId },
    include: { athlete: true },
  })
  if (!supplement) throw new NotFoundError('Запись не найдена')
  if (!ownsAthlete(supplement.athlete, user)) throw new ForbiddenError('Нет доступа к этой записи')
  return supplement
}

export async function assertCanAccessCompetition(competitionId: string, user: SessionUser) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { athlete: true },
  })
  if (!competition) throw new NotFoundError('Запись не найдена')
  if (!ownsAthlete(competition.athlete, user)) throw new ForbiddenError('Нет доступа к этой записи')
  return competition
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
