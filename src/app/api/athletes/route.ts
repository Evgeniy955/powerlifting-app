import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'

// The powerlifting "total" — classic squat, paused bench, classic deadlift.
// Matched by exact ExerciseCatalog name rather than a hardcoded id, so it
// still works after a reseed (new uuids) as long as the names stay the same.
//
// Deadlift is "Тяга классика", not the generic seeded "Становая тяга" — the
// coach's actual training log never uses that name (checked: zero Athlete1RM
// rows reference it, for any athlete). "Тяга классика" is the one they
// actually log against, the same way "Приседание" (vs. "Приседание сумо") is
// the classic-stance squat.
const MAIN_LIFT_NAMES = {
  squat: 'Приседание',
  bench: 'Жим лежа с паузой',
  deadlift: 'Тяга классика',
} as const

// GET /api/athletes — list athletes attached to the signed-in coach, each with
// their current best (Athlete1RM) in the three total lifts, plus the summed
// total if all three are set.
export async function GET() {
  try {
    const coach = await requireCoach()
    const athletes = await prisma.athleteProfile.findMany({
      where: { coachId: coach.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const mainLiftExercises = await prisma.exerciseCatalog.findMany({
      where: { name: { in: Object.values(MAIN_LIFT_NAMES) } },
      select: { id: true, name: true },
    })
    const liftIdByName = new Map(mainLiftExercises.map((e) => [e.name, e.id]))
    const liftIds = mainLiftExercises.map((e) => e.id)

    const oneRepMaxes =
      athletes.length && liftIds.length
        ? await prisma.athlete1RM.findMany({
            where: { athleteId: { in: athletes.map((a) => a.id) }, exerciseId: { in: liftIds } },
            select: { athleteId: true, exerciseId: true, value: true },
          })
        : []
    const valueByAthleteAndExercise = new Map<string, number>()
    for (const rm of oneRepMaxes) {
      valueByAthleteAndExercise.set(`${rm.athleteId}:${rm.exerciseId}`, rm.value)
    }

    const squatId = liftIdByName.get(MAIN_LIFT_NAMES.squat) ?? null
    const benchId = liftIdByName.get(MAIN_LIFT_NAMES.bench) ?? null
    const deadliftId = liftIdByName.get(MAIN_LIFT_NAMES.deadlift) ?? null

    const withMainLifts = athletes.map((athlete) => {
      const lookup = (exerciseId: string | null) =>
        exerciseId ? (valueByAthleteAndExercise.get(`${athlete.id}:${exerciseId}`) ?? null) : null

      const squat = lookup(squatId)
      const bench = lookup(benchId)
      const deadlift = lookup(deadliftId)
      const total =
        squat !== null && bench !== null && deadlift !== null ? squat + bench + deadlift : null

      return { ...athlete, mainLifts: { squat, bench, deadlift, total } }
    })

    return NextResponse.json(withMainLifts)
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
