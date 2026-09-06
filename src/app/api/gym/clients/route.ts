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

  // Used to auto-link `userId` here the moment inviteEmail matched an
  // existing account — before the client ever accepted anything, sometimes
  // before an invite was even sent. That's exactly the access-without-
  // acceptance gap auth/callback/route.ts's token check was built to close;
  // this route was the other way in. A client only gets `userId` (and
  // `inviteStatus: 'ACCEPTED'`) now via that callback, when they actually
  // sign in through their invite email's link. Still worth flagging here:
  // still checking for an existing account only to give a clearer error up
  // front — someone whose email already has a GymClient profile elsewhere
  // would otherwise hit a confusing unique-constraint failure once they did
  // accept, rather than a clear message now.
  if (inviteEmail) {
    const existingUser = await prisma.user.findUnique({ where: { email: inviteEmail }, select: { id: true } })
    if (existingUser) {
      const linked = await prisma.gymClient.findUnique({ where: { userId: existingUser.id } })
      if (linked) return NextResponse.json({ error: 'У этого пользователя уже есть профиль клиента' }, { status: 409 })
    }
  }

  const client = await prisma.gymClient.create({
    data: { coachId: coach.id, displayName: displayName.slice(0, 120), inviteEmail: inviteEmail?.slice(0, 255) },
  })
  return NextResponse.json(client, { status: 201 })
}
