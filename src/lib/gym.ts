import { prisma } from '@/lib/prisma'
import { assertGymClientAccessible } from '@/lib/authorization'
import type { SessionUser } from '@/lib/session'

export async function assertGymPlanAccess(planId: string, user: SessionUser) {
  const plan = await prisma.gymPlan.findUnique({ where: { id: planId }, include: { client: true } })
  if (!plan) return null
  await assertGymClientAccessible(plan.clientId, user)
  return plan
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
