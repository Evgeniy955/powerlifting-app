import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { buildGymPlanPdf, type PdfPlan } from '@/lib/gymPlanPdf'

// GET /api/gym/plans/:planId/export — streams the whole plan as a PDF
// (every week, training day, exercise and set). Same access rule as the
// rest of a gym plan: coach can export any of their clients' plans, the
// client can export their own. Mirrors /api/cycles/:cycleId/export on the
// powerlifting side, but PDF instead of Excel since gym mode has no
// spreadsheet this replaced.
export async function GET(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    const user = await requireUser()
    const { planId } = await params

    const plan = await prisma.gymPlan.findUnique({
      where: { id: planId },
      include: {
        client: { include: { user: true } },
        weeksData: {
          orderBy: { weekNumber: 'asc' },
          include: {
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
        },
      },
    })
    if (!plan) {
      return NextResponse.json({ error: 'План не найден' }, { status: 404 })
    }
    await assertGymClientAccessible(plan.clientId, user)

    const clientName = plan.client.displayName ?? plan.client.user?.name ?? 'Клиент'

    const pdfPlan: PdfPlan = {
      name: plan.name,
      clientName,
      startDate: plan.startDate,
      weeks: plan.weeksData.map((week) => ({
        weekNumber: week.weekNumber,
        workouts: week.workouts.map((workout) => ({
          dayNumber: workout.dayNumber,
          scheduledDate: workout.scheduledDate,
          exercises: workout.entries.map((entry) => ({
            name: entry.exercise.name,
            oneRepMax: entry.oneRepMax,
            sets: entry.sets.map((set) => ({ setNumber: set.setNumber, weight: set.weight, reps: set.reps })),
          })),
        })),
      })),
    }

    const buffer = buildGymPlanPdf(pdfPlan)
    const fileName = `${plan.name.replace(/[^\w\-]+/g, '_')}.pdf`

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
