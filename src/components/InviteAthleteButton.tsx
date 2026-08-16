'use client'

import { useState } from 'react'
import { Button, useToast } from '@/components/ui'

type Props = {
  athleteId: string
  onSent?: () => void
}

// Sends (or resends) the invite email for a coach-created placeholder athlete.
// Not destructive, so no confirm dialog — unlike DeleteCycleButton.
export function InviteAthleteButton({ athleteId, onSent }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
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

  return (
    <Button onClick={handleClick} disabled={loading} variant="secondary" size="sm">
      {loading ? 'Отправляю...' : 'Отправить приглашение'}
    </Button>
  )
}
