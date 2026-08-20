import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// POST /api/athletes/:athleteId/plans { name, startDate, weeks?, weekdays? }
// Creates an empty plan skeleton — Cycle -> Microcycle(s) -> Workout(s), no
// exercises yet. Days start empty and get filled in per-day afterward via the
// existing "Добавить упражнение" flow on the workout page, same as any ad-hoc
// cycle today.
//
// `weekdays` is which days of the week the athlete actually trains — e.g. Mon/
// Wed/Fri (`[1, 3, 5]`) or Tue/Thu/Sat (`[2, 4, 6]`) — using JS
// Date.getUTCDay() numbering (0 = Sunday), the same convention WeekDayTable
// already uses for its weekday labels. Optional — omitted (or empty) falls
// back to Пн/Ср/Пт, since the periodization "+" flow creates a mesocycle from
// just a name/duration without asking for weekdays up front; the coach can
// still adjust which days have workouts from the cycle's own page afterward.
// Each Microcycle's 7-day window (days (week-1)*7 .. (week-1)*7+6 from
// startDate) is scanned once for calendar days whose weekday is in that set,
// so scheduledDate always lands on a real matching weekday instead of just
// being consecutive days from start — a week always contributes exactly
// weekdays.length workouts since every 7-day span contains each weekday
// exactly once, whatever startDate itself falls on.
//
// Uses a batched (non-interactive) $transaction([...]) of createMany calls with
// ids generated up front in JS, rather than an interactive transaction with one
// create() per microcycle/workout — with weeks up to 52 and up to 7
// weekdays/week that's up to ~416 sequential round trips, which reliably
// breaks against Supabase's pooled/pgbouncer connection ("Transaction API
// error: Transaction not found") once the pooler recycles the connection
// mid-transaction. See the same fix in import/confirm/route.ts for more detail.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const body = (await req.json()) as {
      name: string
      startDate: string
      weeks?: number
      // Optional — the periodization "+" flow creates a mesocycle from just a
      // name/duration (no weekday picker), so this falls back to Пн/Ср/Пт
      // when omitted or empty rather than rejecting the request.
      weekdays?: number[]
      // Optional — lets a plan be created already attached to a Stage in the
      // periodization hierarchy, instead of always landing "unassigned".
      stageId?: string
      // Optional — the periodization "+" flow tags the plan with its
      // Мезоцикл preset right at creation instead of a separate PATCH.
      mesocycleType?: string
    }
    const weeks = body.weeks ?? 12
    const weekdaysInput = Array.from(new Set(body.weekdays ?? []))
    const weekdays = weekdaysInput.length > 0 ? weekdaysInput : [1, 3, 5]

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название плана обязательно' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    if (!(weeks > 0 && weeks <= 52)) {
      return NextResponse.json({ error: 'Количество недель: 1-52' }, { status: 400 })
    }
    if (weekdays.some((d) => d < 0 || d > 6)) {
      return NextResponse.json({ error: 'Некорректные дни тренировок' }, { status: 400 })
    }
    if (body.stageId) {
      const stage = await prisma.stage.findUnique({
        where: { id: body.stageId },
        include: { period: true },
      })
      if (!stage || stage.period.athleteId !== params.athleteId) {
        return NextResponse.json({ error: 'Этап не найден' }, { status: 400 })
      }
    }

    const startDate = new Date(body.startDate)
    const cycleId = randomUUID()

    const microcyclesData: { id: string; cycleId: string; weekNumber: number }[] = []
    const workoutsData: {
      id: string
      microcycleId: string
      scheduledDate: Date
      dayNumber: number
    }[] = []

    for (let week = 1; week <= weeks; week++) {
      const microcycleId = randomUUID()
      microcyclesData.push({ id: microcycleId, cycleId, weekNumber: week })

      let dayNumber = 1
      for (let offset = 0; offset < 7; offset++) {
        const date = new Date(startDate.getTime() + ((week - 1) * 7 + offset) * DAY_MS)
        if (!weekdays.includes(date.getUTCDay())) continue
        workoutsData.push({
          id: randomUUID(),
          microcycleId,
          scheduledDate: date,
          dayNumber: dayNumber++,
        })
      }
    }

    await prisma.$transaction([
      prisma.cycle.create({
        data: {
          id: cycleId,
          athleteId: params.athleteId,
          name: body.name.trim(),
          startDate,
          weeks,
          stageId: body.stageId ?? null,
          mesocycleType: body.mesocycleType?.trim() || null,
        },
      }),
      prisma.microcycle.createMany({ data: microcyclesData }),
      prisma.workout.createMany({ data: workoutsData }),
    ])

    return NextResponse.json({ cycleId }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
