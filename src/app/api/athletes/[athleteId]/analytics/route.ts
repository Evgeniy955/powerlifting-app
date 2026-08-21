import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { getWeeklyLoadDistribution, getExerciseProgress } from '@/lib/analytics'
import { getRpeTable } from '@/lib/workout'

// Coach-only — same reasoning as athletes/[athleteId]/analytics/page.tsx.
async function assertCanView(athleteId: string, userId: string, role: string) {
  const athlete = await prisma.athleteProfile.findUnique({ where: { id: athleteId } })
  if (!athlete) throw new Error('Атлет не найден')
  if (role !== 'COACH' || athlete.coachId !== userId) throw new Error('Нет доступа')
}

// GET /api/athletes/:athleteId/analytics?exerciseId=... 
// Returns weekly load distribution (all cycles) + progress series for the given exercise
// (defaults to the athlete's most-tracked 1RM exercise if exerciseId is omitted).
export async function GET(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const user = await requireUser()
    await assertCanView(params.athleteId, user.id, user.role)

    const rpeTable = await getRpeTable()
    const weeklyLoad = await getWeeklyLoadDistribution(params.athleteId, rpeTable)

    let exerciseId = req.nextUrl.searchParams.get('exerciseId')
    if (!exerciseId) {
      const mostRecent1RM = await prisma.athlete1RM.findFirst({
        where: { athleteId: params.athleteId },
        orderBy: { updatedAt: 'desc' },
      })
      exerciseId = mostRecent1RM?.exerciseId ?? null
    }

    const progress = exerciseId ? await getExerciseProgress(params.athleteId, exerciseId) : []

    const trackedExercises = await prisma.athlete1RM.findMany({
      where: { athleteId: params.athleteId },
      include: { exercise: true },
      orderBy: { exercise: { name: 'asc' } },
    })

    return NextResponse.json({
      weeklyLoad,
      progress,
      selectedExerciseId: exerciseId,
      trackedExercises: trackedExercises.map((rm) => ({
        exerciseId: rm.exerciseId,
        name: rm.exercise.name,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
