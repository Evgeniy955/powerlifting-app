import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, History as HistoryIcon } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { describeChangeLog } from '@/lib/changeLog'

const KIND_TONE = {
  'set-updated': 'moderate',
  'set-removed': 'danger',
  'exercise-added': 'low',
  'exercise-removed': 'danger',
} as const

// Coach-facing (also viewable by the athlete themself) audit trail of every
// edit made to THIS plan specifically — scoped by cycleId rather than the
// whole athlete, so a coach juggling several plans for one athlete isn't
// stuck guessing which plan a given change happened in. Durable counterpart
// to the InviteAthleteButton-adjacent email digest (lib/email.ts), which is
// a process-memory buffer that's lost on restart and can't be looked back at.
//
// Viewing this page as the COACH marks every currently-unseen entry (for
// this cycle) as seen — same "highlight once, then clear" pattern as the
// per-workout highlight in WorkoutView. Computed from a snapshot taken
// before the update, so this exact load still shows the "новое" badge on
// what was unseen a moment ago.
export default async function CycleHistoryPage({
  params,
}: {
  params: { cycleId: string }
}) {
  const user = await requireUser()

  const cycle = await prisma.cycle.findUnique({
    where: { id: params.cycleId },
    include: { athlete: { include: { user: { select: { name: true, email: true } } } } },
  })
  if (!cycle) redirect('/athletes')

  const owns =
    user.role === 'COACH' ? cycle.athlete.coachId === user.id : cycle.athlete.userId === user.id
  if (!owns) redirect('/')

  const entries = await prisma.changeLog.findMany({
    where: { cycleId: cycle.id },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })

  const unseenIds = user.role === 'COACH' ? entries.filter((e) => !e.seenByCoach).map((e) => e.id) : []
  if (unseenIds.length > 0) {
    await prisma.changeLog.updateMany({
      where: { id: { in: unseenIds } },
      data: { seenByCoach: true },
    })
  }
  const isNew = new Set(unseenIds)

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-3xl">
      <Link
        href={`/cycles/${cycle.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {cycle.name}
      </Link>

      <h1 className="font-display text-xl uppercase tracking-wide">История изменений</h1>

      {entries.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          title="Изменений пока нет"
          description="Здесь появится всё, что атлет поменял в этом плане: вес, повторы, добавленные и удалённые упражнения."
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
                <p className="text-sm">{describeChangeLog(entry)}</p>
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
                  {entry.kind === 'exercise-added' && 'Упражнение добавлено'}
                  {entry.kind === 'exercise-removed' && 'Упражнение удалено'}
                </Badge>
                {entry.workoutId && (
                  <Link
                    href={`/workout/${entry.workoutId}`}
                    className="text-xs text-accent hover:underline"
                  >
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
