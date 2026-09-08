import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

const GROUP_TYPES = new Set(['SUPERSET', 'DROPSET'])

async function resolveGroupClient(groupId: string) {
  const members = await prisma.gymExerciseEntry.findMany({
    where: { groupId },
    include: { workout: { include: { week: { include: { plan: true } } } } },
  })
  return members
}

// PATCH /api/gym/groups/:groupId { groupType } — relabels an existing
// superset as a dropset or vice versa, without touching membership or any
// logged weight/reps.
export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const coach = await requireCoach()
    const { groupId } = await params
    const members = await resolveGroupClient(groupId)
    if (members.length === 0) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(members[0].workout.week.plan.clientId, coach.id)

    const body = (await req.json()) as { groupType?: unknown }
    const groupType = typeof body.groupType === 'string' ? body.groupType : ''
    if (!GROUP_TYPES.has(groupType)) return NextResponse.json({ error: 'Некорректный тип группы' }, { status: 400 })

    await prisma.gymExerciseEntry.updateMany({ where: { groupId }, data: { groupType } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiErrorResponse(error)
  }
}

// DELETE /api/gym/groups/:groupId — splits a superset/dropset back into
// standalone exercises. Every member keeps its own sets, ПМ, notes,
// position, etc. — only the shared groupId/groupType is cleared.
export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const coach = await requireCoach()
    const { groupId } = await params
    const members = await resolveGroupClient(groupId)
    if (members.length === 0) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(members[0].workout.week.plan.clientId, coach.id)

    await prisma.gymExerciseEntry.updateMany({ where: { groupId }, data: { groupId: null, groupType: null } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
