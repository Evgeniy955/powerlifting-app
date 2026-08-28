import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// POST /api/athletes/:athleteId/restore — pulls an archived athlete back
// onto the normal roster (clears archivedAt). Coach-scoped. No-op-ish if the
// athlete wasn't archived to begin with.
export async function POST(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    const athlete = await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: { archivedAt: null },
    })

    return NextResponse.json(updated)
  } catch (e) {
    return apiErrorResponse(e)
  }
}
