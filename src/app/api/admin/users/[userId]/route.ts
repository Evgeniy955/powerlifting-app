import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

// PATCH /api/admin/users/:userId { role?, name?, email? } — role management plus
// basic profile editing. There's no separate ADMIN tier in this app; COACH is
// already the privileged role, so any coach can edit/promote/demote any other
// user. A coach can't change their own role here (see below), so they can't
// accidentally lock themselves out of this page — editing their own
// name/email is fine and allowed.
export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()

    const body = (await req.json()) as { role?: string; name?: string; email?: string }
    const data: { role?: string; name?: string | null; email?: string } = {}

    if (body.role !== undefined) {
      if (params.userId === coach.id) {
        return NextResponse.json(
          { error: 'Нельзя изменить свою собственную роль' },
          { status: 400 }
        )
      }
      if (body.role !== 'COACH' && body.role !== 'ATHLETE') {
        return NextResponse.json({ error: 'Роль должна быть COACH или ATHLETE' }, { status: 400 })
      }
      data.role = body.role
    }

    if (body.name !== undefined) {
      data.name = body.name.trim() || null
    }

    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase()
      if (!email) {
        return NextResponse.json({ error: 'Email не может быть пустым' }, { status: 400 })
      }
      data.email = email
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Нечего сохранять' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    const updated = await prisma.user.update({ where: { id: params.userId }, data })
    return NextResponse.json(updated)
  } catch (e) {
    // Unique constraint on User.email (P2002) — surface as a normal 400, not a 500.
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json({ error: 'Этот email уже занят другим пользователем' }, { status: 400 })
    }
    return apiErrorResponse(e)
  }
}

// DELETE /api/admin/users/:userId — removes the user account entirely.
//
// - A coach can't delete themselves (no path back into the app otherwise).
// - Deleting a COACH who still has athletes attached first detaches them
//   (coachId -> null) rather than failing outright — no training data is
//   touched, the athlete just becomes unassigned until another coach claims
//   them. (AthleteProfile.coachId has no cascade, so without this the delete
//   would hit a foreign-key error.)
// - Deleting an ATHLETE is destructive: their AthleteProfile — and, via
//   schema cascade, every Cycle/Microcycle/Workout/ExerciseEntry/SetEntry and
//   Athlete1RM under it — is permanently deleted along with the account. The
//   client is expected to have already confirmed this in plain language
//   before calling this route; nothing here double-checks that.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()
    if (params.userId === coach.id) {
      return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 400 })
    }

    const target = await prisma.user.findUnique({ where: { id: params.userId } })
    if (!target) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
    }

    if (target.role === 'COACH') {
      await prisma.athleteProfile.updateMany({
        where: { coachId: target.id },
        data: { coachId: null },
      })
    }

    await prisma.user.delete({ where: { id: params.userId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
