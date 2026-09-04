import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymExportView, type GymExportDay } from '@/components/GymExportView'

// PDF export of a single microcycle ("Неделя") — read-only mirror of
// /gym/weeks/:weekId rendered client-side to a PDF (html2canvas + jsPDF).
export default async function GymWeekExportPage({ params }: { params: Promise<{ weekId: string }> }) {
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
  if (!week) notFound()

  await assertGymClientAccessible(week.plan.clientId, user)

  const clientName = week.plan.client.displayName ?? week.plan.client.user?.name ?? 'Клиент'

  const days: GymExportDay[] = week.workouts.map((workout) => ({
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

  return (
    <GymExportView
      backHref={`/gym/weeks/${week.id}`}
      backLabel={`Неделя ${week.weekNumber}`}
      heading={`${week.plan.name} — Неделя ${week.weekNumber}`}
      clientName={clientName}
      days={days}
      fileName={`${week.plan.name.replace(/[^\w\-]+/g, '_')}_week${week.weekNumber}.pdf`}
    />
  )
}
