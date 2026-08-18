'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { Badge, Button, Card, Input } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { InviteAthleteButton } from '@/components/InviteAthleteButton'
import { LoadingIndicator } from '@/components/LoadingIndicator'
import { athleteDisplayName } from '@/lib/athlete'

type Athlete = {
  id: string
  userId: string | null
  displayName: string | null
  inviteEmail: string | null
  inviteStatus: 'NONE' | 'PENDING' | 'ACCEPTED'
  invitedAt: string | null
  user: { id: string; name: string | null; email: string; image: string | null } | null
}

// Coach-only screen. Three-step workflow: create the athlete's page (email +
// optional display name, no signup required yet) -> build their plan -> send
// the invite email (InviteAthleteButton, shown until they've accepted).
export default function AthletesPage() {
  // `null` = initial list hasn't come back from the server yet (shows the loading
  // skeleton below); `[]` = loaded, genuinely no athletes yet (shows EmptyState).
  // Kept distinct so a background refresh (after adding/inviting an athlete)
  // doesn't blank the list back to a skeleton — only the very first load does.
  const [athletes, setAthletes] = useState<Athlete[] | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/athletes')
    if (res.ok) setAthletes(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAdd() {
    setError(null)
    const res = await fetch('/api/athletes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName: displayName || undefined }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось добавить')
      return
    }
    setEmail('')
    setDisplayName('')
    load()
  }

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-bg text-text-primary p-6 max-w-md mx-auto space-y-4 lg:max-w-4xl">
      <h1 className="font-display text-xl uppercase tracking-wide">Мои спортсмены</h1>

      {athletes === null && <LoadingIndicator label="Загружаем атлетов" />}

      {athletes !== null && athletes.length === 0 && (
        <EmptyState
          icon={Users}
          title="Атлетов пока нет"
          description="Создай страницу атлета по email — регистрация не обязательна, пригласить можно позже."
        />
      )}

      {/* Mobile: stacked list. Desktop: card grid so a coach scanning several
          athletes doesn't have to scroll through a single narrow column. */}
      {athletes !== null && athletes.length > 0 && (
        <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {athletes.map((a) => (
            <li key={a.id}>
              <Card padding="sm" className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p>{athleteDisplayName(a)}</p>
                  {a.inviteStatus === 'PENDING' && <Badge tone="moderate">Приглашение отправлено</Badge>}
                  {a.inviteStatus === 'NONE' && <Badge tone="neutral">Не приглашён</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <a href={`/athletes/${a.id}/cycles`} className="text-accent hover:underline">
                    Циклы
                  </a>
                  <a href={`/athletes/${a.id}/analytics`} className="text-accent hover:underline">
                    Аналитика
                  </a>
                  <a href={`/api/athletes/${a.id}/export`} className="text-accent hover:underline">
                    Экспорт в Excel
                  </a>
                  <a href={`/athletes/${a.id}/import`} className="text-accent hover:underline">
                    Импорт из Excel
                  </a>
                </div>
                {!a.userId && (
                  <InviteAthleteButton athleteId={a.id} onSent={load} />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card padding="sm" className="space-y-2 lg:max-w-md">
        <p className="text-sm text-text-secondary">Создать страницу атлета</p>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="athlete@example.com"
          className="w-full"
        />
        <div className="flex gap-2">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Имя (необязательно)"
            className="flex-1"
          />
          <Button onClick={handleAdd} size="sm">
            Создать
          </Button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </Card>
    </main>
  )
}
