import { prisma } from '@/lib/prisma'
import { assertAthleteAccessible } from '@/lib/authorization'
import type { SessionUser } from '@/lib/session'

export async function assertGymPlanAccess(planId: string, user: SessionUser) {
  const plan = await prisma.gymPlan.findUnique({ where: { id: planId }, include: { athlete: true } })
  if (!plan) return null
  await assertAthleteAccessible(plan.athleteId, user)
  return plan
}

export async function getGymWeekForDisplay(weekId: string) {
  return prisma.gymWeek.findUnique({
    where: { id: weekId },
    include: {
      plan: { include: { athlete: true } },
      workouts: { orderBy: { dayNumber: 'asc' }, include: { entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } } },
    },
  })
}

export async function getGymWorkoutForDisplay(workoutId: string) {
  return prisma.gymWorkout.findUnique({
    where: { id: workoutId },
    include: { week: { include: { plan: { include: { athlete: true } } } }, entries: { orderBy: { orderIndex: 'asc' }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } } },
  })
}
