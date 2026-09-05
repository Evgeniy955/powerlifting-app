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

    if (client.userId) {
      return NextResponse.json({ error: 'Клиент уже принял приглашение' }, { status: 400 })
    }

    const body = (await req.json()) as { inviteEmail?: string; displayName?: string }
    const data: { inviteEmail?: string; displayName?: string | null } = {}

    if (body.inviteEmail !== undefined) {
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
