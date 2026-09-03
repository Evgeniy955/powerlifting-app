import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// POST /api/athletes/:athleteId/plans { name, startDate, weeks?, weekdays }
// Creates an empty plan skeleton — Cycle -> Microcycle(s) -> Workout(s), no
// exercises yet. Days start empty and get filled in per-day afterward via the
// existing "Добавить упражнение" flow on the workout page, same as any ad-hoc
// cycle today.
//
// `weekdays` is which days of the week the athlete actually trains — e.g. Mon/
// Wed/Fri (`[1, 3, 5]`) or Tue/Thu/Sat (`[2, 4, 6]`) — using JS
// Date.getUTCDay() numbering (0 = Sunday), the same convention WeekDayTable
// already uses for its weekday labels. Each Microcycle's 7-day window (days
// (week-1)*7 .. (week-1)*7+6 from startDate) is scanned once for calendar days
// whose weekday is in that set, so scheduledDate always lands on a real
// matching weekday instead of just being consecutive days from start — a
// week always contributes exactly weekdays.length workouts since every 7-day
// span contains each weekday exactly once, whatever startDate itself falls on.
//
// Uses a batched (non-interactive) $transaction([...]) of createMany calls with
// ids generated up front in JS, rather than an interactive transaction with one
// create() per microcycle/workout — with weeks up to 52 and up to 7
// weekdays/week that's up to ~416 sequential round trips, which reliably
// breaks against Supabase's pooled/pgbouncer connection ("Transaction API
// error: Transaction not found") once the pooler recycles the connection
// mid-transaction. See the same fix in import/confirm/route.ts for more detail.
export async function POST(req: NextRequest, props: { params: Promise<{ athleteId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const body = (await req.json()) as {
      name: string
      startDate: string
      weeks?: number
      weekdays: number[]
    }
    const weeks = body.weeks ?? 12
    const weekdays = Array.from(new Set(body.weekdays ?? []))

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название плана обязательно' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    if (!(weeks > 0 && weeks <= 52)) {
      return NextResponse.json({ error: 'Количество недель: 1-52' }, { status: 400 })
    }
    if (weekdays.length === 0 || weekdays.some((d) => d < 0 || d > 6)) {
      return NextResponse.json({ error: 'Выберите хотя бы один день тренировок' }, { status: 400 })
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

    // ISO weekday order (Monday=0 .. Sunday=6), so dayNumber always reflects
    // normal week order regardless of which weekday `startDate` itself falls
    // on — otherwise, e.g. a Saturday startDate would put Saturday's workout
    // at dayNumber 1 (it's the earliest date in that offset window) even
    // though Пн/Ср/Пт/Сб should read as day 1/2/3/4 in that order.
    const isoWeekday = (d: Date) => (d.getUTCDay() + 6) % 7

    for (let week = 1; week <= weeks; week++) {
      const microcycleId = randomUUID()
      microcyclesData.push({ id: microcycleId, cycleId, weekNumber: week })

      const weekDates: Date[] = []
      for (let offset = 0; offset < 7; offset++) {
        const date = new Date(startDate.getTime() + ((week - 1) * 7 + offset) * DAY_MS)
        if (weekdays.includes(date.getUTCDay())) weekDates.push(date)
      }
      weekDates.sort((a, b) => isoWeekday(a) - isoWeekday(b))

      weekDates.forEach((date, i) => {
        workoutsData.push({
          id: randomUUID(),
          microcycleId,
          scheduledDate: date,
          dayNumber: i + 1,
        })
      })
    }

    await prisma.$transaction([
      prisma.cycle.create({
        data: { id: cycleId, athleteId: params.athleteId, name: body.name.trim(), startDate, weeks },
      }),
      prisma.microcycle.createMany({ data: microcyclesData }),
      prisma.workout.createMany({ data: workoutsData }),
    ])

    return NextResponse.json({ cycleId }, { status: 201 })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
