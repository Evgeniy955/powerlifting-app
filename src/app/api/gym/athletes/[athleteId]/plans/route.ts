import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

export async function POST(req: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params; const coach = await requireCoach(); await assertAthleteBelongsToCoach(athleteId, coach.id)
  const body = await req.json() as { name?: string; weeks?: number; startDate?: string }
  const name = body.name?.trim(); const weeks = Math.min(52, Math.max(1, Number(body.weeks) || 4))
  if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  const plan = await prisma.gymPlan.create({ data: { athleteId, name, weeks, startDate: new Date(body.startDate ?? Date.now()), weeksData: { create: Array.from({ length: weeks }, (_, i) => ({ weekNumber: i + 1, workouts: { create: Array.from({ length: 3 }, (_, d) => ({ dayNumber: d + 1, scheduledDate: new Date(Date.now() + (i * 7 + d) * 86400000) })) } })) } } })
  return NextResponse.json(plan, { status: 201 })
}
