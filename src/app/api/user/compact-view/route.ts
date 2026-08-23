import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'

// PATCH /api/user/compact-view { compact: boolean } — persists the
// "Компактный режим" checkbox (single-day Workout view) on the signed-in
// user's own row, same shape/reasoning as PATCH /api/user/simplified-view.
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser()
    const { compact } = (await req.json()) as { compact?: unknown }
    if (typeof compact !== 'boolean') {
      return NextResponse.json({ error: 'compact (boolean) обязателен' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { compactView: compact },
    })

    return NextResponse.json({ compact })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
