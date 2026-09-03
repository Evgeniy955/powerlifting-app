import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function POST(req: Request, { params }: { params: Promise<{ weekId: string }> }) {
  try {
    const coach = await requireCoach(); const { weekId } = await params
    const week = await prisma.gymWeek.findUnique({ where: { id: weekId }, include: { plan: true, workouts: { select: { dayNumber: true } } } })
    if (!week) return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    await assertGymClientBelongsToCoach(week.plan.clientId, coach.id)
    const { scheduledDate } = await req.json() as { scheduledDate?: string }
    const date = new Date(scheduledDate ?? '')
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Некорректная дата' }, { status: 400 })
    const dayNumber = week.workouts.reduce((max, workout) => Math.max(max, workout.dayNumber), 0) + 1
    return NextResponse.json(await prisma.gymWorkout.create({ data: { weekId, dayNumber, scheduledDate: date } }), { status: 201 })
  } catch (error) { return apiErrorResponse(error) }
}
