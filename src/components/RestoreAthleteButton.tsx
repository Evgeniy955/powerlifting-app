'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useToast } from '@/components/ui'

type Props = {
  athleteId: string
  athleteName: string
  onDone: () => void
}

// Archive-screen only. Clears archivedAt, putting the athlete back on the
// normal /athletes roster. No confirmation dialog — restoring is
// non-destructive, unlike the delete-forever action next to it.
export function RestoreAthleteButton({ athleteId, athleteName, onDone }: Props) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  async function handleRestore() {
    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/restore`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось восстановить')
      }
      toast({ title: `«${athleteName}» восстановлен`, variant: 'success' })
      onDone()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось восстановить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={loading}
      title="Восстановить из архива"
      aria-label="Восстановить из архива"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-card transition-transform hover:scale-110 hover:brightness-110 disabled:opacity-50"
    >
      <RotateCcw className="h-4 w-4" />
    </button>
  )
}
