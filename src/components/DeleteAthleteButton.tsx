'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button, Dialog, useToast } from '@/components/ui'

type Props = {
  athleteId: string
  athleteName: string
  // Whether this athlete has accepted their invite (has a real account) —
  // changes both the confirm wording (a pending placeholder has nothing to
  // lose but its own row; an accepted athlete's cycles/workouts/sets/1RM go
  // with it) and how destructive this actually is.
  accepted: boolean
  onDeleted: () => void
}

// Coach-only. Covers both athlete states — pending invite (placeholder,
// never signed in) and already-accepted (real account) — since neither
// currently had a delete path from this page: a pending placeholder has no
// User row at all, so it never showed up in the admin panel's user list;
// an accepted athlete could only be removed by going to Админка.
export function DeleteAthleteButton({ athleteId, athleteName, accepted, onDeleted }: Props) {
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: `«${athleteName}» удалён`, variant: 'success' })
      onDeleted()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        title="Удалить атлета"
        aria-label="Удалить атлета"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-on-danger shadow-card transition-transform hover:scale-110 hover:brightness-110 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Удалить атлета?"
        description={
          accepted
            ? `«${athleteName}» уже принял приглашение — удаление сотрёт ВСЕ его циклы, тренировки, подходы и 1ПМ без возможности восстановления.`
            : `«${athleteName}» ещё не принял приглашение. Страница атлета удалится без возможности восстановления.`
        }
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
