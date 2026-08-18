import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'

// PATCH /api/admin/users/:userId { role: 'COACH' | 'ATHLETE' } — role management.
// There's no separate ADMIN tier in this app; COACH is already the privileged
// role, so any coach can promote/demote any other user. A coach can't change
// their own role here, so they can't accidentally lock themselves out of this
// page (or, worse, out of every athlete they manage).
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const coach = await requireCoach()
    if (params.userId === coach.id) {
      return NextResponse.json({ error: 'Нельзя изменить свою собственную роль' }, { status: 400 })
    }

    const { role } = (await req.json()) as { role?: string }
    if (role !== 'COACH' && role !== 'ATHLETE') {
      return NextResponse.json({ error: 'Роль должна быть COACH или ATHLETE' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    const updated = await prisma.user.update({
      where: { id: params.userId },
      data: { role },
    })

    return NextResponse.json(updated)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
