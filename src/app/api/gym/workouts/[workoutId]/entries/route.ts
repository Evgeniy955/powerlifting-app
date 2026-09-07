import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// POST /api/gym/workouts/:workoutId/entries { exerciseId } — adds an
// exercise block to the workout. Its 1RM is snapshotted from the client's
// currently tracked GymClientMax, same as POST /api/exercise-entries reads
// Athlete1RM on the powerlifting side — left null (ExerciseCard's "1ПМ не
// задан" state) if nothing's tracked yet, rather than estimating one from a
// working set. Starts with 0 sets; the coach/client adds them afterward via
// "+ Добавить подход", same as the powerlifting side's exercise entries.
export async function POST(req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach()
    const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)
    const body = await req.json() as { exerciseId?: string }
    if (!body.exerciseId) return NextResponse.json({ error: 'Выберите упражнение' }, { status: 400 })
    const exercise = await prisma.gymExerciseCatalog.findUnique({ where: { id: body.exerciseId } })
    if (!exercise) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    if (exercise.archivedAt) return NextResponse.json({ error: 'Упражнение архивировано и недоступно для выбора' }, { status: 400 })
    const existingMax = await prisma.gymClientMax.findUnique({ where: { clientId_exerciseId: { clientId: workout.week.plan.clientId, exerciseId: body.exerciseId } } })
    const lastEntry = await prisma.gymExerciseEntry.findFirst({ where: { workoutId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } })
    const entry = await prisma.gymExerciseEntry.create({
      data: {
        workoutId,
        exerciseId: body.exerciseId,
        oneRepMax: existingMax?.value ?? null,
        orderIndex: (lastEntry?.orderIndex ?? -1) + 1,
      },
      include: { exercise: true, sets: true },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
