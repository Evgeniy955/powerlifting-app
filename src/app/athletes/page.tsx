'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive, FileDown, FileUp, Pill, Users } from 'lucide-react'
import { Badge, Button, Card, Input } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { DeleteAthleteButton } from '@/components/DeleteAthleteButton'
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
  // Whether this athlete has at least one plan (Cycle) — decides whether the
  // delete button archives (reversible) or removes them outright.
  hasPlans: boolean
  // Current best (Athlete1RM) in the three total lifts — classic squat, paused
  // bench, classic deadlift — plus the summed total if all three are set.
  mainLifts: {
    squat: number | null
    bench: number | null
    deadlift: number | null
    total: number | null
  }
}

// Coach-only screen. Three-step workflow: create the athlete's page (email +
// optional display name, no signup required yet) -> build their plan -> send
// the invite email (InviteAthleteButton, shown until they've accepted).
export default function AthletesPage() {
  const router = useRouter()
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-xl uppercase tracking-wide">Мои спортсмены</h1>
        <Link
          href="/athletes/archive"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <Archive className="h-3.5 w-3.5" />
          Архив
        </Link>
      </div>

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
              <Card
                padding="md"
                role="link"
                tabIndex={0}
                aria-label={`Открыть циклы: ${athleteDisplayName(a)}`}
                onClick={() => router.push(`/athletes/${a.id}/cycles`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    router.push(`/athletes/${a.id}/cycles`)
                  }
                }}
                className="cursor-pointer space-y-3 transition-transform hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-medium">{athleteDisplayName(a)}</p>
                  {a.inviteStatus === 'PENDING' && <Badge tone="moderate">Приглашение отправлено</Badge>}
                  {a.inviteStatus === 'NONE' && <Badge tone="neutral">Не приглашён</Badge>}
                </div>

                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                  <span className="text-text-secondary">Присед</span>
                  <span className="font-display tracking-wide">
                    {a.mainLifts.squat ?? '—'} {a.mainLifts.squat !== null && 'кг'}
                  </span>

                  <span className="text-text-secondary">Жим (пауза)</span>
                  <span className="font-display tracking-wide">
                    {a.mainLifts.bench ?? '—'} {a.mainLifts.bench !== null && 'кг'}
                  </span>

                  <span className="text-text-secondary">Тяга</span>
                  <span className="font-display tracking-wide">
                    {a.mainLifts.deadlift ?? '—'} {a.mainLifts.deadlift !== null && 'кг'}
                  </span>

                  <span className="text-text-secondary font-medium">Сумма</span>
                  <span className="font-display font-bold tracking-wide text-accent">
                    {a.mainLifts.total ?? '—'} {a.mainLifts.total !== null && 'кг'}
                  </span>
                </div>

                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  {/* No athlete-wide analytics shortcut here on purpose — analytics
                      is scoped to a training cycle ("Аналитика мезоцикла" on the
                      cycle/microcycle pages), reached via Циклы below, not a
                      standalone per-athlete view. */}
                  <a
                    href={`/api/athletes/${a.id}/export`}
                    title="Экспорт в Excel"
                    aria-label="Экспорт в Excel"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-card transition-transform hover:scale-110 hover:brightness-110"
                  >
                    <FileDown className="h-4 w-4" />
                  </a>
                  <a
                    href={`/athletes/${a.id}/import`}
                    title="Импорт из Excel"
                    aria-label="Импорт из Excel"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow-card transition-transform hover:scale-110 hover:brightness-110"
                  >
                    <FileUp className="h-4 w-4" />
                  </a>
                  <a
                    href={`/athletes/${a.id}/supplements`}
                    title="Спортпит"
                    aria-label="Спортпит"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white shadow-card transition-transform hover:scale-110 hover:brightness-110"
                  >
                    <Pill className="h-4 w-4" />
                  </a>
                  <DeleteAthleteButton
                    athleteId={a.id}
                    athleteName={athleteDisplayName(a)}
                    accepted={!!a.userId}
                    hasPlans={a.hasPlans}
                    onDone={load}
                  />
                </div>
                {!a.userId && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <InviteAthleteButton athleteId={a.id} inviteEmail={a.inviteEmail} onSent={load} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex justify-center border-t border-border pt-6">
        <Card padding="sm" className="w-full space-y-2 lg:max-w-md">
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
      </div>
    </main>
  )
}
