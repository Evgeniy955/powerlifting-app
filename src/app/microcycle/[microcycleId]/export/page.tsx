import { getMicrocycleForDisplay, getRpeTable } from '@/lib/workout'
import { requireUser } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { isMicrocycleVisibleToAthlete } from '@/lib/weekAccess'
import { MicrocycleExportView } from '@/components/MicrocycleExportView'

// Print/PDF export of a whole microcycle — a stripped-down, non-interactive
// mirror of /microcycle/[microcycleId] meant to be turned into a PDF via the
// browser's own "Print > Save as PDF", not a server-rendered file. Same
// access rules as the live week page (ownership + athlete current/past-only
// visibility) since it exposes the same underlying data, just laid out for
// paper instead of editing.
export default async function MicrocycleExportPage({
  params,
}: {
  params: { microcycleId: string }
}) {
  const user = await requireUser()

  const [microcycle, rpeTable] = await Promise.all([
    getMicrocycleForDisplay(params.microcycleId),
    getRpeTable(),
  ])
  if (!microcycle) notFound()

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: microcycle.athleteId },
    include: { user: true },
  })
  if (!athlete) notFound()
  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  if (
    user.role === 'ATHLETE' &&
    !isMicrocycleVisibleToAthlete(microcycle.cycleStartDate, microcycle.weekNumber)
  ) {
    redirect(`/cycles/${microcycle.cycleId}`)
  }

  const athleteName = athlete.user?.name ?? athlete.displayName ?? null

  return (
    <MicrocycleExportView
      cycleId={microcycle.cycleId}
      cycleName={microcycle.cycleName}
      weekNumber={microcycle.weekNumber}
      athleteName={athleteName}
      workouts={microcycle.workouts}
      rpeTable={rpeTable}
    />
  )
}
