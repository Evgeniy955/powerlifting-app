'use client'

import { useState } from 'react'
import { Button, useToast } from '@/components/ui'

type Props = {
  cycleId: string
  role: 'COACH' | 'ATHLETE'
  onDone?: () => void
}

// "Копировать последние 2 недели" — visible and callable by the coach only.
// The API route also enforces this server-side, but hiding it client-side avoids
// showing athletes a control they aren't allowed to use.
export function CopyLastTwoWeeksButton({ cycleId, role, onDone }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (role !== 'COACH') return null

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cycles/${cycleId}/duplicate-last-two-weeks`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось скопировать')
      }
      toast({ title: 'Недели скопированы', variant: 'success' })
      onDone?.()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось скопировать', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={handleClick} disabled={loading} variant="secondary">
        {loading ? 'Копирую...' : 'Копировать последние 2 недели'}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
