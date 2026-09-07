import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { mondayOnOrBefore } from '@/lib/gym'

export async function POST(req: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId: clientId } = await params; const coach = await requireCoach(); await assertGymClientBelongsToCoach(clientId, coach.id)
  const body = await req.json() as { name?: string; weeks?: number; startDate?: string }
  const name = body.name?.trim(); const weeks = Math.min(52, Math.max(1, Number(body.weeks) || 4))
  if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
  // Anchored to the Monday on/before the given (or default-to-now) date —
  // the caller (GymPlanActions' quick "+ План" button) never lets the coach
  // pick a day of week, so week 1 should land on a calendar Monday rather
  // than whatever weekday the plan happened to get created on. Also used
  // for the workout dates below instead of a separate Date.now() call, so
  // plan.startDate and the actual scheduled days can't drift apart.
  const anchor = mondayOnOrBefore(new Date(body.startDate ?? Date.now()))
  const plan = await prisma.gymPlan.create({ data: { clientId, name, weeks, startDate: anchor, weeksData: { create: Array.from({ length: weeks }, (_, i) => ({ weekNumber: i + 1, workouts: { create: Array.from({ length: 3 }, (_, d) => ({ dayNumber: d + 1, scheduledDate: new Date(anchor.getTime() + (i * 7 + d) * 86400000) })) } })) } } })
  return NextResponse.json(plan, { status: 201 })
}
