import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { athleteDisplayName } from '@/lib/athlete'
import { EmailNotConfiguredError, sendGymInviteEmail } from '@/lib/email'

// POST /api/gym/clients/:clientId/invite — (re)send the invite email for a
// gym client. Idempotent, same shape as POST /api/athletes/[athleteId]/invite:
// generates a fresh token every call, so calling again is how a coach resends.
export async function POST(_req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params
  try {
    const coach = await requireCoach()
    const client = await assertGymClientBelongsToCoach(params.clientId, coach.id)

    if (client.userId) {
      return NextResponse.json({ error: 'Клиент уже принял приглашение' }, { status: 400 })
    }
    if (!client.inviteEmail) {
      return NextResponse.json({ error: 'У этого клиента не задан email' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')
    const updated = await prisma.gymClient.update({
      where: { id: client.id },
      data: { inviteToken: token, inviteStatus: 'PENDING', invitedAt: new Date() },
    })

    try {
      await sendGymInviteEmail({
        to: client.inviteEmail,
        coachName: coach.name ?? coach.email ?? 'Тренер',
        athleteDisplayName: athleteDisplayName(client),
        token,
      })
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        return NextResponse.json({ error: err.message }, { status: 501 })
      }
      return NextResponse.json({ error: 'Не удалось отправить письмо' }, { status: 502 })
    }

    return NextResponse.json({ invitedAt: updated.invitedAt })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
