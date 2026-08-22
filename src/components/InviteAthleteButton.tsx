'use client'

import { useState } from 'react'
import { Button, Input, useToast } from '@/components/ui'

type Props = {
  athleteId: string
  inviteEmail: string | null
  onSent?: () => void
}

// Sends (or resends) the invite email for a coach-created placeholder athlete.
// Not destructive, so no confirm dialog — unlike DeleteCycleButton.
//
// A placeholder can exist with no inviteEmail yet (e.g. imported without one).
// Clicking "Отправить" in that state used to hit the invite API anyway, which
// only fails server-side — worse, an empty `to` reaching the mailer can bounce
// back into the coach's own inbox, reading as "an invite sent to myself."
// Instead, no email means we never call the invite API at all: clicking drops
// into an inline edit form so the coach fills in the email first, with an
// explicit Отмена to back out without saving anything.
export function InviteAthleteButton({ athleteId, inviteEmail, onSent }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftEmail, setDraftEmail] = useState('')

  async function sendInvite() {
    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/invite`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось отправить приглашение')
      }
      toast({ title: 'Приглашение отправлено', variant: 'success' })
      onSent?.()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось отправить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    if (!inviteEmail) {
      setDraftEmail('')
      setEditing(true)
      return
    }
    sendInvite()
  }

  async function handleSaveAndSend() {
    const email = draftEmail.trim()
    if (!email) {
      toast({ title: 'Укажите email', variant: 'error' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
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

  if (editing) {
    return (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={draftEmail}
          onChange={(e) => setDraftEmail(e.target.value)}
          placeholder="athlete@example.com"
          fieldSize="sm"
          autoFocus
          className="flex-1"
        />
        <div className="flex shrink-0 gap-2">
          <Button onClick={handleSaveAndSend} disabled={loading} size="sm">
            {loading ? 'Отправляю...' : 'Отправить'}
          </Button>
          <Button onClick={() => setEditing(false)} disabled={loading} variant="outline" size="sm">
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
