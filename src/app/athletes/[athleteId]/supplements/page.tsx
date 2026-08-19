import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { SupplementsView } from '@/components/SupplementsView'
import { athleteDisplayName } from '@/lib/athlete'

// Спортпит — an athlete's supplement-intake log. Reachable by the athlete
// themselves and by their coach (same ownership rule as /cycles), both of
// whom can manage entries — nothing here is athlete-write-only.
export default async function SupplementsPage({ params }: { params: { athleteId: string } }) {
  const user = await requireUser()

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: params.athleteId },
    include: {
      user: { select: { name: true, email: true } },
      supplements: { orderBy: { startDate: 'desc' } },
    },
  })
  if (!athlete) redirect('/athletes')

  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div>
        <h1 className="font-display text-xl uppercase tracking-wide">
          Спортпит — {athleteDisplayName(athlete)}
        </h1>
        <p className="text-sm text-text-secondary">
          Что принимает и когда — с датой начала и окончания приёма.
        </p>
      </div>

      <SupplementsView
        athleteId={athlete.id}
        initialSupplements={athlete.supplements.map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.startDate.toISOString(),
          endDate: s.endDate ? s.endDate.toISOString() : null,
          notes: s.notes,
        }))}
        canManage
      />
    </main>
  )
}
