import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { getAiInsights, AiNotConfiguredError } from '@/lib/aiInsights'

// POST /api/athletes/:athleteId/ai-insights — coach-only (this drives coaching
// decisions, and each call is a real paid API request, so it's opt-in via a
// button rather than fetched automatically on page load). Verifies the coach
// actually owns this athlete before spending an API call on their data.
export async function POST(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()

    const athlete = await prisma.athleteProfile.findUnique({ where: { id: params.athleteId } })
    if (!athlete) {
      return NextResponse.json({ error: 'Атлет не найден' }, { status: 404 })
    }
    if (athlete.coachId !== coach.id) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const text = await getAiInsights(params.athleteId)
    return NextResponse.json({ text })
  } catch (e) {
    if (e instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: e.message }, { status: 501 })
    }
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
