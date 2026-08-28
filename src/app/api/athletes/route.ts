import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'

type MainLift = 'squat' | 'bench' | 'deadlift'

// The powerlifting "total" — classic squat, paused bench, classic deadlift.
// Matched by exact ExerciseCatalog name(s) rather than a hardcoded id, so it
// still works after a reseed (new uuids) as long as the names stay the same.
//
// Squat and bench are a single exercise name each, confirmed against the
// coach's actual catalog (not the seeded singular "Приседание", which turned
// out to not be what anyone's log actually uses — the coach's real entry is
// the plural "Приседания"). Deadlift covers every stance/style the coach
// might log a competition pull under — "Тяга", "Становая", "Становая тяга",
// "Тяга сумо" — and takes whichever of those has the higher best weight,
// since a lifter isn't necessarily pulling the same stance every cycle.
const MAIN_LIFT_NAMES: Record<MainLift, string[]> = {
  squat: ['Приседания'],
  bench: ['Жим лежа с паузой'],
  deadlift: ['Тяга', 'Становая', 'Становая тяга', 'Тяга сумо'],
}

const MAIN_LIFTS_WINDOW_MS = 36 * 7 * 24 * 60 * 60 * 1000

// GET /api/athletes — list *active* (non-archived) athletes attached to the
// signed-in coach, each with their best logged weight in the three total
// lifts over the last 36 weeks (not the manually-maintained Athlete1RM
// field, which can go stale — this reflects what they've actually lifted
// recently), plus the summed total if all three have a result in that
// window. Archived athletes live at GET /api/athletes/archive instead.
export async function GET() {
  try {
    const coach = await requireCoach()
    const athletes = await prisma.athleteProfile.findMany({
      where: { coachId: coach.id, archivedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { cycles: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const mainLiftExercises = await prisma.exerciseCatalog.findMany({
      where: { name: { in: Object.values(MAIN_LIFT_NAMES).flat() } },
      select: { id: true, name: true },
    })
    // Multiple ExerciseCatalog rows (e.g. every deadlift stance) can map to
    // the same MainLift key — aggregated below by key, not by exercise id, so
    // "best deadlift" is the higher of whichever stance the athlete actually
    // pulled more in.
    const liftKeyByExerciseId = new Map<string, MainLift>()
    for (const ex of mainLiftExercises) {
      const liftKey = (Object.entries(MAIN_LIFT_NAMES) as [MainLift, string[]][]).find(([, names]) =>
        names.includes(ex.name)
      )?.[0]
      if (liftKey) liftKeyByExerciseId.set(ex.id, liftKey)
    }
    const liftIds = mainLiftExercises.map((e) => e.id)

    const windowStart = new Date(Date.now() - MAIN_LIFTS_WINDOW_MS)

    const recentSets =
      athletes.length && liftIds.length
        ? await prisma.setEntry.findMany({
            where: {
              weight: { gt: 0 },
              exerciseEntry: {
                exerciseId: { in: liftIds },
                workout: {
                  scheduledDate: { gte: windowStart },
                  microcycle: { cycle: { athleteId: { in: athletes.map((a) => a.id) } } },
                },
              },
            },
            select: {
              weight: true,
              exerciseEntry: {
                select: {
                  exerciseId: true,
                  workout: {
                    select: { microcycle: { select: { cycle: { select: { athleteId: true } } } } },
                  },
                },
              },
            },
          })
        : []

    const bestByAthleteAndLift = new Map<string, number>()
    for (const set of recentSets) {
      const liftKey = liftKeyByExerciseId.get(set.exerciseEntry.exerciseId)
      if (!liftKey) continue
      const athleteId = set.exerciseEntry.workout.microcycle.cycle.athleteId
      const key = `${athleteId}:${liftKey}`
      const prev = bestByAthleteAndLift.get(key) ?? 0
      if (set.weight > prev) bestByAthleteAndLift.set(key, set.weight)
    }

    const withMainLifts = athletes.map((athlete) => {
      const lookup = (liftKey: MainLift) => bestByAthleteAndLift.get(`${athlete.id}:${liftKey}`) ?? null

      const squat = lookup('squat')
      const bench = lookup('bench')
      const deadlift = lookup('deadlift')
      const total =
        squat !== null && bench !== null && deadlift !== null ? squat + bench + deadlift : null

      const { _count, ...rest } = athlete
      return { ...rest, hasPlans: _count.cycles > 0, mainLifts: { squat, bench, deadlift, total } }
    })

    return NextResponse.json(withMainLifts)
  } catch (e) {
    return apiErrorResponse(e)
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
    return apiErrorResponse(e)
  }
}
