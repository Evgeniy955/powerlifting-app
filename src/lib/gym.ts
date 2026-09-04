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

export async function getGymWeekForDisplay(weekId: string) {
  return prisma.gymWeek.findUnique({
    where: { id: weekId },
    include: {
      plan: { include: { client: true } },
      workouts: { orderBy: { dayNumber: 'asc' }, include: { entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } } },
    },
  })
}

export async function getGymWorkoutForDisplay(workoutId: string) {
  return prisma.gymWorkout.findUnique({
    where: { id: workoutId },
    include: { week: { include: { plan: { include: { client: true } } } }, entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } },
  })
}
