'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog, useToast } from '@/components/ui'

type Props = {
  planId: string
  planName: string
  // Where to send the user after a successful delete. If omitted, just
  // refreshes the current page (used on the plans list, where the card
  // simply disappears).
  redirectTo?: string
}

// Coach-only delete action. Confirms first (destructive, cascades every
// week/workout/exercise/set under the plan), then calls the DELETE API and
// either refreshes or redirects. Mirrors DeleteCycleButton.
export function GymDeletePlanButton({ planId, planName, redirectTo }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setConfirmOpen(false)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/gym/plans/${planId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: `План «${planName}» удалён`, variant: 'success' })
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <Button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setConfirmOpen(true)
        }}
        disabled={loading}
        variant="danger"
        size="sm"
      >
        {loading ? 'Удаление...' : 'Удалить'}
      </Button>
      {error && <span className="ml-2 text-xs text-danger">{error}</span>}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Удалить план?"
        description={`«${planName}» — удалятся все недели, тренировки и подходы внутри него. Действие необратимо.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Удалить
          </Button>
        </div>
      </Dialog>
    </span>
  )
}
