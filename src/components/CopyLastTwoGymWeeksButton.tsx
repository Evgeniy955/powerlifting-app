'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, useToast } from '@/components/ui'

type Props = {
  planId: string
  role: 'COACH' | 'ATHLETE'
}

// "Копировать последние 2 недели" — visible and callable by the coach only.
// The API route also enforces this server-side, but hiding it client-side
// avoids showing clients a control they aren't allowed to use. Mirrors
// CopyLastTwoWeeksButton on the powerlifting side.
export function CopyLastTwoGymWeeksButton({ planId, role }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (role !== 'COACH') return null

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gym/plans/${planId}/duplicate-last-two-weeks`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось скопировать')
      }
      toast({ title: 'Недели скопированы', variant: 'success' })
      // The new weeks are written server-side, but this page's server
      // component render is cached until told otherwise — without this the
      // new weeks only showed up after a manual reload.
      router.refresh()
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
      <Button onClick={handleClick} disabled={loading} variant="secondary" size="sm">
        {loading ? 'Копирую...' : 'Копировать последние 2 недели'}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
