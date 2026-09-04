import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymExportView, type GymExportDay } from '@/components/GymExportView'

// PDF export of a whole gym plan — a read-only mirror of /gym/plans/:planId
// rendered client-side to a PDF (html2canvas + jsPDF), same approach as
// /microcycle/:microcycleId/export on the powerlifting side, so the file
// actually looks like the app instead of a plain vector-text document.
export default async function GymPlanExportPage({ params }: { params: Promise<{ planId: string }> }) {
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
  if (!plan) notFound()

  await assertGymClientAccessible(plan.clientId, user)

  const clientName = plan.client.displayName ?? plan.client.user?.name ?? 'Клиент'

  const days: GymExportDay[] = plan.weeksData.flatMap((week) =>
    week.workouts.map((workout) => ({
      id: workout.id,
      weekNumber: week.weekNumber,
      dayNumber: workout.dayNumber,
      scheduledDate: workout.scheduledDate,
      exercises: workout.entries.map((entry) => ({
        id: entry.id,
        name: entry.exercise.name,
        oneRepMax: entry.oneRepMax,
        sets: entry.sets.map((set) => ({ weight: set.weight, reps: set.reps, toFailure: set.toFailure })),
      })),
    }))
  )

  return (
    <GymExportView
      backHref={`/gym/plans/${plan.id}`}
      backLabel={plan.name}
      heading={plan.name}
      meta={`начало ${plan.startDate.toISOString().slice(0, 10)} · ${plan.weeksData.length} нед.`}
      clientName={clientName}
      days={days}
      fileName={`${plan.name.replace(/[^\w\-]+/g, '_')}.pdf`}
    />
  )
}
