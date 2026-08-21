import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { getCycleAnalytics } from '@/lib/analytics'
import { getRpeTable } from '@/lib/workout'

// GET /api/cycles/:cycleId/analytics?exerciseId=...
// Weekly analytics for one mesocycle — the whole-cycle counterpart to the
// per-athlete /analytics endpoint. Returns tonnage/KPSH/avgWeight/relative
// intensity/KO per week (optionally scoped to one exercise) plus a
// whole-mesocycle summary and the list of exercises used in the cycle, for
// the exercise picker on the cycle analytics page.
export async function GET(req: NextRequest, { params }: { params: { cycleId: string } }) {
  try {
    const user = await requireUser()

    const cycle = await prisma.cycle.findUnique({
      where: { id: params.cycleId },
      include: { athlete: true },
    })
    if (!cycle) {
      return NextResponse.json({ error: 'Цикл не найден' }, { status: 404 })
    }
    // Coach-only — see cycles/[cycleId]/analytics/page.tsx for why.
    if (user.role !== 'COACH' || cycle.athlete.coachId !== user.id) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const rpeTable = await getRpeTable()
    const exerciseId = req.nextUrl.searchParams.get('exerciseId')
    const analytics = await getCycleAnalytics(params.cycleId, rpeTable, exerciseId)

    return NextResponse.json(analytics)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
