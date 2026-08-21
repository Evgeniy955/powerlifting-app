'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button, useToast } from '@/components/ui'

type Props = {
  cycleId: string
}

// "+ Добавить микроцикл" — coach-only (the API route enforces this too, and
// the only call site already gates rendering on role). Appends one empty week
// at the end of the plan; the coach fills in its training days afterward from
// the new week's own page. Counterpart to DeleteMicrocycleButton.
export function AddMicrocycleButton({ cycleId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/cycles/${cycleId}/microcycles`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось добавить микроцикл')
      }
      toast({ title: 'Микроцикл добавлен', variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось добавить микроцикл', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} variant="outline" size="sm">
      <Plus className="h-4 w-4" /> {loading ? 'Добавляю...' : 'Добавить микроцикл'}
    </Button>
  )
}
