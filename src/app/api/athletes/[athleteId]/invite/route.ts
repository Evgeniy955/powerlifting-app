import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'
import { athleteDisplayName } from '@/lib/athlete'
import { EmailNotConfiguredError, sendInviteEmail } from '@/lib/email'

// POST /api/athletes/:athleteId/invite — (re)send the invite email. Idempotent:
// generates a fresh token every call, so calling again is how a coach resends.
export async function POST(_req: NextRequest, props: { params: Promise<{ athleteId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()
    const athlete = await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    if (athlete.userId) {
      return NextResponse.json({ error: 'Атлет уже принял приглашение' }, { status: 400 })
    }
    if (!athlete.inviteEmail) {
      return NextResponse.json({ error: 'У этого атлета не задан email' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')
    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: { inviteToken: token, inviteStatus: 'PENDING', invitedAt: new Date() },
    })

    try {
      await sendInviteEmail({
        to: athlete.inviteEmail,
        coachName: coach.name ?? coach.email ?? 'Тренер',
        athleteDisplayName: athleteDisplayName(athlete),
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
