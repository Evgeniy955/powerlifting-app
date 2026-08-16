import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'
import { assertAthleteBelongsToCoach } from '@/lib/authorization'

const DAY_MS = 24 * 60 * 60 * 1000

// POST /api/athletes/:athleteId/plans { name, startDate, weeks?, daysPerWeek }
// Creates an empty plan skeleton — Cycle -> Microcycle(s) -> Workout(s), no
// exercises yet. Days start empty and get filled in per-day afterward via the
// existing "Добавить упражнение" flow on the workout page, same as any ad-hoc
// cycle today. scheduledDate is assigned as consecutive days from `startDate`
// (day 1..daysPerWeek each week) — a deliberate v1 simplification since there's
// no per-workout date editor to fix a bad guess later.
export async function POST(req: NextRequest, { params }: { params: { athleteId: string } }) {
  try {
    const coach = await requireCoach()
    await assertAthleteBelongsToCoach(params.athleteId, coach.id)

    const body = (await req.json()) as {
      name: string
      startDate: string
      weeks?: number
      daysPerWeek: number
    }
    const weeks = body.weeks ?? 12
    const { daysPerWeek } = body

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Название плана обязательно' }, { status: 400 })
    }
    if (!body.startDate) {
      return NextResponse.json({ error: 'Дата начала обязательна' }, { status: 400 })
    }
    if (!(weeks > 0 && weeks <= 52)) {
      return NextResponse.json({ error: 'Количество недель: 1-52' }, { status: 400 })
    }
    if (!(daysPerWeek > 0 && daysPerWeek <= 7)) {
      return NextResponse.json({ error: 'Дней в неделю: 1-7' }, { status: 400 })
    }

    const startDate = new Date(body.startDate)

    const cycleId = await prisma.$transaction(async (tx) => {
      const cycle = await tx.cycle.create({
        data: { athleteId: params.athleteId, name: body.name.trim(), startDate, weeks },
      })

      for (let week = 1; week <= weeks; week++) {
        const microcycle = await tx.microcycle.create({
          data: { cycleId: cycle.id, weekNumber: week },
        })

        for (let day = 1; day <= daysPerWeek; day++) {
          const offsetDays = (week - 1) * 7 + (day - 1)
          await tx.workout.create({
            data: {
              microcycleId: microcycle.id,
              scheduledDate: new Date(startDate.getTime() + offsetDays * DAY_MS),
              dayNumber: day,
            },
          })
        }
      }

      return cycle.id
    })

    return NextResponse.json({ cycleId }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
