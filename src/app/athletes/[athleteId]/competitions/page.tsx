import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import { CompetitionsView } from '@/components/CompetitionsView'
import { athleteDisplayName } from '@/lib/athlete'

// Соревнования — an athlete's competition results log. Reachable by the
// athlete themselves and by their coach (same ownership rule as Спортпит/
// /cycles), both of whom can manage entries.
export default async function CompetitionsPage({ params }: { params: { athleteId: string } }) {
  const user = await requireUser()

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: params.athleteId },
    include: {
      user: { select: { name: true, email: true } },
      competitions: { orderBy: { date: 'desc' } },
    },
  })
  if (!athlete) redirect('/athletes')

  const owns = user.role === 'COACH' ? athlete.coachId === user.id : athlete.userId === user.id
  if (!owns) redirect('/')

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div>
        <h1 className="font-display text-xl uppercase tracking-wide">
          Соревнования — {athleteDisplayName(athlete)}
        </h1>
        <p className="text-sm text-text-secondary">
          Результаты выступлений: весовая категория, собственный вес и результаты в трёх движениях.
        </p>
      </div>

      <CompetitionsView
        athleteId={athlete.id}
        initialCompetitions={athlete.competitions.map((c) => ({
          id: c.id,
          name: c.name,
          date: c.date.toISOString(),
          weightClass: c.weightClass,
          bodyweight: c.bodyweight,
          squat: c.squat,
          bench: c.bench,
          deadlift: c.deadlift,
          place: c.place,
          notes: c.notes,
        }))}
        canManage
      />
    </main>
  )
}
