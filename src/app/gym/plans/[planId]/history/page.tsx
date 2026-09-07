import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, History as HistoryIcon } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { describeGymChangeLog } from '@/lib/gymChangeLog'

const KIND_TONE = {
  'set-updated': 'moderate',
  'set-removed': 'danger',
} as const

// Gym counterpart to cycles/[cycleId]/history — coach-facing (also
// viewable by the client themself) audit trail of every edit made to THIS
// plan specifically, scoped by planId rather than the whole client. Only
// ever shows "set-updated"/"set-removed" entries — a client can't add,
// replace, or remove exercises, so those kinds never occur here (see
// GymWorkoutEditor's canEdit vs canManageExercises split).
//
// Viewing this page as the COACH marks every currently-unseen entry (for
// this plan) as seen — same "highlight once, then clear" pattern as the
// powerlifting side's history page.
export default async function GymPlanHistoryPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params
  const user = await requireUser()

  const plan = await prisma.gymPlan.findUnique({
    where: { id: planId },
    include: { client: true },
  })
  if (!plan) redirect('/gym')

  const owns =
    user.role === 'COACH' ? plan.client.coachId === user.id : plan.client.userId === user.id
  if (!owns) redirect('/')

  const entries = await prisma.gymChangeLog.findMany({
    where: { planId: plan.id },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const unseenIds = user.role === 'COACH' ? entries.filter((e) => !e.seenByCoach).map((e) => e.id) : []
  if (unseenIds.length > 0) {
    await prisma.gymChangeLog.updateMany({
      where: { id: { in: unseenIds } },
      data: { seenByCoach: true },
    })
  }
  const isNew = new Set(unseenIds)

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-3xl">
      <Link
        href={`/gym/plans/${plan.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {plan.name}
      </Link>

      <h1 className="font-display text-xl uppercase tracking-wide">История изменений</h1>

      {entries.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          title="Изменений пока нет"
          description="Здесь появится всё, что подопечный поменял в этом плане: вес, повторы, удалённые подходы."
        />
      )}

      <ul className="animate-fade-in space-y-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Card
              padding="sm"
              className={`flex items-start justify-between gap-3 ${
                isNew.has(entry.id) ? 'border-l-4 border-l-accent bg-surface-2' : ''
              }`}
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm">{describeGymChangeLog(entry)}</p>
                <p className="text-xs text-text-secondary">
                  {entry.weekNumber !== null && entry.dayNumber !== null && (
                    <>
                      Неделя {entry.weekNumber} · День {entry.dayNumber}
                      {entry.workoutDate && ` (${entry.workoutDate.toISOString().slice(0, 10)})`}
                      {' · '}
                    </>
                  )}
                  {new Date(entry.createdAt).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {isNew.has(entry.id) && <Badge tone="accent">новое</Badge>}
                <Badge tone={KIND_TONE[entry.kind as keyof typeof KIND_TONE] ?? 'neutral'}>
                  {entry.kind === 'set-updated' && 'Изменено'}
                  {entry.kind === 'set-removed' && 'Подход удалён'}
                </Badge>
                {entry.workoutId && (
                  <Link href={`/gym/workouts/${entry.workoutId}`} className="text-xs text-accent hover:underline">
                    Открыть день
                  </Link>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  )
}
