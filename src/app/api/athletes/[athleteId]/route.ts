import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/athletes/:athleteId { inviteEmail?, displayName? } — lets the
// owning coach fill in or correct a placeholder athlete's email/name before
// (re)sending the invite. Coach-scoped counterpart to the admin PATCH at
// /api/admin/pending-invites/[athleteId] (that one is reachable from any
// coach via /admin/users; this one is restricted to the athlete's own coach,
// same as the invite-send route). Doesn't send anything itself — the client
// follows up with POST /invite once the email is saved.
export async function PATCH(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    const athlete = await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    if (athlete.userId) {
      return NextResponse.json({ error: 'Атлет уже принял приглашение' }, { status: 400 })
    }

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
    // Unique constraint on inviteEmail (if one exists) or similar — surface as 400.
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже используется' }, { status: 400 })
    }
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// DELETE /api/athletes/:athleteId — removes this athlete from the coach's
// roster. Coach-scoped (assertAthleteBelongsToCoach), unlike the admin
// panel's DELETE /api/admin/users/:userId (which any coach can point at any
// user — there's no separate ADMIN role in this app). Two cases:
//  - Still-pending placeholder (no userId yet, invite not accepted): no User
//    row exists at all for them, just delete the AthleteProfile itself.
//  - Already-accepted athlete (has userId): delete their User account —
//    AthleteProfile, and everything under it (cycles/workouts/sets/1RM/
//    supplements/periods/changelog), cascades via the schema's onDelete:
//    Cascade FKs, same destructive effect as the admin panel's delete.
export async function DELETE(_req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    const athlete = await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    if (athlete.userId) {
      await prisma.user.delete({ where: { id: athlete.userId } })
    } else {
      await prisma.athleteProfile.delete({ where: { id: athlete.id } })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
