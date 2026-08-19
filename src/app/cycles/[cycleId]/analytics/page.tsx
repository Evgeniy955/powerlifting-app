import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { CycleAnalyticsView } from '@/components/CycleAnalyticsView'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// Whole-mesocycle analytics: per-week tonnage/КПШ/сред.вес/интенсивность table
// plus 4 line charts, optionally scoped to one exercise (e.g. "Приседания") —
// reproduces the source Excel per-movement summary sheet. Reachable from the
// cycle page (list of microcycles) and from any week's view.
export default async function CycleAnalyticsPage({ params }: { params: { cycleId: string } }) {
  const user = await requireUser()

  const cycle = await prisma.cycle.findUnique({
    where: { id: params.cycleId },
    include: { athlete: true },
  })
  if (!cycle) notFound()

  const owns =
    user.role === 'COACH' ? cycle.athlete.coachId === user.id : cycle.athlete.userId === user.id
  if (!owns) redirect('/')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-5xl">
      <div>
        <Link
          href={`/cycles/${cycle.id}`}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {cycle.name}
        </Link>
        <h1 className="font-display text-xl uppercase tracking-wide">Аналитика мезоцикла</h1>
      </div>

      <CycleAnalyticsView cycleId={cycle.id} totalWeeks={cycle.weeks} />
    </main>
  )
}
