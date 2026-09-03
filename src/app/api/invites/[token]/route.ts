import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/invites/:token — public (no auth), used by the login page to show
// "Coach X invites you" context before sign-in. Never returns the raw invite
// email — only what's needed for that banner.
export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const athlete = await prisma.athleteProfile.findFirst({
    where: { inviteToken: params.token, inviteStatus: 'PENDING' },
    include: { coach: { select: { name: true, email: true } } },
  })
  if (!athlete) {
    return NextResponse.json({ error: 'Приглашение не найдено или уже использовано' }, { status: 404 })
  }

  return NextResponse.json({
    displayName: athlete.displayName ?? null,
    coachName: athlete.coach?.name ?? athlete.coach?.email ?? 'Тренер',
  })
}
