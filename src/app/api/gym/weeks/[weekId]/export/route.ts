import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { buildGymWeekPdf, type PdfWeekExport } from '@/lib/gymPlanPdf'

// GET /api/gym/weeks/:weekId/export — one microcycle as a standalone PDF
// (every training day, exercise and set in that week). Same access rule as
// the rest of a gym plan: coach can export any of their clients' weeks, the
// client can export their own. Mirrors /api/gym/plans/:planId/export, just
// scoped to a single week instead of the whole plan.
export async function GET(_req: Request, { params }: { params: Promise<{ weekId: string }> }) {
  try {
    const user = await requireUser()
    const { weekId } = await params

    const week = await prisma.gymWeek.findUnique({
      where: { id: weekId },
      include: {
        plan: { include: { client: { include: { user: true } } } },
        workouts: {
          orderBy: { dayNumber: 'asc' },
          include: {
            entries: {
              orderBy: { orderIndex: 'asc' },
              include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
            },
          },
        },
      },
    })
    if (!week) {
      return NextResponse.json({ error: 'Микроцикл не найден' }, { status: 404 })
    }
    await assertGymClientAccessible(week.plan.clientId, user)

    const clientName = week.plan.client.displayName ?? week.plan.client.user?.name ?? 'Клиент'

    const pdfWeek: PdfWeekExport = {
      planName: week.plan.name,
      clientName,
      weekNumber: week.weekNumber,
      workouts: week.workouts.map((workout) => ({
        dayNumber: workout.dayNumber,
        scheduledDate: workout.scheduledDate,
        exercises: workout.entries.map((entry) => ({
          name: entry.exercise.name,
          oneRepMax: entry.oneRepMax,
          sets: entry.sets.map((set) => ({
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            toFailure: set.toFailure,
          })),
        })),
      })),
    }

    const buffer = buildGymWeekPdf(pdfWeek)
    const fileName = `${week.plan.name.replace(/[^\w\-]+/g, '_')}_week${week.weekNumber}.pdf`

    // Buffer's ArrayBufferLike generic doesn't line up with fetch's
    // BodyInit typing on this @types/node — a plain Uint8Array view over
    // the same bytes satisfies it without copying.
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
