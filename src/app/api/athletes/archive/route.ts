import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'

// GET /api/athletes/archive — archived athletes for the signed-in coach
// (see AthleteProfile.archivedAt). Kept as its own list, separate from the
// main GET /api/athletes, so the normal roster stays uncluttered and this
// screen can show the archive-specific actions (restore / delete forever).
export async function GET() {
  try {
    const coach = await requireCoach()
    const athletes = await prisma.athleteProfile.findMany({
      where: { coachId: coach.id, archivedAt: { not: null } },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { cycles: true } },
      },
      orderBy: { archivedAt: 'desc' },
    })

    const withPlanCount = athletes.map(({ _count, ...rest }) => ({
      ...rest,
      planCount: _count.cycles,
    }))

    return NextResponse.json(withPlanCount)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
