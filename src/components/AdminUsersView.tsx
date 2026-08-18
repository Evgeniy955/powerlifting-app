'use client'

import { useState } from 'react'
import { Badge, Card } from '@/components/ui'

export type AdminUser = {
  id: string
  email: string
  name: string | null
  role: string
  _count: { coachedAthletes: number }
}

type Props = {
  initialUsers: AdminUser[]
  currentUserId: string
}

// Coach-only role toggle list. No dedicated ADMIN role — this just flips
// COACH <-> ATHLETE, the API route (/api/admin/users/[userId]) blocks a coach
// from changing their own role, and this component additionally warns before
// demoting a coach who still has athletes attached (they'd lose access to
// them, though the AthleteProfile.coachId link itself is left intact — no data
// is deleted, promoting them back restores access).
export function AdminUsersView({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function changeRole(target: AdminUser, nextRole: 'COACH' | 'ATHLETE') {
    setError(null)

    if (nextRole === 'ATHLETE' && target._count.coachedAthletes > 0) {
      const ok = window.confirm(
        `У «${target.name ?? target.email}» ${target._count.coachedAthletes} ` +
          `атлет(ов). После смены роли на «Атлет» он потеряет к ним доступ ` +
          `(привязка в базе сохранится и восстановится, если роль вернуть). Продолжить?`
      )
      if (!ok) return
    }

    setPendingId(target.id)
    const res = await fetch(`/api/admin/users/${target.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось изменить роль')
      return
    }

    setUsers((prev) => prev.map((u) => (u.id === target.id ? { ...u, role: nextRole } : u)))
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {users.map((u) => (
          <li key={u.id}>
            <Card padding="sm" className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name ?? u.email}</p>
                <p className="truncate text-xs text-text-secondary">{u.email}</p>
                {u.role === 'COACH' && u._count.coachedAthletes > 0 && (
                  <p className="text-xs text-text-secondary">
                    {u._count.coachedAthletes} атлет(ов)
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={u.role === 'COACH' ? 'accent' : 'neutral'}>
                  {u.role === 'COACH' ? 'Тренер' : 'Атлет'}
                </Badge>

                {u.id === currentUserId ? (
                  <span className="text-xs text-text-secondary">Это вы</span>
                ) : (
                  <button
                    type="button"
                    disabled={pendingId === u.id}
                    onClick={() => changeRole(u, u.role === 'COACH' ? 'ATHLETE' : 'COACH')}
                    className="text-xs text-accent transition-colors hover:underline disabled:opacity-50"
                  >
                    {pendingId === u.id
                      ? 'Сохраняем…'
                      : u.role === 'COACH'
                        ? 'Сделать атлетом'
                        : 'Сделать тренером'}
                  </button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
