import { AnalyticsView } from '@/components/AnalyticsView'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'

export default async function AthleteAnalyticsPage({
  params,
}: {
  params: { athleteId: string }
}) {
  const user = await requireUser()

  const athlete = await prisma.athleteProfile.findUnique({ where: { id: params.athleteId } })
  if (!athlete) redirect('/athletes')

  // Coach-only — same reasoning as the per-cycle "Аналитика мезоцикла" page.
  if (user.role !== 'COACH' || athlete.coachId !== user.id) redirect('/')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-2xl mx-auto space-y-4 lg:max-w-5xl">
      <h1 className="font-display text-xl uppercase tracking-wide">Аналитика</h1>
      <AnalyticsView athleteId={params.athleteId} role={user.role} />
    </main>
  )
}
