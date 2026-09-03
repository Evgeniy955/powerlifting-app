import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

// POST /api/admin/users/:userId/attach-coach — for an ATHLETE who already has
// a real account (self-registered via Google, or matched by email in the old
// "create athlete page" flow) but no coach yet: attaches the calling coach
// directly, no email involved. Distinct from the invite flow, which only
// applies before an account exists (see /api/athletes/[athleteId]/invite and
// /api/admin/pending-invites/[athleteId]) — this athlete already has full
// login access, there's nothing to "accept".
export async function POST(_req: Request, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const target = await prisma.user.findUnique({
      where: { id: params.userId },
      include: { athleteProfile: true },
    })
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }
    if (target.role !== 'ATHLETE') {
      return NextResponse.json({ error: 'Пользователь не атлет' }, { status: 400 })
    }
    if (!target.athleteProfile) {
      return NextResponse.json({ error: 'У атлета нет профиля' }, { status: 400 })
    }
    if (target.athleteProfile.coachId) {
      return NextResponse.json({ error: 'У атлета уже есть тренер' }, { status: 400 })
    }

    const updated = await prisma.athleteProfile.update({
      where: { id: target.athleteProfile.id },
      data: { coachId: coach.id },
    })

    return NextResponse.json(updated)
  } catch (e) {
    return apiErrorResponse(e)
  }
}
