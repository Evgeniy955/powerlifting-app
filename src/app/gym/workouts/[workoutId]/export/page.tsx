import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymExportView, type GymExportDay } from '@/components/GymExportView'

// PDF export of a single training day — read-only mirror of
// /gym/workouts/:workoutId rendered client-side to a PDF (html2canvas +
// jsPDF).
export default async function GymWorkoutExportPage({ params }: { params: Promise<{ workoutId: string }> }) {
  const user = await requireUser()
  const { workoutId } = await params

  const workout = await prisma.gymWorkout.findUnique({
    where: { id: workoutId },
    include: {
      week: { include: { plan: { include: { client: { include: { user: true } } } } } },
      entries: {
        orderBy: { orderIndex: 'asc' },
        include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
      },
    },
  })
  if (!workout) notFound()

  await assertGymClientAccessible(workout.week.plan.clientId, user)

  const clientName = workout.week.plan.client.displayName ?? workout.week.plan.client.user?.name ?? 'Клиент'

  const days: GymExportDay[] = [
    {
      id: workout.id,
      weekNumber: workout.week.weekNumber,
      dayNumber: workout.dayNumber,
      scheduledDate: workout.scheduledDate,
      exercises: workout.entries.map((entry) => ({
        id: entry.id,
        name: entry.exercise.name,
        oneRepMax: entry.oneRepMax,
        sets: entry.sets.map((set) => ({ weight: set.weight, reps: set.reps, toFailure: set.toFailure })),
      })),
    },
  ]

  return (
    <GymExportView
      backHref={`/gym/workouts/${workout.id}`}
      backLabel={`Неделя ${workout.week.weekNumber}, День ${workout.dayNumber}`}
      heading={`${workout.week.plan.name} — Неделя ${workout.week.weekNumber}, День ${workout.dayNumber}`}
      clientName={clientName}
      days={days}
      fileName={`${workout.week.plan.name.replace(/[^\w\-]+/g, '_')}_w${workout.week.weekNumber}d${workout.dayNumber}.pdf`}
    />
  )
}
