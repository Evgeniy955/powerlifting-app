import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

// PATCH /api/gym/clients/:clientId { inviteEmail?, displayName? } — lets the
// owning coach fill in or correct a client's email/name before (re)sending
// the invite. Gym-mode counterpart of PATCH /api/athletes/[athleteId].
// Doesn't send anything itself — the client follows up with POST /invite
// once the email is saved.
export async function PATCH(req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params
  try {
    const coach = await requireCoach()
    const client = await assertGymClientBelongsToCoach(params.clientId, coach.id)

    const body = (await req.json()) as { inviteEmail?: string; displayName?: string }
    const data: { inviteEmail?: string; displayName?: string | null } = {}

    // inviteEmail only matters pre-acceptance (it drives the invite flow) —
    // once the client has a real account, changing it here would be
    // meaningless, so that part stays gated. displayName is just a label the
    // coach uses for their own roster, so it stays editable regardless of
    // invite status (this is what lets a coach rename an already-accepted
    // client, which used to be impossible).
    if (body.inviteEmail !== undefined) {
      if (client.userId) {
        return NextResponse.json({ error: 'Клиент уже принял приглашение' }, { status: 400 })
      }
      const email = body.inviteEmail.trim().toLowerCase()
      if (!email) {
        return NextResponse.json({ error: 'Email не может быть пустым' }, { status: 400 })
      }
      data.inviteEmail = email
    }
    if (body.displayName !== undefined) {
      data.displayName = body.displayName.trim() || null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const updated = await prisma.gymClient.update({ where: { id: client.id }, data })
    return NextResponse.json(updated)
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже используется' }, { status: 400 })
    }
    return apiErrorResponse(e)
  }
}

// DELETE /api/gym/clients/:clientId — removes this client from the coach's
// gym roster. GymClient has no archivedAt/soft-delete concept (unlike
// AthleteProfile), so this is always a hard delete; all of the client's
// plans, maxes, health profile and assessments cascade with it via the FK
// `onDelete: Cascade` in the Prisma schema. If the client has an account
// (accepted the invite), we delete the User row instead — same as the
// athlete DELETE route — which cascades the GymClient relation too.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params
  try {
    const coach = await requireCoach()
    const client = await assertGymClientBelongsToCoach(params.clientId, coach.id)

    if (client.userId) {
      await prisma.user.delete({ where: { id: client.userId } })
    } else {
      await prisma.gymClient.delete({ where: { id: client.id } })
    }

    return NextResponse.json({ deleted: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
