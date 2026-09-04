import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { buildGymWorkoutPdf, type PdfWorkoutExport } from '@/lib/gymPlanPdf'

// GET /api/gym/workouts/:workoutId/export — one training day as a
// standalone PDF (every exercise and set for just that day). Same access
// rule as the rest of a gym plan: coach can export any of their clients'
// workouts, the client can export their own. Mirrors
// /api/gym/plans/:planId/export and /api/gym/weeks/:weekId/export, just
// scoped to a single training day.
export async function GET(_req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const user = await requireUser()
    const { workoutId } = await params

    const workout = await prisma.gymWorkout.findUnique({
      where: { id: workoutId },
      include: {
        week: { include: { plan: { include: { client: { include: { user: true } } } } } },
        entries: {
          orderBy: { orderIndex: 'asc' },
          include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
        },
      },
    })
    if (!workout) {
      return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    }
    await assertGymClientAccessible(workout.week.plan.clientId, user)

    const clientName = workout.week.plan.client.displayName ?? workout.week.plan.client.user?.name ?? 'Клиент'

    const pdfWorkout: PdfWorkoutExport = {
      planName: workout.week.plan.name,
      clientName,
      weekNumber: workout.week.weekNumber,
      workout: {
        dayNumber: workout.dayNumber,
        scheduledDate: workout.scheduledDate,
        exercises: workout.entries.map((entry) => ({
          name: entry.exercise.name,
          oneRepMax: entry.oneRepMax,
          sets: entry.sets.map((set) => ({
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            toFailure: set.toFailure,
          })),
        })),
      },
    }

    const buffer = buildGymWorkoutPdf(pdfWorkout)
    const fileName = `${workout.week.plan.name.replace(/[^\w\-]+/g, '_')}_w${workout.week.weekNumber}d${workout.dayNumber}.pdf`

    // Buffer's ArrayBufferLike generic doesn't line up with fetch's
    // BodyInit typing on this @types/node — a plain Uint8Array view over
    // the same bytes satisfies it without copying.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
