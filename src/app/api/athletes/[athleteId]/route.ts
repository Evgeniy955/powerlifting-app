import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

// PATCH /api/athletes/:athleteId { inviteEmail?, displayName? } — lets the
// owning coach fill in or correct a placeholder athlete's email/name before
// (re)sending the invite. Coach-scoped counterpart to the admin PATCH at
// /api/admin/pending-invites/[athleteId] (that one is reachable from any
// coach via /admin/users; this one is restricted to the athlete's own coach,
// same as the invite-send route). Doesn't send anything itself — the client
// follows up with POST /invite once the email is saved.
export async function PATCH(req: NextRequest, props: { params: Promise<{ athleteId: string }> }) {
  const params = await props.params;
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
    return apiErrorResponse(e)
  }
}

// DELETE /api/athletes/:athleteId — removes this athlete from the coach's
// roster. Coach-scoped (assertAthleteBelongsToCoach), unlike the admin
// panel's DELETE /api/admin/users/:userId (which any coach can point at any
// user — there's no separate ADMIN role in this app).
//
// An athlete with at least one plan (Cycle) is never destroyed outright on
// first delete — real training data (cycles/workouts/sets/1RM) would be lost
// for good. Instead the first DELETE archives them (archivedAt set, hidden
// from the normal roster, restorable from /athletes/archive). A second
// DELETE — only reachable from the archive screen, once already archived —
// performs the real, permanent removal. An athlete with no plans at all has
// nothing to lose, so DELETE removes them immediately, same as before.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ athleteId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()
    const athlete = await assertAthleteBelongsToCoach(params.athleteId, coach.id)
    const cycleCount = await prisma.cycle.count({ where: { athleteId: athlete.id } })

    if (!athlete.archivedAt && cycleCount > 0) {
      await prisma.athleteProfile.update({
        where: { id: athlete.id },
        data: { archivedAt: new Date() },
      })
      return NextResponse.json({ archived: true })
    }

    // Pending placeholder (no userId yet) or an already-archived athlete —
    // permanent removal either way.
    if (athlete.userId) {
      await prisma.user.delete({ where: { id: athlete.userId } })
    } else {
      await prisma.athleteProfile.delete({ where: { id: athlete.id } })
    }

    return NextResponse.json({ deleted: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
