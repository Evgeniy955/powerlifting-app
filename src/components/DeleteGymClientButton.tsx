'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, Dialog, useToast } from '@/components/ui'
import { wardNoun } from '@/lib/gender'

type Props = {
  clientId: string
  clientName: string
  // Whether this client has accepted their invite (has a real account) —
  // changes the confirmation wording, same reasoning as DeleteAthleteButton.
  accepted: boolean
}

// Gym-mode counterpart of DeleteAthleteButton. Simpler than that one: no
// archive step, because GymClient has no archivedAt/soft-delete concept —
// DELETE /api/gym/clients/:id is always a permanent removal. Sits in a
// server-rendered list (src/app/gym/athletes/page.tsx), so success refreshes
// the route instead of calling back into client-side list state — same
// pattern as GymInviteClientButton.
export function DeleteGymClientButton({ clientId, clientName, accepted }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/gym/clients/${clientId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Не удалось удалить ${wardNoun(clientName, 'accusative')}`)
      }
      toast({ title: `«${clientName}» удалён`, variant: 'success' })
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const dialogDescription = accepted
    ? `«${clientName}» уже принял приглашение — удаление сотрёт ВСЕ его планы, максимумы и данные о здоровье без возможности восстановления.`
    : `Профиль «${clientName}» будет удалён без возможности восстановления.`

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setConfirmOpen(true)
        }}
        disabled={loading}
        title={`Удалить ${wardNoun(clientName, 'accusative')}`}
        aria-label={`Удалить ${wardNoun(clientName, 'accusative')}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-on-danger shadow-card transition-transform hover:scale-110 hover:brightness-110 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} title={`Удалить ${wardNoun(clientName, 'accusative')}?`} description={dialogDescription}>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm}>
            Удалить
          </Button>
        </div>
      </Dialog>
    </>
  )
}
