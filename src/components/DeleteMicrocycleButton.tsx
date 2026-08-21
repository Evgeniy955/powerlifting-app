'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, Dialog, useToast } from '@/components/ui'

type Props = {
  microcycleId: string
  weekNumber: number
}

// Coach-only delete action for one microcycle (week) on the cycle's plan
// page. Confirms first (destructive, cascades every workout/set inside the
// week), then calls the DELETE API and refreshes — mirrors DeleteCycleButton,
// scoped one level down.
export function DeleteMicrocycleButton({ microcycleId, weekNumber }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/microcycles/${microcycleId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: `Микроцикл ${weekNumber} удалён`, variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        onClick={(e) => {
          e.preventDefault()
          setConfirmOpen(true)
        }}
        disabled={loading}
        variant="ghost"
        size="sm"
        aria-label={`Удалить микроцикл ${weekNumber}`}
        className="shrink-0 text-text-secondary hover:text-danger"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Удалить микроцикл?"
        description={`«Микроцикл ${weekNumber}» — удалятся все тренировки и подходы внутри него. Действие необратимо.`}
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
    </>
  )
}
