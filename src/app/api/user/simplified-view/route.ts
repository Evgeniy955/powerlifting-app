import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'

// PATCH /api/user/simplified-view { simplified: boolean } — persists the
// "Упрощённый режим" checkbox (Микроцикл week view + single-day Workout
// view) on the signed-in user's own row, so the setting follows the account
// across an app reload or a different browser/device instead of living in
// localStorage. No athleteId in the path — this is always the caller's own
// preference, coach or athlete alike.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser()
    const { simplified } = (await req.json()) as { simplified?: unknown }
    if (typeof simplified !== 'boolean') {
      return NextResponse.json({ error: 'simplified (boolean) обязателен' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { simplifiedView: simplified },
    })

    return NextResponse.json({ simplified })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
