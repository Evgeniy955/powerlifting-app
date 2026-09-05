'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, useToast } from '@/components/ui'

type Props = {
  clientId: string
  inviteEmail: string | null
}

// Sends (or resends) the invite email for a gym client. Gym-mode counterpart
// of InviteAthleteButton — same "no email yet -> inline edit form" flow, see
// that component for the reasoning. Sits in a server-rendered list
// (src/app/gym/athletes/page.tsx), so success refreshes the route instead of
// calling back into client-side list state.
export function GymInviteClientButton({ clientId, inviteEmail }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftEmail, setDraftEmail] = useState('')

  async function sendInvite() {
    setLoading(true)
    try {
      const res = await fetch(`/api/gym/clients/${clientId}/invite`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось отправить приглашение')
      }
      toast({ title: 'Приглашение отправлено', variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось отправить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!inviteEmail) {
      setDraftEmail('')
      setEditing(true)
      return
    }
    void sendInvite()
  }

  async function handleSaveAndSend(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const email = draftEmail.trim()
    if (!email) {
      toast({ title: 'Укажите email', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/gym/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteEmail: email }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить email')
      }
      setEditing(false)
      await sendInvite()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditing(false)
  }

  if (editing) {
    return (
      <div
        className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
        onClick={(e) => e.preventDefault()}
      >
        <Input
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          placeholder="client@example.com"
          fieldSize="sm"
          autoFocus
          className="flex-1"
        />
        <div className="flex shrink-0 gap-2">
          <Button onClick={handleSaveAndSend} disabled={loading} size="sm">
            {loading ? 'Отправляю...' : 'Отправить'}
          </Button>
          <Button onClick={handleCancel} disabled={loading} variant="outline" size="sm">
            Отмена
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button onClick={handleClick} disabled={loading} variant="secondary" size="sm">
      {loading ? 'Отправляю...' : 'Отправить приглашение'}
    </Button>
  )
}
