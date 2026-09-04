import { prisma } from '@/lib/prisma'
import { assertGymClientAccessible } from '@/lib/authorization'
import type { SessionUser } from '@/lib/session'

/**
 * Conservative Epley estimate used only to initialise a client's 1RM when
 * an exercise is first added. Coaches can always replace it with a measured
 * value in the workout editor.
 */
export function estimateGymOneRepMax(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null
  const estimate = weight * (1 + Math.min(reps, 30) / 30)
  return Math.round(estimate * 2) / 2
}

export async function assertGymPlanAccess(planId: string, user: SessionUser) {
  const plan = await prisma.gymPlan.findUnique({ where: { id: planId }, include: { client: true } })
  if (!plan) return null
  await assertGymClientAccessible(plan.clientId, user)
  return plan
}

// "15.06.2026" or "15.06.2026 – 21.06.2026" — the calendar span a
// microcycle's ("Неделя") training days actually fall on, shown next to
// the week number wherever it's listed (plan page's week grid, week page
// heading) since week numbering alone doesn't say which real dates it is.
export function formatGymWeekDateRange(workouts: { scheduledDate: Date }[]): string | null {
  if (!workouts.length) return null
  const dates = workouts.map((w) => w.scheduledDate.toISOString().slice(0, 10)).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  return first === last ? first : `${first} – ${last}`
}

export type AdjacentGymWeek = { id: string; weekNumber: number }
export type AdjacentGymDay = { id: string; dayNumber: number }

export async function getGymWeekForDisplay(weekId: string) {
  const week = await prisma.gymWeek.findUnique({
    where: { id: weekId },
    include: {
      plan: { include: { client: true } },
      workouts: { orderBy: { dayNumber: 'asc' }, include: { entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } } },
    },
  })
  if (!week) return null

  // Sibling weeks in the same plan, for prev/next navigation on the week
  // page — ordered by weekNumber (not creation order), same reasoning as
  // the powerlifting side's prevWeek/nextWeek (getMicrocycleForDisplay):
  // stays correct even if weeks were created out of order.
  const siblingWeeks: AdjacentGymWeek[] = await prisma.gymWeek.findMany({
    where: { planId: week.planId },
    orderBy: { weekNumber: 'asc' },
    select: { id: true, weekNumber: true },
  })
  const currentIndex = siblingWeeks.findIndex((w) => w.id === week.id)
  const prevWeek = currentIndex > 0 ? siblingWeeks[currentIndex - 1] : null
  const nextWeek = currentIndex >= 0 && currentIndex < siblingWeeks.length - 1 ? siblingWeeks[currentIndex + 1] : null

  return { ...week, prevWeek, nextWeek }
}

export async function getGymWorkoutForDisplay(workoutId: string) {
  const workout = await prisma.gymWorkout.findUnique({
    where: { id: workoutId },
    include: { week: { include: { plan: { include: { client: true } } } }, entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } },
  })
  if (!workout) return null

  // Sibling days in the same week, for prev/next navigation on the workout
  // page — same idea as getWorkoutForDisplay's siblingDays on the
  // powerlifting side, scoped to this microcycle only (not the whole plan).
  const siblingDays: AdjacentGymDay[] = await prisma.gymWorkout.findMany({
    where: { weekId: workout.weekId },
    orderBy: { dayNumber: 'asc' },
    select: { id: true, dayNumber: true },
  })
  const currentIndex = siblingDays.findIndex((w) => w.id === workout.id)
  const prevDay = currentIndex > 0 ? siblingDays[currentIndex - 1] : null
  const nextDay = currentIndex >= 0 && currentIndex < siblingDays.length - 1 ? siblingDays[currentIndex + 1] : null

  return { ...workout, prevDay, nextDay }
}
