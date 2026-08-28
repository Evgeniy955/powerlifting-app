import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { athleteDisplayName } from '@/lib/athlete'
import { EmailNotConfiguredError, sendInviteEmail } from '@/lib/email'

// Admin-scoped counterpart to /api/athletes/[athleteId]/invite: that route is
// restricted to the athlete's own coach (assertAthleteBelongsToCoach), but
// this one is reachable from /admin/users, where — same as the rest of that
// page — any coach can act on any pending invite (no separate ADMIN role).

async function loadPendingAthlete(athleteId: string) {
  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    include: { coach: { select: { name: true, email: true } } },
  })
  if (!athlete) {
    return { error: NextResponse.json({ error: 'Атлет не найден' }, { status: 404 }) }
  }
  if (athlete.userId) {
    return { error: NextResponse.json({ error: 'Атлет уже принял приглашение' }, { status: 400 }) }
  }
  return { athlete }
}

// PATCH { inviteEmail?, displayName? } — edits the placeholder profile before
// it's accepted. Doesn't send anything itself; the client follows up with a
// POST (resend) only after confirming with the coach, when the email actually
// changed.
export async function PATCH(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    await requireCoach()
    const result = await loadPendingAthlete(params.athleteId)
    if ('error' in result) return result.error
    const { athlete } = result

    const body = (await req.json()) as { inviteEmail?: string; displayName?: string }
    const data: { inviteEmail?: string; displayName?: string | null } = {}

    if (body.inviteEmail !== undefined) {
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

    const updated = await prisma.athleteProfile.update({ where: { id: athlete.id }, data })
    return NextResponse.json(updated)
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// POST — (re)send the invite email to whatever inviteEmail is currently set,
// same idempotent "call again to resend" semantics as the coach-scoped route.
export async function POST(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    await requireCoach()
    const result = await loadPendingAthlete(params.athleteId)
    if ('error' in result) return result.error
    const { athlete } = result

    if (!athlete.inviteEmail) {
      return NextResponse.json({ error: 'У этого атлета не задан email' }, { status: 400 })
    }

    const token = randomBytes(32).toString('hex')
    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: { inviteToken: token, inviteStatus: 'PENDING', invitedAt: new Date() },
    })

    try {
      await sendInviteEmail({
        to: athlete.inviteEmail,
        coachName: athlete.coach?.name ?? athlete.coach?.email ?? 'Тренер',
        athleteDisplayName: athleteDisplayName(athlete),
        token,
      })
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) {
        return NextResponse.json({ error: err.message }, { status: 501 })
      }
      return NextResponse.json({ error: 'Не удалось отправить письмо' }, { status: 502 })
    }

    return NextResponse.json({ invitedAt: updated.invitedAt })
  } catch (e) {
    return apiErrorResponse(e)
  }
}

// DELETE — admin-unscoped counterpart to /api/athletes/[athleteId] DELETE,
// for a pending invite acted on from /admin/users rather than its owning
// coach's own /athletes list. Same archive-or-delete rule: a placeholder
// with at least one plan (Cycle) already built for it gets archived
// (archivedAt set, reversible from the owning coach's /athletes/archive)
// instead of destroyed outright; one with nothing built yet is just removed.
export async function DELETE(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    await requireCoach()
    const result = await loadPendingAthlete(params.athleteId)
    if ('error' in result) return result.error
    const { athlete } = result

    const cycleCount = await prisma.cycle.count({ where: { athleteId: athlete.id } })

    if (!athlete.archivedAt && cycleCount > 0) {
      await prisma.athleteProfile.update({
        where: { id: athlete.id },
        data: { archivedAt: new Date() },
      })
      return NextResponse.json({ archived: true })
    }

    await prisma.athleteProfile.delete({ where: { id: athlete.id } })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
