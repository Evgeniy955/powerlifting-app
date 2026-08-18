'use client'

import { useState } from 'react'
import { Check, Mail, Pencil, X } from 'lucide-react'
import { Badge, Card, Input, useToast } from '@/components/ui'

export type PendingInvite = {
  id: string
  displayName: string | null
  inviteEmail: string | null
  inviteStatus: string
  invitedAt: string | Date | null
  coach: { name: string | null; email: string } | null
}

type Props = { initialInvites: PendingInvite[] }

// Placeholder athletes (userId still null) shown on /admin/users so a coach
// can resend an invite — or edit the email first if it was mistyped/changed —
// without hunting down the athlete's own card. Mirrors AdminUsersView's
// inline-edit pattern, plus a resend action.
export function AdminPendingInvites({ initialInvites }: Props) {
  const toast = useToast()
  const [invites, setInvites] = useState(initialInvites)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftEmail, setDraftEmail] = useState('')

  function startEdit(inv: PendingInvite) {
    setError(null)
    setEditingId(inv.id)
    setDraftName(inv.displayName ?? '')
    setDraftEmail(inv.inviteEmail ?? '')
  }

  async function sendInvite(id: string) {
    setError(null)
    setPendingId(id)
    const res = await fetch(`/api/admin/pending-invites/${id}`, { method: 'POST' })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось отправить приглашение')
      return
    }

    const { invitedAt } = await res.json()
    setInvites((prev) =>
      prev.map((x) => (x.id === id ? { ...x, inviteStatus: 'PENDING', invitedAt } : x))
    )
    toast({ title: 'Приглашение отправлено', variant: 'success' })
  }

  async function saveEdit(inv: PendingInvite) {
    setError(null)
    const emailChanged = draftEmail.trim().toLowerCase() !== (inv.inviteEmail ?? '').toLowerCase()

    setPendingId(inv.id)
    const res = await fetch(`/api/admin/pending-invites/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: draftName, inviteEmail: draftEmail }),
    })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось сохранить изменения')
      return
    }

    const updated = await res.json()
    setInvites((prev) =>
      prev.map((x) =>
        x.id === inv.id ? { ...x, displayName: updated.displayName, inviteEmail: updated.inviteEmail } : x
      )
    )
    setEditingId(null)

    // Email is the whole point of an invite — if it changed, ask before
    // sending anything rather than silently mailing the new address.
    if (emailChanged) {
      const ok = window.confirm(`Отправить приглашение на новую почту «${updated.inviteEmail}»?`)
      if (ok) await sendInvite(inv.id)
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {invites.map((inv) => (
          <li key={inv.id}>
            <Card padding="sm" className="space-y-2">
              {editingId === inv.id ? (
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
                      disabled={pendingId === inv.id}
                      onClick={() => saveEdit(inv)}
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
                    <p className="truncate font-medium">
                      {inv.displayName ?? inv.inviteEmail ?? 'Без имени'}
                    </p>
                    <p className="truncate text-xs text-text-secondary">{inv.inviteEmail}</p>
                    {inv.coach && (
                      <p className="truncate text-xs text-text-secondary">
                        Тренер: {inv.coach.name ?? inv.coach.email}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={inv.inviteStatus === 'PENDING' ? 'moderate' : 'neutral'}>
                      {inv.inviteStatus === 'PENDING' ? 'Приглашение отправлено' : 'Не приглашён'}
                    </Badge>

                    <button
                      type="button"
                      disabled={pendingId === inv.id || !inv.inviteEmail}
                      onClick={() => sendInvite(inv.id)}
                      className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {pendingId === inv.id
                        ? 'Отправляем…'
                        : inv.inviteStatus === 'PENDING'
                          ? 'Отправить ещё раз'
                          : 'Отправить приглашение'}
                    </button>

                    <button
                      type="button"
                      onClick={() => startEdit(inv)}
                      aria-label="Редактировать приглашение"
                      title="Редактировать приглашение"
                      className="text-text-secondary transition-colors hover:text-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
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
