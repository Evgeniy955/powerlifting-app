import Link from 'next/link'
import { CalendarX, FileUp, UserRound } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { assertGymClientAccessible } from '@/lib/authorization'
import { GymPlanActions } from '@/components/GymPlanActions'
import { GymPlansList } from '@/components/GymPlansList'
import { EmptyState } from '@/components/EmptyState'
import { buttonVariants } from '@/components/ui'
import { wardNoun } from '@/lib/gender'

export default async function GymPlansPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId: clientId } = await params
  const user = await requireUser()
  const client = await assertGymClientAccessible(clientId, user)
  const plans = await prisma.gymPlan.findMany({
    where: { clientId },
    orderBy: { startDate: 'desc' },
    include: { weeksData: { select: { id: true } } },
  })
  // No displayName is the only case wardNoun can't guess a gender for — falls
  // back to the masculine "Подопечный" there, same as elsewhere.
  const clientName = client.displayName ?? client.userId ?? wardNoun(null)

  return (
    <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-4xl space-y-5 bg-bg p-6 text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/gym" className="text-sm text-text-secondary">← Тренажёрный зал</Link>
          <h1 className="font-display text-xl uppercase">Планы — {clientName}</h1>
        </div>
        {/* Profile edit (health data, assessments) and plan import are coach
            tools — a client viewing their own plans page has no business
            editing their own intake profile or importing a plan for
            themselves, so both are hidden outside the COACH role. */}
        {user.role === 'COACH' && (
          <div className="flex gap-2">
            <Link href={`/gym/athletes/${clientId}/profile`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <UserRound className="h-4 w-4" /> {wardNoun(client.displayName)}
            </Link>
            <Link href={`/gym/athletes/${clientId}/import`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <FileUp className="h-4 w-4" /> Импорт
            </Link>
            <GymPlanActions clientId={clientId} />
          </div>
        )}
      </div>

      {plans.length === 0 && (
        <EmptyState
          icon={CalendarX}
          title="Планов пока нет"
          description="Создай план или импортируй его из DOCX/PDF."
        />
      )}

      {plans.length > 0 && (
        <GymPlansList
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            startDate: plan.startDate.toISOString(),
            weeks: plan.weeks,
            weekCount: plan.weeksData.length,
          }))}
          canManage={user.role === 'COACH'}
        />
      )}
    </main>
  )
}
