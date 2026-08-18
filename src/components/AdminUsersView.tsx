'use client'

import { useState } from 'react'
import { Check, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { Badge, Card, Input } from '@/components/ui'

export type AdminUser = {
  id: string
  email: string
  name: string | null
  role: string
  _count: { coachedAthletes: number }
  athleteProfile: { id: string; inviteStatus: string; coachId: string | null } | null
}

// null/no profile and 'NONE' both mean "never actually invited by email" —
// e.g. self-registered, or attached to a coach without going through the
// invite flow.
function inviteBadge(u: AdminUser) {
  if (u.role !== 'ATHLETE') return null
  const status = u.athleteProfile?.inviteStatus ?? 'NONE'
  if (status === 'ACCEPTED') {
    return <Badge tone="accent">Приглашён — принял приглашение</Badge>
  }
  if (status === 'PENDING') {
    return <Badge tone="moderate">Приглашён — не принял приглашение</Badge>
  }
  return <Badge tone="neutral">Не приглашён</Badge>
}

type Props = {
  initialUsers: AdminUser[]
  currentUserId: string
}

// Coach-only user management: role toggle (already existed), plus editing
// name/email and deleting the account entirely.
//
// No dedicated ADMIN role — the API route (/api/admin/users/[userId]) blocks
// a coach from changing their own role or deleting their own account, so
// they can't lock themselves out of this page or the app.
export function AdminUsersView({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftEmail, setDraftEmail] = useState('')

  function startEdit(u: AdminUser) {
    setError(null)
    setEditingId(u.id)
    setDraftName(u.name ?? '')
    setDraftEmail(u.email)
  }

  async function saveEdit(u: AdminUser) {
    setError(null)
    setPendingId(u.id)
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draftName, email: draftEmail }),
    })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось сохранить изменения')
      return
    }

    const updated = await res.json()
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, name: updated.name, email: updated.email } : x))
    )
    setEditingId(null)
  }

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

    setUsers((prev) => prev.map((x) => (x.id === target.id ? { ...x, role: nextRole } : x)))
  }

  // For an ATHLETE who already has a real account but no coach yet (self-
  // registered, or matched by email without ever going through the invite
  // flow) — attaches the signed-in coach directly, no email involved.
  async function attachToMe(target: AdminUser) {
    setError(null)
    setPendingId(target.id)
    const res = await fetch(`/api/admin/users/${target.id}/attach-coach`, { method: 'POST' })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось прикрепить атлета')
      return
    }

    const updated = await res.json()
    setUsers((prev) =>
      prev.map((x) =>
        x.id === target.id && x.athleteProfile
          ? { ...x, athleteProfile: { ...x.athleteProfile, coachId: updated.coachId } }
          : x
      )
    )
  }

  async function deleteUser(target: AdminUser) {
    setError(null)

    const label = target.name ?? target.email
    let confirmMessage: string
    if (target.role === 'ATHLETE') {
      confirmMessage =
        `Удалить пользователя «${label}» насовсем? Это удалит ВСЕ его циклы, ` +
        `тренировки, подходы и 1ПМ без возможности восстановления.`
    } else if (target._count.coachedAthletes > 0) {
      confirmMessage =
        `У «${label}» ${target._count.coachedAthletes} атлет(ов) — при удалении ` +
        `они будут отвязаны от тренера (их данные не пострадают), затем аккаунт ` +
        `тренера будет удалён насовсем. Продолжить?`
    } else {
      confirmMessage = `Удалить пользователя «${label}» насовсем?`
    }
    if (!window.confirm(confirmMessage)) return

    setPendingId(target.id)
    const res = await fetch(`/api/admin/users/${target.id}`, { method: 'DELETE' })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось удалить пользователя')
      return
    }

    setUsers((prev) => prev.filter((x) => x.id !== target.id))
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {users.map((u) => (
          <li key={u.id}>
            <Card padding="sm" className="space-y-2">
              {editingId === u.id ? (
                <div className="space-y-2">
                  <Input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Имя"
                    fieldSize="sm"
                    className="w-full"
                  />
                  <Input
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    placeholder="Email"
                    fieldSize="sm"
                    className="w-full"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pendingId === u.id}
                      onClick={() => saveEdit(u)}
                      className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" /> Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-danger"
                    >
                      <X className="h-3.5 w-3.5" /> Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name ?? u.email}</p>
                    <p className="truncate text-xs text-text-secondary">{u.email}</p>
                    {u.role === 'COACH' && u._count.coachedAthletes > 0 && (
                      <p className="text-xs text-text-secondary">
                        {u._count.coachedAthletes} атлет(ов)
                      </p>
                    )}
                    {u.role === 'ATHLETE' && <div className="mt-1">{inviteBadge(u)}</div>}
                    {u.role === 'ATHLETE' && u.athleteProfile && !u.athleteProfile.coachId && (
                      <button
                        type="button"
                        disabled={pendingId === u.id}
                        onClick={() => attachToMe(u)}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline disabled:opacity-50"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {pendingId === u.id ? 'Прикрепляем…' : 'Прикрепить к себе'}
                      </button>
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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(u)}
                        aria-label="Редактировать пользователя"
                        title="Редактировать пользователя"
                        className="text-text-secondary transition-colors hover:text-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          disabled={pendingId === u.id}
                          onClick={() => deleteUser(u)}
                          aria-label="Удалить пользователя"
                          title="Удалить пользователя"
                          className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
