import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

// Admin-scoped counterpart of PATCH/DELETE /api/gym/clients/:clientId — same
// behavior, but unscoped by ownership (any coach can act on any gym client
// from the admin panel), mirroring the pattern in
// /api/admin/pending-invites/:athleteId. Lives on /admin/users, which lists
// every gym client across every coach.
export async function PATCH(req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()
    const client = await prisma.gymClient.findUnique({ where: { id: params.clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Подопечный не найден' }, { status: 404 })
    }

    const body = (await req.json()) as { inviteEmail?: string; displayName?: string }
    const data: { inviteEmail?: string; displayName?: string | null } = {}

    if (body.inviteEmail !== undefined) {
      if (client.userId) {
        return NextResponse.json({ error: 'Подопечный уже принял приглашение' }, { status: 400 })
      }
      const email = body.inviteEmail.trim().toLowerCase()
      if (!email) {
        return NextResponse.json({ error: 'Email не может быть пустым' }, { status: 400 })
      }
      data.inviteEmail = email
    }
    if (body.displayName !== undefined) {
      data.displayName = body.displayName.trim() || null
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const updated = await prisma.gymClient.update({ where: { id: client.id }, data })
    return NextResponse.json(updated)
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже используется' }, { status: 400 })
    }
    return apiErrorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params
  try {
    await requireCoach()
    const client = await prisma.gymClient.findUnique({ where: { id: params.clientId } })
    if (!client) {
      return NextResponse.json({ error: 'Подопечный не найден' }, { status: 404 })
    }

    if (client.userId) {
      await prisma.user.delete({ where: { id: client.userId } })
    } else {
      await prisma.gymClient.delete({ where: { id: client.id } })
    }

    return NextResponse.json({ deleted: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
