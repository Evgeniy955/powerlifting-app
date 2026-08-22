'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArchiveX, ArrowLeft } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { DeleteAthleteButton } from '@/components/DeleteAthleteButton'
import { RestoreAthleteButton } from '@/components/RestoreAthleteButton'
import { LoadingIndicator } from '@/components/LoadingIndicator'
import { athleteDisplayName } from '@/lib/athlete'

type ArchivedAthlete = {
  id: string
  userId: string | null
  displayName: string | null
  inviteEmail: string | null
  user: { id: string; name: string | null; email: string; image: string | null } | null
  planCount: number
}

// Coach-only. Holds athletes archived from the main roster (DeleteAthleteButton
// on /athletes archives instead of deleting outright when the athlete already
// has plans) — nothing here was destroyed, just hidden. Restore puts them
// back; delete-forever here is the real, permanent, unrecoverable action.
export default function ArchivedAthletesPage() {
  const [athletes, setAthletes] = useState<ArchivedAthlete[] | null>(null)

  async function load() {
    const res = await fetch('/api/athletes/archive')
    if (res.ok) setAthletes(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <div className="flex items-center gap-2">
        <Link
          href="/athletes"
          className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          aria-label="Назад к списку атлетов"
          title="Назад к списку атлетов"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-xl uppercase tracking-wide">Архив атлетов</h1>
      </div>

      {athletes === null && <LoadingIndicator label="Загружаем архив" />}

      {athletes !== null && athletes.length === 0 && (
        <EmptyState
          icon={ArchiveX}
          title="Архив пуст"
          description="Сюда попадают атлеты с планами тренировок, удалённые со страницы «Мои спортсмены»."
        />
      )}

      {athletes !== null && athletes.length > 0 && (
        <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {athletes.map((a) => (
            <li key={a.id}>
              <Card padding="md" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-medium">{athleteDisplayName(a)}</p>
                  <Badge tone="neutral">{a.planCount} {a.planCount === 1 ? 'план' : 'планов'}</Badge>
                </div>

                <div className="flex items-center gap-3">
                  <RestoreAthleteButton athleteId={a.id} athleteName={athleteDisplayName(a)} onDone={load} />
                  <DeleteAthleteButton
                    athleteId={a.id}
                    athleteName={athleteDisplayName(a)}
                    accepted={!!a.userId}
                    mode="archive"
                    onDone={load}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
