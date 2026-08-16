'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Dialog, useToast } from '@/components/ui'

type Props = {
  cycleId: string
  cycleName: string
  // Where to send the user after a successful delete. If omitted, just refreshes
  // the current page (used on the cycles list, where the row simply disappears).
  redirectTo?: string
}

// Coach-only delete action. Confirms first (destructive, cascades every workout/set
// under the cycle), then calls the DELETE API and either refreshes or redirects.
export function DeleteCycleButton({ cycleId, cycleName, redirectTo }: Props) {
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
      const res = await fetch(`/api/cycles/${cycleId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: `Цикл «${cycleName}» удалён`, variant: 'success' })
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
    <span className="inline-flex items-center">
      <Button onClick={() => setConfirmOpen(true)} disabled={loading} variant="danger" size="sm">
        {loading ? 'Удаление...' : 'Удалить'}
      </Button>
      {error && <span className="ml-2 text-xs text-danger">{error}</span>}

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Удалить цикл?"
        description={`«${cycleName}» — удалятся все недели, тренировки и подходы внутри него. Действие необратимо.`}
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
