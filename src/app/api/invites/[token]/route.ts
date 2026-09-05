import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/invites/:token — public (no auth), used by the login page to show
// "Coach X invites you" context before sign-in. Never returns the raw invite
// email — only what's needed for that banner. Checks both invite tables
// (powerlifting athletes and gym clients) since a single token namespace
// isn't shared between them; `kind` tells the login page which pitch to show.
export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;

  const athlete = await prisma.athleteProfile.findFirst({
    where: { inviteToken: params.token, inviteStatus: 'PENDING' },
    include: { coach: { select: { name: true, email: true } } },
  })
  if (athlete) {
    return NextResponse.json({
      kind: 'ATHLETE' as const,
      displayName: athlete.displayName ?? null,
      coachName: athlete.coach?.name ?? athlete.coach?.email ?? 'Тренер',
    })
  }

  const gymClient = await prisma.gymClient.findFirst({
    where: { inviteToken: params.token, inviteStatus: 'PENDING' },
    include: { coach: { select: { name: true, email: true } } },
  })
  if (gymClient) {
    return NextResponse.json({
      kind: 'GYM' as const,
      displayName: gymClient.displayName ?? null,
      coachName: gymClient.coach?.name ?? gymClient.coach?.email ?? 'Тренер',
    })
  }

  return NextResponse.json({ error: 'Приглашение не найдено или уже использовано' }, { status: 404 })
}
