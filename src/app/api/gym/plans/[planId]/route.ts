import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymPlanAccess } from '@/lib/gym'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

export async function GET(_: Request, { params }: { params: Promise<{ planId: string }> }) { const user=await requireUser(); const {planId}=await params; const plan=await assertGymPlanAccess(planId,user); if(!plan) return NextResponse.json({error:'План не найден'},{status:404}); return NextResponse.json(plan) }

// PATCH /api/gym/plans/:planId { name } — coach-only rename, mirrors
// PATCH /api/cycles/:cycleId (which also supports shifting startDate; gym
// plans don't need that yet since the only caller is the rename dialog).
export async function PATCH(req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const coach = await requireCoach()
    const { planId } = await params
    const plan = await prisma.gymPlan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    await assertGymClientBelongsToCoach(plan.clientId, coach.id)

    const body = await req.json() as { name?: unknown }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
    }

    const updated = await prisma.gymPlan.update({
      where: { id: planId },
      data: { name: body.name.trim().slice(0, 120) },
    })
    return NextResponse.json(updated)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// DELETE /api/gym/plans/:planId — coach-only. Cascades to every week,
// workout, exercise entry and set under the plan via schema.prisma's
// onDelete: Cascade relations.
export async function DELETE(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const coach = await requireCoach()
    const { planId } = await params
    const plan = await prisma.gymPlan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    await assertGymClientBelongsToCoach(plan.clientId, coach.id)

    await prisma.gymPlan.delete({ where: { id: planId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
