import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'

// GET /api/athletes — list athletes attached to the signed-in coach.
export async function GET() {
  try {
    const coach = await requireCoach()
    const athletes = await prisma.athleteProfile.findMany({
      where: { coachId: coach.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(athletes)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// POST /api/athletes { email, displayName? } — create the athlete's page.
// If a User with this email already signed in at some point (organic self-signup,
// or already an athlete elsewhere), attach that existing profile immediately —
// same as before. Otherwise create a placeholder profile with no linked user yet;
// no email is sent here — that's the separate, explicit "send invite" step.
export async function POST(req: NextRequest) {
  try {
    const coach = await requireCoach()
    const { email, displayName } = (await req.json()) as { email: string; displayName?: string }
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
    }
    const normalizedEmail = email.trim().toLowerCase()

    const targetUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { athleteProfile: true },
    })

    if (targetUser) {
      if (targetUser.role === 'COACH') {
        return NextResponse.json({ error: 'Этот email принадлежит тренеру' }, { status: 400 })
      }
      if (!targetUser.athleteProfile) {
        return NextResponse.json({ error: 'У пользователя нет профиля атлета' }, { status: 400 })
      }
      const updated = await prisma.athleteProfile.update({
        where: { id: targetUser.athleteProfile.id },
        data: { coachId: coach.id },
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      })
      return NextResponse.json(updated, { status: 201 })
    }

    const created = await prisma.athleteProfile.create({
      data: {
        coachId: coach.id,
        inviteEmail: normalizedEmail,
        displayName: displayName?.trim() || null,
      },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
