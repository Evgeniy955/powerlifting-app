import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { estimateGymOneRepMax } from '@/lib/gym'

export async function POST(req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach()
    const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)
    const body = await req.json() as { exerciseId?: string; workingWeight?: number; reps?: number }
    const workingWeight = Number(body.workingWeight)
    const reps = Number(body.reps)
    if (!body.exerciseId || !Number.isFinite(workingWeight) || workingWeight <= 0 || !Number.isInteger(reps) || reps < 1) return NextResponse.json({ error: 'Выберите упражнение и укажите рабочий вес и повторы' }, { status: 400 })
    const exercise = await prisma.gymExerciseCatalog.findUnique({ where: { id: body.exerciseId } })
    if (!exercise) return NextResponse.json({ error: 'Упражнение не найдено' }, { status: 404 })
    const estimatedMax = estimateGymOneRepMax(workingWeight, reps)
    if (!estimatedMax) return NextResponse.json({ error: 'Не удалось рассчитать начальный максимум' }, { status: 400 })
    const existingMax = await prisma.gymClientMax.findUnique({ where: { clientId_exerciseId: { clientId: workout.week.plan.clientId, exerciseId: body.exerciseId } } })
    const oneRepMax = existingMax?.value ?? estimatedMax
    if (!existingMax) await prisma.gymClientMax.create({ data: { clientId: workout.week.plan.clientId, exerciseId: body.exerciseId, value: oneRepMax } })
    const lastEntry = await prisma.gymExerciseEntry.findFirst({ where: { workoutId }, orderBy: { orderIndex: 'desc' }, select: { orderIndex: true } })
    const entry = await prisma.gymExerciseEntry.create({ data: { workoutId, exerciseId: body.exerciseId, oneRepMax, orderIndex: (lastEntry?.orderIndex ?? -1) + 1, sets: { create: [1, 2, 3].map((setNumber) => ({ setNumber, weight: workingWeight, reps })) } }, include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } } })
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
