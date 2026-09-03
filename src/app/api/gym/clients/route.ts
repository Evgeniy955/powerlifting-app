import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach } from '@/lib/session'

export async function POST(req: Request) {
  const coach = await requireCoach()
  const body = await req.json() as { displayName?: string; inviteEmail?: string }
  const displayName = body.displayName?.trim()
  const inviteEmail = body.inviteEmail?.trim().toLowerCase()

  if (!displayName) return NextResponse.json({ error: 'Укажите имя клиента' }, { status: 400 })
  if (inviteEmail && !/^\S+@\S+\.\S+$/.test(inviteEmail)) {
    return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 })
  }

  const existingUser = inviteEmail
    ? await prisma.user.findUnique({ where: { email: inviteEmail }, select: { id: true } })
    : null

  if (existingUser) {
    const linked = await prisma.gymClient.findUnique({ where: { userId: existingUser.id } })
    if (linked) return NextResponse.json({ error: 'У этого пользователя уже есть профиль клиента' }, { status: 409 })
  }

  const client = await prisma.gymClient.create({
    data: { coachId: coach.id, displayName: displayName.slice(0, 120), inviteEmail: inviteEmail?.slice(0, 255), userId: existingUser?.id },
  })
  return NextResponse.json(client, { status: 201 })
}
